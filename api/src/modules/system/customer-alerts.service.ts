import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';
import { MailService } from '../mail/mail.service';
import { NotificationService } from '../notifications/notification.service';
import { panelBaseUrl } from '../../common/utils/panel-url';

interface AlertState {
  q80?: boolean;
  q100?: boolean;
  /** Date d'expiration (ISO) pour laquelle l'alerte « expire bientôt » a été envoyée. */
  soon?: string;
  /** Date d'expiration (ISO) pour laquelle l'alerte « expiré » a été envoyée. */
  expired?: string;
}

type Kind = 'quota80' | 'quota100' | 'soon' | 'expired';

const TICK_MS = 10 * 60_000;
const SOON_MS = 3 * 24 * 3600_000;
const MAX_MAILS_PER_TICK = 200;

const TEXTS: Record<'fr' | 'en', Record<Kind, { subject: string; body: string }>> = {
  fr: {
    quota80: { subject: 'Votre proxy « {label} » a consommé {pct} % de son quota', body: 'Le compte proxy <b>{label}</b> a utilisé <b>{used} Go</b> sur <b>{total} Go</b> ({pct} %). Pensez à recharger ou à contacter votre fournisseur avant d’atteindre la limite.' },
    quota100: { subject: 'Quota atteint pour votre proxy « {label} »', body: 'Le compte proxy <b>{label}</b> a atteint son quota (<b>{total} Go</b>) : les connexions sont refusées tant que le trafic n’est pas réinitialisé ou la limite augmentée.' },
    soon: { subject: 'Votre proxy « {label} » expire bientôt', body: 'Le compte proxy <b>{label}</b> expire le <b>{date}</b>. Renouvelez-le pour éviter une interruption.' },
    expired: { subject: 'Votre proxy « {label} » a expiré', body: 'Le compte proxy <b>{label}</b> a expiré le <b>{date}</b> : les connexions sont refusées. Contactez votre fournisseur pour le renouveler.' },
  },
  en: {
    quota80: { subject: 'Your proxy “{label}” has used {pct}% of its quota', body: 'The proxy account <b>{label}</b> has used <b>{used} GB</b> of <b>{total} GB</b> ({pct}%). Consider topping up or contacting your provider before the limit is reached.' },
    quota100: { subject: 'Quota reached for your proxy “{label}”', body: 'The proxy account <b>{label}</b> has reached its quota (<b>{total} GB</b>): connections are refused until traffic is reset or the limit is raised.' },
    soon: { subject: 'Your proxy “{label}” expires soon', body: 'The proxy account <b>{label}</b> expires on <b>{date}</b>. Renew it to avoid an interruption.' },
    expired: { subject: 'Your proxy “{label}” has expired', body: 'The proxy account <b>{label}</b> expired on <b>{date}</b>: connections are refused. Contact your provider to renew it.' },
  },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/**
 * Alertes aux propriétaires de comptes proxy (rôle « utilisateur » du panel) : quota à 80 % et 100 %, expiration proche
 * (3 jours) et expiration atteinte. Une alerte n'est envoyée qu'UNE fois par événement (état mémorisé dans
 * `UserProxy.alertState`, réarmé si le quota repasse sous 80 % ou si la date d'expiration change). Cloche du panel
 * toujours ; e-mail si le SMTP est configuré. Désactivable : Paramètres → E-mail.
 */
@Injectable()
export class CustomerAlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CustomerAlertsService.name);
  private timer: NodeJS.Timeout | null = null;
  private starter: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    this.starter = setTimeout(() => {
      this.timer = setInterval(() => void this.tick(), TICK_MS);
      this.timer.unref?.();
      void this.tick();
    }, 120_000);
    this.starter.unref?.();
  }

  onModuleDestroy() {
    if (this.starter) clearTimeout(this.starter);
    if (this.timer) clearInterval(this.timer);
  }

  private lang(): 'fr' | 'en' {
    return this.settings.get('defaultLang') === 'en' ? 'en' : 'fr';
  }

  /** Une passe : exposée pour les tests. Renvoie le nombre d'alertes envoyées. */
  async tick(): Promise<number> {
    if (this.running || !this.settings.getBool('customerAlertsEnabled')) return 0;
    this.running = true;
    let sent = 0;
    try {
      const accounts = await this.prisma.userProxy.findMany({
        where: { ownerId: { not: null }, OR: [{ totalGb: { gt: 0 } }, { expiresAt: { not: null } }] },
        select: {
          id: true,
          name: true,
          totalGb: true,
          usedGb: true,
          expiresAt: true,
          alertState: true,
          ownerId: true,
          owner: { select: { email: true, isActive: true } },
        },
      });
      const now = Date.now();
      for (const a of accounts) {
        if (!a.owner?.isActive || !a.ownerId) continue;
        let state: AlertState = {};
        try {
          state = a.alertState ? (JSON.parse(a.alertState) as AlertState) : {};
        } catch {
          state = {};
        }
        const before = JSON.stringify(state);
        const todo: Kind[] = [];

        if (a.totalGb > 0) {
          const ratio = a.usedGb / a.totalGb;
          if (ratio < 0.8) {
            delete state.q80;
            delete state.q100;
          } else if (ratio < 1) {
            delete state.q100;
            if (!state.q80) todo.push('quota80');
          } else if (!state.q100) {
            todo.push('quota100');
          }
        }
        if (a.expiresAt) {
          const iso = a.expiresAt.toISOString();
          const left = a.expiresAt.getTime() - now;
          if (left <= 0) {
            if (state.expired !== iso) todo.push('expired');
          } else if (left <= SOON_MS) {
            if (state.soon !== iso) todo.push('soon');
          }
        }

        for (const kind of todo) {
          if (sent >= MAX_MAILS_PER_TICK) break;
          await this.send(kind, a);
          sent++;
          if (kind === 'quota80') state.q80 = true;
          if (kind === 'quota100') {
            state.q100 = true;
            state.q80 = true;
          }
          if (kind === 'soon' && a.expiresAt) state.soon = a.expiresAt.toISOString();
          if (kind === 'expired' && a.expiresAt) state.expired = a.expiresAt.toISOString();
        }
        const after = JSON.stringify(state);
        if (after !== before) {
          await this.prisma.userProxy.update({ where: { id: a.id }, data: { alertState: after === '{}' ? null : after } });
        }
      }
    } catch (e) {
      this.logger.error(`Alertes clients : ${e}`);
    } finally {
      this.running = false;
    }
    if (sent) this.logger.log(`${sent} alerte(s) client envoyée(s).`);
    return sent;
  }

  private async send(
    kind: Kind,
    a: { name: string; totalGb: number; usedGb: number; expiresAt: Date | null; ownerId: string | null; owner: { email: string } | null },
  ) {
    const t = TEXTS[this.lang()][kind];
    const vals: Record<string, string> = {
      label: a.name.replace(/\s+/g, ' ').slice(0, 80),
      used: a.usedGb.toFixed(2),
      total: a.totalGb.toFixed(a.totalGb % 1 ? 1 : 0),
      pct: a.totalGb > 0 ? String(Math.min(999, Math.round((a.usedGb / a.totalGb) * 100))) : '0',
      date: a.expiresAt ? a.expiresAt.toLocaleDateString(this.lang() === 'en' ? 'en-GB' : 'fr-FR') : '',
    };
    const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? '');
    const subject = fill(t.subject);
    const plain = fill(t.body).replace(/<\/?b>/g, '');

    await this.notifications.createInApp({
      userId: a.ownerId ?? undefined,
      type: kind === 'quota80' || kind === 'soon' ? 'warning' : 'error',
      title: subject,
      message: plain,
      link: '/',
    });

    if (this.mail.isConfigured() && a.owner?.email) {
      const base = panelBaseUrl(this.settings);
      const link = base ? `<p><a href="${esc(base)}">${esc(base)}</a></p>` : '';
      // Le libellé vient d'un administrateur : échappé avant d'entrer dans le HTML.
      const safe = t.body.replace(/\{(\w+)\}/g, (_, k) => esc(vals[k] ?? ''));
      const html = `<p>${safe}</p>${link}`;
      await this.mail.send({ to: a.owner.email, subject, html });
    }
  }
}
