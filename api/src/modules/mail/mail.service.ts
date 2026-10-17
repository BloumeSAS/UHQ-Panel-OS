import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../config/settings.service';
import { panelBaseUrl } from '../../common/utils/panel-url';
import * as nodemailer from 'nodemailer';
import { MAIL_TEMPLATES, MAIL_TEMPLATE_BY_ID, MailTemplateDef } from './mail-templates';

type Lang = 'fr' | 'en';

/** Échappe une valeur avant interpolation dans un corps d'e-mail HTML — `ip`/`userAgent` viennent de la requête cliente. */
export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ACCENT = '#f97316';

interface Override {
  enabled?: boolean;
  subject?: Partial<Record<Lang, string>>;
  body?: Partial<Record<Lang, string>>;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly settings: SettingsService) {}

  /** Crée un transport nodemailer depuis la config SMTP courante. */
  private createTransport() {
    const host = this.settings.get('smtpHost');
    if (!host) return null;
    return nodemailer.createTransport({
      host,
      port: this.settings.getNumber('smtpPort'),
      secure: this.settings.getBool('smtpSecure'),
      auth: {
        user: this.settings.get('smtpUser') || undefined,
        pass: this.settings.get('smtpPass') || undefined,
      },
    });
  }

  /** true si SMTP est configuré (host renseigné). */
  isConfigured(): boolean {
    return !!this.settings.get('smtpHost');
  }

  // ───────────────────────────── Réglages des modèles ─────────────────────────────

  private overrides(): Record<string, Override> {
    try {
      const raw = this.settings.get('emailTemplates');
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private lang(preferred?: string): Lang {
    const l = (preferred || this.settings.get('emailLanguage') || 'fr').toLowerCase();
    return l === 'en' ? 'en' : 'fr';
  }

  /** L'envoi est-il activé ? Interrupteur du modèle, sinon ancien réglage lié, sinon valeur par défaut. */
  isEnabled(id: string): boolean {
    const def = MAIL_TEMPLATE_BY_ID.get(id);
    if (!def) return false;
    if (def.controlledBy) return this.settings.getBool(def.controlledBy as any);
    const o = this.overrides()[id];
    if (typeof o?.enabled === 'boolean') return o.enabled;
    if (def.legacyFlag) return this.settings.getBool(def.legacyFlag as any);
    return def.defaultEnabled;
  }

  /** Catalogue pour la page Paramètres (textes effectifs FR/EN, état, personnalisation). */
  catalog() {
    const ov = this.overrides();
    return MAIL_TEMPLATES.map((d) => {
      const o = ov[d.id] ?? {};
      return {
        id: d.id,
        group: d.group,
        audience: d.audience,
        enabled: this.isEnabled(d.id),
        toggleLocked: !!d.controlledBy,
        controlledBy: d.controlledBy ?? null,
        editable: !d.fixedBody,
        addon: !!d.addon,
        vars: d.vars,
        subject: { fr: o.subject?.fr ?? d.subject.fr, en: o.subject?.en ?? d.subject.en },
        body: { fr: o.body?.fr ?? d.body.fr, en: o.body?.en ?? d.body.en },
        defaults: { subject: d.subject, body: d.body },
        customized: !!(o.subject?.fr || o.subject?.en || o.body?.fr || o.body?.en),
      };
    });
  }

  /** Enregistre l'interrupteur et/ou les textes d'un modèle (valeurs bornées ; texte vide = retour au défaut). */
  async saveTemplate(id: string, patch: { enabled?: boolean; subject?: Partial<Record<Lang, string>>; body?: Partial<Record<Lang, string>>; reset?: boolean }): Promise<boolean> {
    const def = MAIL_TEMPLATE_BY_ID.get(id);
    if (!def) return false;
    const all = this.overrides();
    const cur: Override = patch.reset ? {} : { ...(all[id] ?? {}) };
    if (typeof patch.enabled === 'boolean' && !def.controlledBy) cur.enabled = patch.enabled;
    if (!def.fixedBody) {
      for (const field of ['subject', 'body'] as const) {
        const p = patch[field];
        if (!p) continue;
        const max = field === 'subject' ? 200 : 5000;
        const next = { ...(cur[field] ?? {}) };
        for (const l of ['fr', 'en'] as const) {
          if (typeof p[l] !== 'string') continue;
          const v = p[l]!.replace(/\r\n/g, '\n').slice(0, max);
          if (!v.trim() || v === def[field][l]) delete next[l];
          else next[l] = v;
        }
        cur[field] = next;
      }
    }
    const empty = typeof cur.enabled !== 'boolean' && !cur.subject?.fr && !cur.subject?.en && !cur.body?.fr && !cur.body?.en;
    if (empty) delete all[id];
    else all[id] = cur;
    await this.settings.set('emailTemplates' as any, JSON.stringify(all));
    return true;
  }

  // ───────────────────────────── Rendu ─────────────────────────────

  private substitute(text: string, vars: Record<string, string>): string {
    // Texte déjà échappé : on remplace {nom} par la valeur échappée (jamais interprétée comme du markup).
    return text.replace(/\{(\w+)\}/g, (_m, k: string) => escapeHtml(vars[k] ?? ''));
  }

  /** Convertit le texte d'un modèle en HTML sûr (paragraphes, **gras**, boutons, variables échappées). */
  renderBody(text: string, vars: Record<string, string>): string {
    const paras = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    return paras
      .map((p) => {
        const btn = /^\[\[(.+?)\|(.+?)\]\]$/.exec(p);
        if (btn) {
          const url = btn[2].replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '').trim();
          const label = this.substitute(escapeHtml(btn[1]), vars);
          if (/^https?:\/\/[^\s"'<>]+$/i.test(url)) {
            const href = escapeHtml(url);
            return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;padding:12px 22px;background:${ACCENT};color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${label}</a></p><p style="margin:0 0 16px;color:#888;font-size:12px;word-break:break-all">${href}</p>`;
          }
          return `<p style="margin:0 0 16px">${label}</p>`;
        }
        const html = escapeHtml(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        return `<p style="margin:0 0 16px;line-height:1.55">${this.substitute(html, vars)}</p>`;
      })
      .join('');
  }

  private logoSrc(previewBase?: string): string | null {
    const logo = this.settings.get('logoUrl').trim();
    if (!logo) return null;
    if (/^https?:\/\//i.test(logo)) return logo;
    if (logo.startsWith('/')) {
      const base = previewBase || panelBaseUrl(this.settings);
      return base ? `${base}${logo}` : null;
    }
    return null; // data: URL et autres : bloqués par la plupart des clients mail
  }

  /** Habillage commun à TOUS les e-mails : logo + nom du site, texte d'en-tête, contenu, pied de page personnalisable + mention fixe. */
  wrap(contentHtml: string, previewBase?: string): string {
    const siteName = escapeHtml(this.settings.get('siteName') || 'UHQ Panel OS');
    const logo = this.logoSrc(previewBase);
    const headerText = escapeHtml(this.settings.get('emailHeaderText').trim());
    const footerText = escapeHtml(this.settings.get('emailFooterText').trim()).replace(/\n/g, '<br>');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
<tr><td style="padding:22px 28px;border-bottom:3px solid ${ACCENT}">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
${logo ? `<td style="padding-right:12px"><img src="${escapeHtml(logo)}" alt="" width="40" height="40" style="display:block;border-radius:8px;width:40px;height:40px;object-fit:contain"></td>` : ''}
<td><div style="font-size:18px;font-weight:700;line-height:1.2">${siteName}</div>${headerText ? `<div style="font-size:12px;color:#71717a;margin-top:2px">${headerText}</div>` : ''}</td>
</tr></table></td></tr>
<tr><td style="padding:28px;font-size:15px">${contentHtml}</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #f0f0f2;font-size:12px;color:#71717a;text-align:center">
${footerText ? `<div style="margin-bottom:8px">${footerText}</div>` : ''}
<div style="font-size:11px;color:#a1a1aa">UHQ Panel OS by <a href="https://bloume.fr" style="color:#a1a1aa">Bloume.fr</a></div>
</td></tr></table></td></tr></table></body></html>`;
  }

  private baseVars(extra: Record<string, string> = {}): Record<string, string> {
    return { siteName: this.settings.get('siteName') || 'UHQ Panel OS', ...extra };
  }

  /** Sujet + HTML finaux d'un modèle (utilisé pour l'envoi ET pour l'aperçu). */
  renderTemplate(id: string, vars: Record<string, string>, lang?: string): { subject: string; html: string } | null {
    const def = MAIL_TEMPLATE_BY_ID.get(id);
    if (!def) return null;
    const l = this.lang(lang);
    const o = this.overrides()[id] ?? {};
    const v = this.baseVars(vars);
    const subjectTpl = o.subject?.[l] ?? def.subject[l];
    const bodyTpl = o.body?.[l] ?? def.body[l];
    const subject = subjectTpl.replace(/\{(\w+)\}/g, (_m, k: string) => String(v[k] ?? '').replace(/[\r\n]+/g, ' ')).slice(0, 200);
    return { subject, html: this.wrap(this.renderBody(bodyTpl, v)) };
  }

  /** Aperçu avec les valeurs d'exemple (ou celles fournies). */
  preview(id: string, lang?: string, override?: { subject?: string; body?: string }, previewBase?: string) {
    const def = MAIL_TEMPLATE_BY_ID.get(id);
    if (!def) return null;
    const l = this.lang(lang);
    const v = this.baseVars(def.sample);
    const subjectTpl = override?.subject ?? (this.overrides()[id]?.subject?.[l] ?? def.subject[l]);
    const bodyTpl = override?.body ?? (this.overrides()[id]?.body?.[l] ?? def.body[l]);
    const subject = subjectTpl.replace(/\{(\w+)\}/g, (_m, k: string) => String(v[k] ?? '').replace(/[\r\n]+/g, ' ')).slice(0, 200);
    return { subject: `[${v.siteName}] ${subject}`, html: this.wrap(this.renderBody(bodyTpl.slice(0, 5000), v), previewBase) };
  }

  // ───────────────────────────── Envoi ─────────────────────────────

  /** Envoie un e-mail générique, habillé (en-tête / pied de page communs). Renvoie false si SMTP non configuré ou en erreur. */
  async send(opts: { to: string; subject: string; html: string; wrapped?: boolean }): Promise<boolean> {
    const transport = this.createTransport();
    if (!transport) {
      this.logger.warn('SMTP non configuré — e-mail ignoré.');
      return false;
    }
    const from = this.settings.get('smtpFrom') || this.settings.get('smtpUser') || 'noreply@localhost';
    const html = opts.wrapped ? opts.html : this.wrap(opts.html);
    try {
      await transport.sendMail({ from, to: opts.to, subject: opts.subject, html });
      this.logger.log(`E-mail envoyé à ${opts.to} — « ${opts.subject} »`);
      return true;
    } catch (err) {
      this.logger.error(`Échec envoi e-mail : ${err}`);
      return false;
    }
  }

  /** Envoie un modèle du catalogue (ignoré si désactivé). `force` = test depuis les paramètres, quel que soit l'interrupteur. */
  async sendTemplate(id: string, to: string, vars: Record<string, string>, opts: { lang?: string; force?: boolean } = {}): Promise<boolean> {
    const def = MAIL_TEMPLATE_BY_ID.get(id);
    if (!def) {
      this.logger.warn(`Modèle d'e-mail inconnu : ${id}`);
      return false;
    }
    if (!opts.force && !this.isEnabled(id)) return false;
    const r = this.renderTemplate(id, vars, opts.lang);
    if (!r) return false;
    const siteName = this.settings.get('siteName') || 'UHQ Panel OS';
    return this.send({ to, subject: `[${siteName}] ${r.subject}`, html: r.html, wrapped: true });
  }

  // ───────────────────────────── Méthodes historiques (appelées par le panel) ─────────────────────────────

  async sendPasswordReset(to: string, resetUrl: string, _siteName: string): Promise<boolean> {
    return this.sendTemplate('auth.password-reset', to, { resetUrl });
  }

  async sendWelcome(to: string, _siteName: string): Promise<boolean> {
    const base = panelBaseUrl(this.settings);
    return this.sendTemplate('auth.welcome', to, { email: to, loginUrl: base ? `${base}/login` : '' });
  }

  async sendLoginNotification(to: string, _siteName: string, ip?: string): Promise<boolean> {
    return this.sendTemplate('auth.login', to, { ip: ip ?? '—' });
  }

  async sendNewLoginLocationAlert(to: string, _siteName: string, ip: string, userAgent?: string): Promise<boolean> {
    return this.sendTemplate('auth.new-location', to, { ip, userAgent: (userAgent ?? '—').slice(0, 300) });
  }

  async sendRecoveryCodeUsedAlert(to: string, _siteName: string, ip: string): Promise<boolean> {
    return this.sendTemplate('auth.recovery-used', to, { ip });
  }

  async sendPasswordChanged(to: string, ip: string): Promise<boolean> {
    return this.sendTemplate('auth.password-changed', to, { ip, date: new Date().toLocaleString(this.lang() === 'en' ? 'en-GB' : 'fr-FR') });
  }

  async sendTwoFactorChanged(to: string, enabled: boolean, ip: string): Promise<boolean> {
    const en = this.lang() === 'en';
    return this.sendTemplate('auth.2fa-changed', to, { state: enabled ? (en ? 'enabled' : 'activée') : en ? 'disabled' : 'désactivée', ip });
  }

  async sendInvitation(to: string, inviteUrl: string, _siteName: string): Promise<boolean> {
    return this.sendTemplate('invitation', to, { inviteUrl });
  }

  /** E-mail de test SMTP (ignore l'interrupteur : sert justement à vérifier la configuration). */
  async sendTest(to: string, _siteName: string): Promise<boolean> {
    return this.sendTemplate('smtp.test', to, {}, { force: true });
  }

  /** Alerte système aux admins (cloche + e-mail). */
  async sendAdminAlert(to: string, title: string, message: string): Promise<boolean> {
    return this.sendTemplate('admin.alert', to, { title, message });
  }

  /** Rapport automatique global (traffic, pool, users). Le contenu est dynamique : seul l'habillage est commun. */
  async sendReport(report: {
    siteName: string;
    period: string;
    totalGb: number;
    totalRequests: number;
    activeUsers: number;
    poolWorking: number;
    poolTotal: number;
    topDomains: Array<{ hostname: string; requests: number }>;
  }): Promise<boolean> {
    const to = this.settings.get('smtpReportEmail');
    if (!to) return false;
    const { siteName, period, totalGb, totalRequests, activeUsers, poolWorking, poolTotal, topDomains } = report;
    const cell = 'padding:8px;border:1px solid #eee';
    const html = `
      <h2 style="margin:0 0 16px;font-size:18px">${escapeHtml(siteName)} — ${escapeHtml(period)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="${cell}">Trafic total</td><td style="${cell}"><strong>${totalGb.toFixed(3)} Go</strong></td></tr>
        <tr><td style="${cell}">Requêtes totales</td><td style="${cell}"><strong>${totalRequests}</strong></td></tr>
        <tr><td style="${cell}">Utilisateurs actifs</td><td style="${cell}"><strong>${activeUsers}</strong></td></tr>
        <tr><td style="${cell}">Pool fonctionnel</td><td style="${cell}"><strong>${poolWorking} / ${poolTotal}</strong></td></tr>
      </table>
      ${topDomains.length ? `<h3 style="margin:20px 0 8px;font-size:15px">Top domaines</h3><ol style="margin:0;padding-left:20px">${topDomains.slice(0, 10).map((d) => `<li>${escapeHtml(d.hostname)} — ${d.requests} req</li>`).join('')}</ol>` : ''}`;
    return this.send({ to, subject: `[${siteName}] Rapport ${period}`, html });
  }
}
