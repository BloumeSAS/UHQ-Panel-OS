import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import * as os from 'os';
import { ApiExcludeController } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../../common/guards/api-key.guard';
import { PrismaService } from '../../../database/prisma.service';
import { ProxyServerService } from '../../proxy-engine/proxy-server.service';

/**
 * Extension "prometheus-metrics" — exposée sur `/metrics` (racine, pas sous
 * `/api/panel`, convention Prometheus) uniquement quand l'extension est
 * activée (voir `extension-modules.ts` + résolution au boot dans main.ts).
 * Protégée par `ApiKeyGuard` (même clé que `/api/v1`) : un scrape Prometheus
 * doit passer `X-API-Key`, pour ne jamais exposer ces stats publiquement par
 * erreur sur un déploiement dont seul le port 8000 est publié.
 */
@ApiExcludeController()
@UseGuards(ApiKeyGuard)
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ProxyServerService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(): Promise<string> {
    const mem = process.memoryUsage();
    const cpuCount = os.cpus().length || 1;
    const loadPct = Math.min(100, Math.round((os.loadavg()[0] / cpuCount) * 100));
    const activeThreads = Array.from(this.engine.getActiveThreads().values()).reduce((a, b) => a + b, 0);
    const activeSessions = this.engine.getSessions().size;

    let proxiesWorking = 0;
    let proxiesTotal = 0;
    try {
      [proxiesWorking, proxiesTotal] = await Promise.all([
        this.prisma.backendProxy.count({ where: { isWorking: true } }),
        this.prisma.backendProxy.count(),
      ]);
    } catch {
      // Base indisponible — on renvoie quand même les métriques process/host.
    }

    const lines = [
      '# HELP uhq_process_rss_bytes Resident set size of the API process.',
      '# TYPE uhq_process_rss_bytes gauge',
      `uhq_process_rss_bytes ${mem.rss}`,
      '# HELP uhq_process_heap_used_bytes Heap used by the API process.',
      '# TYPE uhq_process_heap_used_bytes gauge',
      `uhq_process_heap_used_bytes ${mem.heapUsed}`,
      '# HELP uhq_process_uptime_seconds Uptime of the API process.',
      '# TYPE uhq_process_uptime_seconds counter',
      `uhq_process_uptime_seconds ${Math.round(process.uptime())}`,
      '# HELP uhq_host_cpu_load_percent 1-minute load average, normalized by core count.',
      '# TYPE uhq_host_cpu_load_percent gauge',
      `uhq_host_cpu_load_percent ${loadPct}`,
      '# HELP uhq_engine_active_threads Active proxy engine threads across all accounts.',
      '# TYPE uhq_engine_active_threads gauge',
      `uhq_engine_active_threads ${activeThreads}`,
      '# HELP uhq_engine_active_sessions Active sticky sessions.',
      '# TYPE uhq_engine_active_sessions gauge',
      `uhq_engine_active_sessions ${activeSessions}`,
      '# HELP uhq_proxies_working Backend proxies currently marked working.',
      '# TYPE uhq_proxies_working gauge',
      `uhq_proxies_working ${proxiesWorking}`,
      '# HELP uhq_proxies_total Backend proxies in the pool (any status).',
      '# TYPE uhq_proxies_total gauge',
      `uhq_proxies_total ${proxiesTotal}`,
    ];
    return lines.join('\n') + '\n';
  }
}
