import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../config/settings.service';
import { PrismaService } from '../../database/prisma.service';
import { request } from 'undici';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly proxyDeadCache = new Map<string, number>();

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Crée une notification in-app dans la base de données.
   */
  async createInApp(entry: {
    userId?: string;
    type: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    link?: string;
  }) {
    try {
      await this.prisma.notification.create({
        data: {
          userId: entry.userId || null,
          type: entry.type,
          title: entry.title,
          message: entry.message,
          link: entry.link || null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to save in-app notification: ${err.message}`);
    }
  }

  /**
   * Send a general notification payload to enabled Discord & Slack webhooks.
   */
  private async dispatch(payloads: {
    discord: any;
    slack: any;
  }) {
    // Dispatch to Discord
    if (this.settings.getBool('discordAlertsEnabled')) {
      const url = this.settings.get('discordWebhookUrl');
      if (url) {
        try {
          const res = await request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloads.discord),
          });
          if (res.statusCode >= 400) {
            this.logger.warn(`Discord webhook returned status ${res.statusCode}: ${await res.body.text()}`);
          }
        } catch (err) {
          this.logger.error(`Failed to send Discord webhook alert: ${err.message}`);
        }
      }
    }

    // Dispatch to Slack
    if (this.settings.getBool('slackAlertsEnabled')) {
      const url = this.settings.get('slackWebhookUrl');
      if (url) {
        try {
          const res = await request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloads.slack),
          });
          if (res.statusCode >= 400) {
            this.logger.warn(`Slack webhook returned status ${res.statusCode}: ${await res.body.text()}`);
          }
        } catch (err) {
          this.logger.error(`Failed to send Slack webhook alert: ${err.message}`);
        }
      }
    }
  }

  /**
   * Alert when a proxy is marked dead.
   * Deduped per URL: maximum once every 1 hour.
   */
  async notifyProxyDead(proxyUrl: string, error?: string): Promise<void> {
    const now = Date.now();
    const lastAlert = this.proxyDeadCache.get(proxyUrl) || 0;
    const cooldown = 60 * 60 * 1000; // 1 hour cooldown

    if (now - lastAlert < cooldown) {
      return; // Skip duplicate alert
    }
    this.proxyDeadCache.set(proxyUrl, now);

    this.logger.warn(`Proxy dead alert triggered for: ${proxyUrl}`);

    const title = '🚨 Proxy Offline / Dead';
    const desc = `The backend proxy **${proxyUrl}** has failed health check verification.`;
    const reason = error || 'Connection timed out or returned invalid response';

    // Save in-app notification
    await this.createInApp({
      type: 'error',
      title: '🚨 Proxy Hors Ligne',
      message: `Le proxy ${proxyUrl} est hors ligne. Raison : ${reason}`,
      link: '/pool',
    });

    const discordPayload = {
      username: 'UHQ Panel OS Alerts',
      embeds: [
        {
          title,
          description: desc,
          color: 16711680, // Red
          fields: [
            { name: 'Proxy URL', value: `\`${proxyUrl}\``, inline: false },
            { name: 'Failure Reason', value: reason, inline: false },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const slackPayload = {
      text: `Alert: Proxy offline - ${proxyUrl}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🚨 Proxy Offline / Dead', emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `The proxy *${proxyUrl}* is no longer working.\n*Reason:* _${reason}_`,
          },
        },
      ],
    };

    await this.dispatch({ discord: discordPayload, slack: slackPayload });
  }

  /**
   * Alert when a new panel user is created.
   */
  async notifyUserCreated(email: string, role: string): Promise<void> {
    const title = '👤 New User Registered';
    const desc = `A new user account has been registered or created on UHQ Panel OS.`;

    // Save in-app notification
    await this.createInApp({
      type: 'info',
      title: '👤 Nouvel Utilisateur',
      message: `L'utilisateur ${email} a créé un compte (${role}).`,
      link: '/users',
    });

    const discordPayload = {
      username: 'UHQ Panel OS Alerts',
      embeds: [
        {
          title,
          description: desc,
          color: 3447003, // Blue
          fields: [
            { name: 'Email Address', value: email, inline: true },
            { name: 'Account Role', value: `\`${role}\``, inline: true },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const slackPayload = {
      text: `New user created: ${email} (${role})`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '👤 New User Created', emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `A new account was created:\n*Email:* ${email}\n*Role:* \`${role}\``,
          },
        },
      ],
    };

    await this.dispatch({ discord: discordPayload, slack: slackPayload });
  }

  /**
   * Alert when a proxy client account exceeds its allocated usage quota.
   */
  async notifyQuotaExceeded(username: string, usedGb: number, totalGb: number): Promise<void> {
    const title = '⚠️ Proxy Quota Exceeded';
    const desc = `The user proxy account **${username}** has exceeded its allowed traffic quota.`;

    // Try to find the owner of this proxy account to target them
    let ownerId: string | undefined;
    try {
      const p = await this.prisma.userProxy.findUnique({
        where: { username },
        select: { ownerId: true },
      });
      if (p?.ownerId) ownerId = p.ownerId;
    } catch {}

    // Save user in-app notification if owner exists
    if (ownerId) {
      await this.createInApp({
        userId: ownerId,
        type: 'warning',
        title: '⚠️ Quota Dépassé',
        message: `Votre compte proxy ${username} a dépassé sa limite de trafic (${usedGb.toFixed(3)} Go / ${totalGb.toFixed(3)} Go).`,
        link: '/',
      });
    }

    // Save admin in-app notification
    await this.createInApp({
      type: 'warning',
      title: '⚠️ Quota Dépassé (Admin)',
      message: `Le compte proxy ${username} a dépassé son quota (${usedGb.toFixed(3)} Go / ${totalGb.toFixed(3)} Go).`,
      link: '/subusers',
    });

    const discordPayload = {
      username: 'UHQ Panel OS Alerts',
      embeds: [
        {
          title,
          description: desc,
          color: 16753920, // Orange
          fields: [
            { name: 'Username', value: `\`${username}\``, inline: true },
            { name: 'Traffic Usage', value: `${usedGb.toFixed(3)} GB / ${totalGb.toFixed(3)} GB`, inline: true },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const slackPayload = {
      text: `Quota Exceeded: ${username} (${usedGb.toFixed(3)} GB / ${totalGb.toFixed(3)} GB)`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '⚠️ Traffic Quota Exceeded', emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `The proxy credentials *${username}* have crossed their traffic limit.\n*Usage:* ${usedGb.toFixed(3)} GB of ${totalGb.toFixed(3)} GB`,
          },
        },
      ],
    };

    await this.dispatch({ discord: discordPayload, slack: slackPayload });
  }
}
