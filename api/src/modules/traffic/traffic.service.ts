import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from '../notifications/notification.service';

interface HostStats {
  sent: number;
  received: number;
  reqs: number;
}

interface UserStats {
  sent: number;
  received: number;
  hosts: Map<string, HostStats>;
}

/**
 * In-memory traffic accumulator. Equivalent of Python `TrafficManager`.
 * Buffers per-user / per-hostname stats and flushes them to the DB every
 * `FLUSH_INTERVAL_MS` (default 5s) using atomic Prisma `increment` updates.
 */
@Injectable()
export class TrafficService implements OnModuleInit {
  private readonly logger = new Logger(TrafficService.name);
  private buffer = new Map<string, UserStats>();
  private flushing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit(): void {
    this.logger.log('TrafficManager initialized (interval flush every 5s).');
  }

  logTraffic(
    username: string,
    hostname: string,
    sent: number,
    received: number,
    isNewReq = false,
  ): void {
    let user = this.buffer.get(username);
    if (!user) {
      user = { sent: 0, received: 0, hosts: new Map() };
      this.buffer.set(username, user);
    }
    user.sent += sent;
    user.received += received;

    let host = user.hosts.get(hostname);
    if (!host) {
      host = { sent: 0, received: 0, reqs: 0 };
      user.hosts.set(hostname, host);
    }
    host.sent += sent;
    host.received += received;
    if (isNewReq) host.reqs += 1;
  }

  @Interval(5000)
  async flush(): Promise<void> {
    if (this.flushing) return;
    if (this.buffer.size === 0) return;
    this.flushing = true;

    // Snapshot + clear so the engine can keep accumulating during flush
    const snapshot = this.buffer;
    this.buffer = new Map();

    try {
      await this.prisma.ensureConnection();
    } catch (e) {
      this.logger.error(`Cannot ensure DB connection: ${e}`);
      this.flushing = false;
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const [username, data] of snapshot) {
      try {
        const totalBytes = data.sent + data.received;
        const gbIncrement = totalBytes / (1024 * 1024 * 1024);

        const user = await this.prisma.userProxy.findUnique({ where: { username } });
        if (!user) continue;

        const oldUsed = user.usedGb;
        const newUsed = oldUsed + gbIncrement;
        if (user.totalGb > 0 && oldUsed < user.totalGb && newUsed >= user.totalGb) {
          void this.notificationService.notifyQuotaExceeded(username, newUsed, user.totalGb);
        }

        await this.prisma.userProxy.update({
          where: { id: user.id },
          data: {
            usedGb: { increment: gbIncrement },
            totalBytesSent: { increment: BigInt(Math.round(data.sent)) },
            totalBytesReceived: { increment: BigInt(Math.round(data.received)) },
          },
        });

        for (const [hostname, h] of data.hosts) {
          await this.prisma.proxyUsage.upsert({
            where: {
              userProxyId_hostname_date: {
                userProxyId: user.id,
                hostname,
                date: today,
              },
            },
            create: {
              userProxyId: user.id,
              hostname,
              date: today,
              bytesSent: h.sent,
              bytesReceived: h.received,
              requests: h.reqs,
            },
            update: {
              bytesSent: { increment: h.sent },
              bytesReceived: { increment: h.received },
              requests: { increment: h.reqs },
            },
          });
        }
      } catch (e) {
        this.logger.error(`TrafficManager: failed flush for ${username}: ${e}`);
      }
    }
    this.flushing = false;
  }
}
