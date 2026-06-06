import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../config/settings.service';
import * as nodemailer from 'nodemailer';

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

  /** Envoie un e-mail générique. Renvoie false si SMTP non configuré ou en erreur. */
  async send(opts: { to: string; subject: string; html: string }): Promise<boolean> {
    const transport = this.createTransport();
    if (!transport) {
      this.logger.warn('SMTP non configuré — e-mail ignoré.');
      return false;
    }
    const from = this.settings.get('smtpFrom') || this.settings.get('smtpUser') || 'noreply@localhost';
    try {
      await transport.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
      this.logger.log(`E-mail envoyé à ${opts.to} — « ${opts.subject} »`);
      return true;
    } catch (err) {
      this.logger.error(`Échec envoi e-mail : ${err}`);
      return false;
    }
  }

  /** E-mail de réinitialisation de mot de passe. */
  async sendPasswordReset(to: string, resetUrl: string, siteName: string): Promise<boolean> {
    return this.send({
      to,
      subject: `[${siteName}] Réinitialisation de mot de passe`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>${siteName}</h2>
          <p>Une demande de réinitialisation de mot de passe a été reçue pour votre compte.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#f97316;color:#fff;border-radius:6px;text-decoration:none">
              Réinitialiser mon mot de passe
            </a>
          </p>
          <p style="color:#666;font-size:12px">Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet e-mail.</p>
          <p style="color:#666;font-size:12px">Ou copiez ce lien : ${resetUrl}</p>
        </div>`,
    });
  }

  /** E-mail de bienvenue à l'inscription. */
  async sendWelcome(to: string, siteName: string): Promise<boolean> {
    if (!this.settings.getBool('emailOnRegister')) return false;
    return this.send({
      to,
      subject: `[${siteName}] Bienvenue !`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>Bienvenue sur ${siteName} !</h2>
          <p>Votre compte a été créé avec succès.</p>
          <p>Connectez-vous pour accéder à votre espace et utiliser vos proxies.</p>
        </div>`,
    });
  }

  /** Notification de connexion. */
  async sendLoginNotification(to: string, siteName: string, ip?: string): Promise<boolean> {
    if (!this.settings.getBool('emailOnLogin')) return false;
    return this.send({
      to,
      subject: `[${siteName}] Nouvelle connexion`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>${siteName} — Alerte de connexion</h2>
          <p>Une connexion a été effectuée sur votre compte.</p>
          ${ip ? `<p>Adresse IP : <code>${ip}</code></p>` : ''}
          <p>Si ce n'est pas vous, changez immédiatement votre mot de passe.</p>
        </div>`,
    });
  }

  /** Rapport automatique global (traffic, pool, users). */
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
    return this.send({
      to,
      subject: `[${siteName}] Rapport ${period}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2>${siteName} — Rapport ${period}</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;border:1px solid #eee">Trafic total</td><td style="padding:8px;border:1px solid #eee"><strong>${totalGb.toFixed(3)} Go</strong></td></tr>
            <tr><td style="padding:8px;border:1px solid #eee">Requêtes totales</td><td style="padding:8px;border:1px solid #eee"><strong>${totalRequests}</strong></td></tr>
            <tr><td style="padding:8px;border:1px solid #eee">Utilisateurs actifs</td><td style="padding:8px;border:1px solid #eee"><strong>${activeUsers}</strong></td></tr>
            <tr><td style="padding:8px;border:1px solid #eee">Pool fonctionnel</td><td style="padding:8px;border:1px solid #eee"><strong>${poolWorking} / ${poolTotal}</strong></td></tr>
          </table>
          ${topDomains.length ? `
          <h3>Top domaines</h3>
          <ol>${topDomains.slice(0, 10).map((d) => `<li>${d.hostname} — ${d.requests} req</li>`).join('')}</ol>` : ''}
        </div>`,
    });
  }

  /** Envoie un e-mail de test (utilisé depuis le panel pour vérifier la config SMTP). */
  async sendTest(to: string, siteName: string): Promise<boolean> {
    return this.send({
      to,
      subject: `[${siteName}] Test SMTP`,
      html: `<p>Configuration SMTP fonctionnelle sur <strong>${siteName}</strong>.</p>`,
    });
  }

  /** E-mail d'invitation à rejoindre le panel. */
  async sendInvitation(to: string, inviteUrl: string, siteName: string): Promise<boolean> {
    return this.send({
      to,
      subject: `[${siteName}] Vous avez été invité`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>${siteName} — Invitation</h2>
          <p>Vous avez été invité à rejoindre <strong>${siteName}</strong>.</p>
          <p>
            <a href="${inviteUrl}" style="display:inline-block;padding:10px 20px;background:#f97316;color:#fff;border-radius:6px;text-decoration:none">
              Accepter l'invitation
            </a>
          </p>
          <p style="color:#666;font-size:12px">Ce lien expire dans 7 jours. Ou copiez ce lien : ${inviteUrl}</p>
        </div>`,
    });
  }
}
