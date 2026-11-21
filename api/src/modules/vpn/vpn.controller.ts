import { BadRequestException, Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audited } from '../audit/audited.decorator';
import { VpnService, VpnSource } from './vpn.service';
import { fetchVpnGate, pickVpnGate, vpnGateCountries } from './vpngate';

/** VPN dans les catégories de proxies (ADMIN) : état, import manuel (OpenVPN / WireGuard / liens V2Ray), source automatique VPNGate. */
@ApiTags('panel-vpn')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/panel/vpn')
export class VpnController {
  constructor(private readonly vpn: VpnService) {}

  @Get('status')
  async status(@Query('refresh') refresh?: string) {
    return { status: 'success', capabilities: await this.vpn.capabilities(refresh === '1'), tunnels: this.vpn.states(), sources: this.vpn.getSources() };
  }

  @Get('vpngate/countries')
  async countries(@Query('refresh') refresh?: string) {
    try {
      const list = await fetchVpnGate(refresh === '1');
      return { status: 'success', total: list.length, countries: vpnGateCountries(list) };
    } catch (e) {
      throw new BadRequestException(`VPNGate injoignable : ${(e as Error).message}`);
    }
  }

  @Post('vpngate/preview')
  async preview(@Body() body: { countries?: string[]; perCountry?: number }) {
    const list = await fetchVpnGate().catch((e) => {
      throw new BadRequestException(`VPNGate injoignable : ${(e as Error).message}`);
    });
    const best = pickVpnGate(list, body?.countries ?? [], Math.min(20, Number(body?.perCountry) || 3));
    return {
      status: 'success',
      servers: best.map((s) => ({
        ip: s.ip, host: s.host, country: s.country, countryCode: s.countryCode, score: s.score, pingMs: s.ping,
        speedMbps: Math.round(s.speed / 1e5) / 10, sessions: s.sessions, port: s.port,
      })),
    };
  }

  @Audited('vpn.import')
  @Post('vpngate/import')
  async importVpnGate(@Body() body: { countries?: string[]; perCountry?: number; pool?: string; keepUpdated?: boolean }) {
    const list = await fetchVpnGate().catch((e) => {
      throw new BadRequestException(`VPNGate injoignable : ${(e as Error).message}`);
    });
    const countries = (body?.countries ?? []).map((c) => String(c).toUpperCase()).filter(Boolean);
    const perCountry = Math.min(20, Math.max(1, Number(body?.perCountry) || 3));
    const best = pickVpnGate(list, countries, perCountry);
    if (best.length === 0) throw new BadRequestException('Aucun serveur VPNGate pour ce(s) pays');
    let sourceId: string | undefined;
    if (body?.keepUpdated) {
      const sources = this.vpn.getSources();
      sourceId = `vpngate-${Date.now().toString(36)}`;
      sources.push({ id: sourceId, provider: 'vpngate', countries, perCountry, pool: body.pool ?? '', enabled: true });
      await this.vpn.setSources(sources);
    }
    const imported = await this.vpn.importConfigs(
      best.map((s) => ({ kind: 'openvpn' as const, config: s.config, host: s.ip, port: s.port, country: s.countryCode })),
      { pool: body?.pool || null, provider: 'VPNGate', sourceId },
    );
    return { status: 'success', found: best.length, imported };
  }

  @Audited('vpn.import')
  @Post('import')
  async importManual(@Body() body: { text?: string; pool?: string; country?: string }) {
    const text = String(body?.text ?? '');
    if (text.length > 400_000) throw new BadRequestException('Texte trop volumineux');
    const r = await this.vpn.importText(text, { pool: body?.pool || null, country: body?.country });
    if (r.parsed === 0) {
      throw new BadRequestException('Aucune configuration reconnue (OpenVPN .ovpn, WireGuard .conf ou liens vless:// vmess:// trojan:// ss:// hy2://)');
    }
    return { status: 'success', ...r };
  }

  @Get('sources')
  sources() {
    return { status: 'success', sources: this.vpn.getSources() };
  }

  @Audited('vpn.sources')
  @Put('sources')
  async setSources(@Body() body: { sources?: VpnSource[] }) {
    return { status: 'success', sources: await this.vpn.setSources(body?.sources ?? []) };
  }

  @Audited('vpn.sync')
  @Post('sources/sync')
  async sync() {
    return { status: 'success', ...(await this.vpn.syncSources()) };
  }
}
