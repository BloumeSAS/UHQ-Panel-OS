import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { LiveSnapshotService } from './live-snapshot.service';

/** Flux « en direct » du tableau de bord : un instantané COMPLET et cohérent toutes les 2 s (voir LiveSnapshotService). */
@WebSocketGateway({
  path: '/api/panel/ws',
})
export class MonitoringGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(MonitoringGateway.name);
  private readonly clients = new Set<WebSocket>();
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly snapshots: LiveSnapshotService,
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
      const payload = this.jwt.verify(token) as { role?: string };
      // Le flux contient la liste des comptes actifs et des statistiques internes : réservé ADMIN / SUPPORT
      // (un jeton « 2FA en attente » n'a pas de rôle, un simple utilisateur n'a pas à le recevoir).
      if (payload.role !== 'ADMIN' && payload.role !== 'SUPPORT') {
        this.logger.warn('WS Connection rejected: insufficient role');
        client.close(4003, 'Forbidden');
        return;
      }
      this.clients.add(client);
      this.logger.log(`WS Client connected (${this.clients.size} active)`);

      // Send initial data immediately
      await this.sendToClient(client);

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
        const payload = JSON.stringify({ event: 'stats', data: await this.snapshots.get() });
        for (const client of this.clients) {
          if (client.readyState === WebSocket.OPEN) client.send(payload);
        }
      } catch (err) {
        this.logger.error(`Broadcasting stats failed: ${err.message}`);
      }
    }, 2000); // every 2 seconds
  }

  private async sendToClient(client: WebSocket) {
    try {
      const snap = await this.snapshots.get();
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ event: 'stats', data: snap }));
    } catch (err) {
      this.logger.error(`Failed to send initial stats: ${err.message}`);
    }
  }
}
