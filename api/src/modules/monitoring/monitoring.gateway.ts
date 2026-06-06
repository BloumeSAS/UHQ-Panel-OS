import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { PrismaService } from '../../database/prisma.service';

@WebSocketGateway({
  path: '/api/panel/ws',
})
export class MonitoringGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(MonitoringGateway.name);
  private readonly clients = new Set<WebSocket>();
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly engine: ProxyServerService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: WebSocket, req: IncomingMessage) {
    // Authenticate via query param token
    const url = new URL(req.url || '', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      this.logger.warn('WS Connection rejected: Missing token');
      client.close(4001, 'Unauthorized: Missing token');
      return;
    }

    try {
      this.jwt.verify(token);
      this.clients.add(client);
      this.logger.log(`WS Client connected (${this.clients.size} active)`);
      
      // Send initial data immediately
      await this.sendStatsToClient(client);

      // Start interval if it's the first client
      if (!this.interval) {
        this.startBroadcasting();
      }
    } catch (err) {
      this.logger.warn(`WS Connection rejected: Invalid token (${err.message})`);
      client.close(4001, 'Unauthorized: Invalid token');
    }
  }

  handleDisconnect(client: WebSocket) {
    this.clients.delete(client);
    this.logger.log(`WS Client disconnected (${this.clients.size} active)`);

    // Stop interval if no clients left
    if (this.clients.size === 0 && this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private startBroadcasting() {
    this.interval = setInterval(async () => {
      try {
        const stats = await this.getStats();
        const payload = JSON.stringify({ event: 'stats', data: stats });
        for (const client of this.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      } catch (err) {
        this.logger.error(`Broadcasting stats failed: ${err.message}`);
      }
    }, 2000); // every 2 seconds
  }

  private async sendStatsToClient(client: WebSocket) {
    try {
      const stats = await this.getStats();
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ event: 'stats', data: stats }));
      }
    } catch (err) {
      this.logger.error(`Failed to send initial stats: ${err.message}`);
    }
  }

  private async getStats() {
    const activeThreads = Array.from(this.engine.getActiveThreads().values()).reduce(
      (a, b) => a + b,
      0,
    );
    const activeSessions = this.engine.getSessions().size;
    const poolTotal = await this.prisma.backendProxy.count();
    const poolWorking = await this.prisma.backendProxy.count({
      where: { isWorking: true, isBlacklisted: false },
    });
    const poolBanned = await this.prisma.backendProxy.count({
      where: { isBlacklisted: true },
    });

    return {
      activeThreads,
      activeSessions,
      poolTotal,
      poolWorking,
      poolBanned,
      timestamp: new Date().toISOString(),
    };
  }
}
