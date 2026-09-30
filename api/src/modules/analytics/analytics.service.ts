import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../config/settings.service';
import { ProxyServerService } from '../proxy-engine/proxy-server.service';
import { TrafficService } from '../traffic/traffic.service';
import { CheckerService } from '../checker/checker.service';
import { ScraperService } from '../scraper/scraper.service';

/**
 * Agrégats en lecture seule pour l'addon « Analyse » (et la page « Mon
 * activité » des utilisateurs). Toutes les sommes sont en octets FACTURÉS au
 * compte (multiplicateur de catégorie inclus, comme ProxyUsage) ; la
 * conversion en Go est faite par l'appelant (`BYTES_PER_GB`).
 *
 * Fuseaux : les lignes journalières (ProxyUsage.date) sont datées à minuit
 * dans le fuseau du SERVEUR ; l'historique horaire (ProxyUsageHourly.hour)
 * est en UTC et converti dans le fuseau `tz` demandé (celui du navigateur).
 */

/** Normalise récursivement les résultats SQL (BigInt/Decimal → number). */
function plain<T>(x: T): T {
  if (typeof x === 'bigint') return Number(x) as unknown as T;
  if (x instanceof Date || x === null || x === undefined) return x;
  if (Array.isArray(x)) return x.map(plain) as unknown as T;
  if (typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof (o as any).toNumber === 'function') return (o as any).toNumber();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = plain(v);
    return out as T;
  }
  return x;
}

export function clampDays(v: unknown, def = 30): number {
  const n = parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(365, n));
}

/** Fuseau IANA valide, sinon UTC (la valeur finit dans une requête SQL paramétrée ET est validée). */
export function safeTz(tz: unknown): string {
  const s = String(tz ?? '').trim();
  if (!s || s.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s });
    return s;
  } catch {
    return 'UTC';
  }
}

const SERVER_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

/** Minuit (heure du serveur) d'il y a `days - 1` jours = début d'une fenêtre de `days` jours calendaires. */
function dayStart(days: number, offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1) - offsetDays);
  return d;
}

const DEFAULT_POOL = '__default__';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly engine: ProxyServerService,
    private readonly traffic: TrafficService,
    private readonly checker: CheckerService,
    private readonly scraper: ScraperService,
  ) {}

  private q<T = any>(sql: Prisma.Sql): Promise<T[]> {
    return this.prisma.$queryRaw<T[]>(sql).then((r) => plain(r));
  }

  // ===================================================================== overview
  async overview(days: number, tz = 'UTC', isAdmin = true) {
    const since = dayStart(days);
    const prevSince = dayStart(days, days);
    const today = dayStart(1);
    const timelineSince = new Date(Date.now() - 72 * 3600_000);

    const [totals, prev, todayT, daily, topAccounts, topDomains, accounts, pool, users, topOwners,
      prevDaily, timeline, newAccounts, consumption, quotaDist, movers, flow] = await Promise.all([
      this.q(Prisma.sql`SELECT COALESCE(SUM("bytesSent"),0) AS sent, COALESCE(SUM("bytesReceived"),0) AS received,
          COALESCE(SUM(requests),0) AS requests, COUNT(DISTINCT "userProxyId") AS "activeAccounts", COUNT(DISTINCT hostname) AS domains
          FROM "ProxyUsage" WHERE date >= ${since}`),
      this.q(Prisma.sql`SELECT COALESCE(SUM("bytesSent"+"bytesReceived"),0) AS bytes, COALESCE(SUM(requests),0) AS requests,
          COUNT(DISTINCT "userProxyId") AS "activeAccounts"
          FROM "ProxyUsage" WHERE date >= ${prevSince} AND date < ${since}`),
      this.q(Prisma.sql`SELECT COALESCE(SUM("bytesSent"+"bytesReceived"),0) AS bytes, COALESCE(SUM(requests),0) AS requests,
          COUNT(DISTINCT "userProxyId") AS "activeAccounts" FROM "ProxyUsage" WHERE date >= ${today}`),
      this.q(Prisma.sql`SELECT to_char(("date" AT TIME ZONE 'UTC') AT TIME ZONE ${SERVER_TZ}::text, 'YYYY-MM-DD') AS day,
          SUM("bytesSent") AS sent, SUM("bytesReceived") AS received, SUM(requests) AS requests, COUNT(DISTINCT "userProxyId") AS accounts
          FROM "ProxyUsage" WHERE date >= ${since} GROUP BY date ORDER BY date`),
      this.q(Prisma.sql`SELECT u.id, u.name, u.username, u.pool, SUM(p."bytesSent"+p."bytesReceived") AS bytes, SUM(p.requests) AS requests
          FROM "ProxyUsage" p JOIN "UserProxy" u ON u.id = p."userProxyId" WHERE p.date >= ${since}
          GROUP BY u.id ORDER BY bytes DESC LIMIT 10`),
      this.q(Prisma.sql`SELECT hostname, SUM("bytesSent"+"bytesReceived") AS bytes, SUM(requests) AS requests, COUNT(DISTINCT "userProxyId") AS accounts
          FROM "ProxyUsage" WHERE date >= ${since} GROUP BY hostname ORDER BY bytes DESC LIMIT 15`),
      this.q(Prisma.sql`SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE "isBlocked") AS blocked,
          COUNT(*) FILTER (WHERE "expiresAt" IS NOT NULL AND "expiresAt" < now()) AS expired,
          COUNT(*) FILTER (WHERE "totalGb" > 0 AND "usedGb" >= "totalGb") AS "overQuota",
          COUNT(*) FILTER (WHERE "totalGb" > 0 AND "usedGb" >= 0.8*"totalGb" AND "usedGb" < "totalGb") AS "nearQuota",
          COUNT(*) FILTER (WHERE "totalGb" = 0) AS unlimited,
          COUNT(*) FILTER (WHERE "customProxies" IS NOT NULL AND "customProxies" <> '') AS "customList",
          COUNT(*) FILTER (WHERE "ownerId" IS NOT NULL) AS assigned,
          COUNT(*) FILTER (WHERE "createdAt" >= ${since}) AS created,
          COALESCE(SUM("usedGb"),0) AS "usedGb", COALESCE(SUM("totalGb"),0) AS "quotaGb"
          FROM "UserProxy"`),
      this.q(Prisma.sql`SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE "isWorking" AND NOT "isBlacklisted") AS working,
          COUNT(*) FILTER (WHERE NOT "isWorking" AND NOT "isBlacklisted") AS dead,
          COUNT(*) FILTER (WHERE "isBlacklisted") AS blacklisted,
          COUNT(*) FILTER (WHERE archived) AS archived,
          AVG("averageLatency") FILTER (WHERE "isWorking" AND "averageLatency" IS NOT NULL) AS "avgLatencyMs"
          FROM "BackendProxy"`),
      this.q(Prisma.sql`SELECT role, COUNT(*) AS total, COUNT(*) FILTER (WHERE "isActive") AS active,
          COUNT(*) FILTER (WHERE "totpEnabled") AS "with2fa", COUNT(*) FILTER (WHERE "createdAt" >= ${since}) AS created
          FROM "PanelUser" GROUP BY role`),
      this.q(Prisma.sql`SELECT o.id, o.email, COUNT(DISTINCT u.id) AS accounts, COALESCE(SUM(p."bytesSent"+p."bytesReceived"),0) AS bytes
          FROM "PanelUser" o JOIN "UserProxy" u ON u."ownerId" = o.id
          LEFT JOIN "ProxyUsage" p ON p."userProxyId" = u.id AND p.date >= ${since}
          GROUP BY o.id ORDER BY bytes DESC LIMIT 10`),
      // Période précédente (même durée) pour superposer les courbes.
      this.q(Prisma.sql`SELECT to_char(("date" AT TIME ZONE 'UTC') AT TIME ZONE ${SERVER_TZ}::text, 'YYYY-MM-DD') AS day,
          SUM("bytesSent"+"bytesReceived") AS bytes, SUM(requests) AS requests, COUNT(DISTINCT "userProxyId") AS accounts
          FROM "ProxyUsage" WHERE date >= ${prevSince} AND date < ${since} GROUP BY date ORDER BY date`),
      // Chronologie heure par heure des 72 dernières heures.
      this.q(Prisma.sql`SELECT hour, SUM("bytesSent") AS sent, SUM("bytesReceived") AS received, SUM(requests) AS requests,
          COUNT(DISTINCT "userProxyId") AS accounts FROM "ProxyUsageHourly" WHERE hour >= ${timelineSince} GROUP BY hour ORDER BY hour`),
      this.q(Prisma.sql`SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text, 'YYYY-MM-DD') AS day, COUNT(*) AS count
          FROM "UserProxy" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`),
      // Répartition des comptes par volume consommé sur la période.
      this.q(Prisma.sql`SELECT CASE WHEN b < 1e8 THEN 0 WHEN b < 1e9 THEN 1 WHEN b < 1e10 THEN 2 WHEN b < 1e11 THEN 3 ELSE 4 END AS bucket,
          COUNT(*) AS accounts, SUM(b) AS bytes FROM (
            SELECT SUM("bytesSent"+"bytesReceived") AS b FROM "ProxyUsage" WHERE date >= ${since} GROUP BY "userProxyId") t GROUP BY 1 ORDER BY 1`),
      // Répartition des comptes à quota par taux de consommation.
      this.q(Prisma.sql`SELECT CASE WHEN "usedGb"/"totalGb" < 0.25 THEN 0 WHEN "usedGb"/"totalGb" < 0.5 THEN 1 WHEN "usedGb"/"totalGb" < 0.8 THEN 2
          WHEN "usedGb"/"totalGb" < 1 THEN 3 ELSE 4 END AS bucket, COUNT(*) AS accounts
          FROM "UserProxy" WHERE "totalGb" > 0 GROUP BY 1 ORDER BY 1`),
      // Plus fortes hausses / baisses vs période précédente.
      this.q(Prisma.sql`SELECT u.id, u.name, u.username, x.cur, x.prev FROM (
            SELECT "userProxyId", SUM(CASE WHEN date >= ${since} THEN "bytesSent"+"bytesReceived" ELSE 0 END) AS cur,
                   SUM(CASE WHEN date < ${since} THEN "bytesSent"+"bytesReceived" ELSE 0 END) AS prev
            FROM "ProxyUsage" WHERE date >= ${prevSince} GROUP BY 1) x JOIN "UserProxy" u ON u.id = x."userProxyId"`),
      // Flux de comptes : gagnés / conservés / perdus entre les deux périodes.
      this.q(Prisma.sql`SELECT COUNT(*) FILTER (WHERE cur > 0 AND prev = 0) AS gained, COUNT(*) FILTER (WHERE cur > 0 AND prev > 0) AS kept,
          COUNT(*) FILTER (WHERE prev > 0 AND cur = 0) AS lost FROM (
            SELECT SUM(CASE WHEN date >= ${since} THEN "bytesSent"+"bytesReceived" ELSE 0 END) AS cur,
                   SUM(CASE WHEN date < ${since} THEN "bytesSent"+"bytesReceived" ELSE 0 END) AS prev
            FROM "ProxyUsage" WHERE date >= ${prevSince} GROUP BY "userProxyId") t`),
    ]);

    const moverRows = (movers as { id: string; name: string; username: string; cur: number; prev: number }[])
      .map((m) => ({ ...m, delta: m.cur - m.prev }));
    const growers = moverRows.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 6);
    const decliners = moverRows.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 6);
    const domainTotal = (topDomains as { bytes: number }[]).reduce((n, d) => n + d.bytes, 0);

    const categories = await this.prisma.proxyPool.count();
    const threads = this.engine.getActiveThreads();
    let liveThreads = 0;
    let liveAccounts = 0;
    for (const v of threads.values()) if (v > 0) { liveAccounts += 1; liveThreads += v; }
    let sentBps = 0;
    let receivedBps = 0;
    for (const b of this.traffic.getLiveBandwidth().values()) { sentBps += b.sentBps; receivedBps += b.receivedBps; }

    const t = totals[0];
    return {
      period: { days, since, serverTz: SERVER_TZ },
      traffic: {
        sent: t.sent, received: t.received, total: t.sent + t.received, requests: t.requests,
        activeAccounts: t.activeAccounts, domains: t.domains,
        today: todayT[0],
        previous: prev[0],
      },
      accounts: accounts[0],
      pool: pool[0],
      categories,
      panelUsers: users,
      live: { accounts: liveAccounts, threads: liveThreads, sentBps, receivedBps },
      daily,
      prevDaily,
      timeline,
      newAccounts,
      consumption,
      quotaDist,
      movers: { growers, decliners },
      flow: flow[0],
      domainShare: {
        top1: topDomains[0] && t.sent + t.received > 0 ? topDomains[0].bytes / (t.sent + t.received) : 0,
        top5: t.sent + t.received > 0 ? (topDomains as { bytes: number }[]).slice(0, 5).reduce((n, d) => n + d.bytes, 0) / (t.sent + t.received) : 0,
        top15: t.sent + t.received > 0 ? domainTotal / (t.sent + t.received) : 0,
      },
      topAccounts,
      topDomains,
      // E-mails des propriétaires : la liste des utilisateurs est réservée aux ADMIN.
      topOwners: isAdmin ? topOwners : [],
    };
  }

  // ===================================================================== accounts
  async accounts(opts: {
    days: number; tz: string; q?: string; sort?: string; order?: string; limit?: number; offset?: number;
    pool?: string; status?: string; isAdmin?: boolean;
  }) {
    const isAdmin = opts.isAdmin ?? true;
    const since = dayStart(opts.days);
    const hourSince = new Date(Date.now() - opts.days * 86400_000);
    const limit = Math.max(1, Math.min(500, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);

    const conds: Prisma.Sql[] = [];
    if (opts.q?.trim()) {
      const like = `%${opts.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      // La recherche par e-mail de propriétaire est réservée aux ADMIN (sinon un SUPPORT pourrait sonder les e-mails).
      conds.push(isAdmin
        ? Prisma.sql`(u.username ILIKE ${like} OR u.name ILIKE ${like} OR o.email ILIKE ${like})`
        : Prisma.sql`(u.username ILIKE ${like} OR u.name ILIKE ${like})`);
    }
    if (opts.pool) conds.push(opts.pool === DEFAULT_POOL ? Prisma.sql`u.pool IS NULL` : Prisma.sql`u.pool = ${opts.pool}`);
    switch (opts.status) {
      case 'blocked': conds.push(Prisma.sql`u."isBlocked"`); break;
      case 'expired': conds.push(Prisma.sql`(u."expiresAt" IS NOT NULL AND u."expiresAt" < now())`); break;
      case 'overquota': conds.push(Prisma.sql`(u."totalGb" > 0 AND u."usedGb" >= u."totalGb")`); break;
      case 'nearquota': conds.push(Prisma.sql`(u."totalGb" > 0 AND u."usedGb" >= 0.8*u."totalGb" AND u."usedGb" < u."totalGb")`); break;
      case 'inactive': conds.push(Prisma.sql`COALESCE(p.req, 0) = 0`); break;
      case 'active': conds.push(Prisma.sql`COALESCE(p.req, 0) > 0`); break;
    }
    const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;

    const sortMap: Record<string, string> = {
      bytes: 'COALESCE(p.sent,0)+COALESCE(p.recv,0)',
      requests: 'COALESCE(p.req,0)',
      domains: 'COALESCE(p.domains,0)',
      activeDays: 'COALESCE(p.days,0)',
      quota: 'CASE WHEN u."totalGb" > 0 THEN u."usedGb"/u."totalGb" ELSE -1 END',
      used: 'u."usedGb"',
      created: 'u."createdAt"',
      lastActive: 'h."lastHour"',
      username: 'u.username',
    };
    const sortExpr = Prisma.raw(sortMap[opts.sort ?? ''] ?? sortMap.bytes);
    const dir = Prisma.raw(opts.order === 'asc' ? 'ASC' : 'DESC');

    const from = Prisma.sql`FROM "UserProxy" u
      LEFT JOIN "PanelUser" o ON o.id = u."ownerId"
      LEFT JOIN (SELECT "userProxyId", SUM("bytesSent") AS sent, SUM("bytesReceived") AS recv, SUM(requests) AS req,
                        COUNT(DISTINCT hostname) AS domains, COUNT(DISTINCT date) AS days, MAX(date) AS "lastDay"
                 FROM "ProxyUsage" WHERE date >= ${since} GROUP BY 1) p ON p."userProxyId" = u.id
      LEFT JOIN (SELECT "userProxyId", MAX(hour) AS "lastHour" FROM "ProxyUsageHourly" GROUP BY 1) h ON h."userProxyId" = u.id
      ${where}`;

    const [rows, count] = await Promise.all([
      this.q(Prisma.sql`SELECT u.id, u.name, u.username, u.pool, u."isBlocked", u."expiresAt", u."totalGb", u."usedGb", u."createdAt",
          u."threadsLimit", u."ownerId", o.email AS "ownerEmail",
          (u."customProxies" IS NOT NULL AND u."customProxies" <> '') AS "customList",
          COALESCE(p.sent,0) AS sent, COALESCE(p.recv,0) AS received, COALESCE(p.req,0) AS requests,
          COALESCE(p.domains,0) AS domains, COALESCE(p.days,0) AS "activeDays", p."lastDay", h."lastHour"
          ${from} ORDER BY ${sortExpr} ${dir} NULLS LAST, u.username ASC LIMIT ${limit} OFFSET ${offset}`),
      this.q(Prisma.sql`SELECT COUNT(*) AS n ${from}`),
    ]);

    // Heure de pointe de chaque compte de la page (dans le fuseau demandé).
    const ids = rows.map((r: any) => r.id);
    const peaks = new Map<string, number>();
    if (ids.length) {
      const pk = await this.q<{ id: string; hr: number }>(Prisma.sql`
        SELECT DISTINCT ON ("userProxyId") "userProxyId" AS id, hr FROM (
          SELECT "userProxyId", EXTRACT(HOUR FROM ("hour" AT TIME ZONE 'UTC') AT TIME ZONE ${opts.tz}::text)::int AS hr,
                 SUM("bytesSent"+"bytesReceived") AS b
          FROM "ProxyUsageHourly" WHERE "userProxyId" IN (${Prisma.join(ids)}) AND hour >= ${hourSince} GROUP BY 1, 2
        ) x ORDER BY "userProxyId", b DESC`);
      for (const r of pk) peaks.set(r.id, r.hr);
    }

    const now = Date.now();
    return {
      total: count[0]?.n ?? 0,
      limit,
      offset,
      data: rows.map((r: any) => ({
        ...r,
        ownerEmail: isAdmin ? r.ownerEmail : null,
        ownerId: isAdmin ? r.ownerId : null,
        bytes: r.sent + r.received,
        quotaPct: r.totalGb > 0 ? Math.round((r.usedGb / r.totalGb) * 1000) / 10 : null,
        status: r.isBlocked ? 'blocked'
          : r.expiresAt && new Date(r.expiresAt).getTime() < now ? 'expired'
          : r.totalGb > 0 && r.usedGb >= r.totalGb ? 'overquota'
          : 'ok',
        peakHour: peaks.get(r.id) ?? null,
      })),
    };
  }

  // ===================================================================== account detail
  async accountDetail(id: string, days: number, tz: string, isAdmin = true) {
    const acc = await this.prisma.userProxy.findUnique({
      where: { id },
      select: {
        id: true, name: true, username: true, pool: true, isBlocked: true, expiresAt: true, totalGb: true, usedGb: true,
        createdAt: true, threadsLimit: true, bandwidthLimit: true, port: true, domain: true, countryFilter: true,
        stickySessionTtl: true, ownerId: true, owner: { select: { email: true } }, blockedDomains: true,
      },
    });
    if (!acc) throw new NotFoundException('Compte introuvable');
    const since = dayStart(days);
    const prevSince = dayStart(days, days);

    const [daily, domains, totals, prev, errors, activity] = await Promise.all([
      this.q(Prisma.sql`SELECT to_char(("date" AT TIME ZONE 'UTC') AT TIME ZONE ${SERVER_TZ}::text, 'YYYY-MM-DD') AS day,
          SUM("bytesSent") AS sent, SUM("bytesReceived") AS received, SUM(requests) AS requests, COUNT(DISTINCT hostname) AS domains
          FROM "ProxyUsage" WHERE "userProxyId" = ${id} AND date >= ${since} GROUP BY date ORDER BY date`),
      this.q(Prisma.sql`SELECT hostname, SUM("bytesSent"+"bytesReceived") AS bytes, SUM(requests) AS requests, COUNT(DISTINCT date) AS days
          FROM "ProxyUsage" WHERE "userProxyId" = ${id} AND date >= ${since} GROUP BY hostname ORDER BY bytes DESC LIMIT 25`),
      this.q(Prisma.sql`SELECT COALESCE(SUM("bytesSent"),0) AS sent, COALESCE(SUM("bytesReceived"),0) AS received,
          COALESCE(SUM(requests),0) AS requests, COUNT(DISTINCT hostname) AS domains, COUNT(DISTINCT date) AS "activeDays",
          MIN(date) AS first, MAX(date) AS last FROM "ProxyUsage" WHERE "userProxyId" = ${id} AND date >= ${since}`),
      this.q(Prisma.sql`SELECT COALESCE(SUM("bytesSent"+"bytesReceived"),0) AS bytes, COALESCE(SUM(requests),0) AS requests
          FROM "ProxyUsage" WHERE "userProxyId" = ${id} AND date >= ${prevSince} AND date < ${since}`),
      this.q(Prisma.sql`SELECT reason, SUM(count) AS count, COUNT(DISTINCT hostname) AS hosts
          FROM "ProxyUsageError" WHERE "userProxyId" = ${id} AND date >= ${since} GROUP BY reason ORDER BY count DESC`),
      this.activity({ days, tz, accountId: id }),
    ]);

    const live = this.traffic.getPending(acc.username);
    return {
      account: {
        ...acc,
        ownerEmail: isAdmin ? acc.owner?.email ?? null : null,
        ownerId: isAdmin ? acc.ownerId : null,
        owner: undefined,
        quotaPct: acc.totalGb > 0 ? Math.round((acc.usedGb / acc.totalGb) * 1000) / 10 : null,
        liveThreads: this.engine.getActiveThreads().get(acc.username) ?? 0,
      },
      period: { days, since },
      totals: { ...totals[0], bytes: totals[0].sent + totals[0].received },
      previous: prev[0],
      pendingBytes: live.sent + live.received,
      daily,
      domains,
      errors,
      activity,
    };
  }

  // ===================================================================== activity (heures / jours)
  async activity(opts: { days: number; tz: string; accountId?: string; pool?: string; accountIds?: string[] }) {
    const { days, tz } = opts;
    const hourSince = new Date(Date.now() - days * 86400_000);
    const since = dayStart(days);

    // Filtres communs (alias h = ProxyUsageHourly, p = ProxyUsage, u = UserProxy).
    const hConds: Prisma.Sql[] = [Prisma.sql`h.hour >= ${hourSince}`];
    const pConds: Prisma.Sql[] = [Prisma.sql`p.date >= ${since}`];
    if (opts.accountId) {
      hConds.push(Prisma.sql`h."userProxyId" = ${opts.accountId}`);
      pConds.push(Prisma.sql`p."userProxyId" = ${opts.accountId}`);
    }
    if (opts.accountIds?.length) {
      hConds.push(Prisma.sql`h."userProxyId" IN (${Prisma.join(opts.accountIds)})`);
      pConds.push(Prisma.sql`p."userProxyId" IN (${Prisma.join(opts.accountIds)})`);
    }
    if (opts.pool) {
      const c = opts.pool === DEFAULT_POOL ? Prisma.sql`u.pool IS NULL` : Prisma.sql`u.pool = ${opts.pool}`;
      hConds.push(c);
      pConds.push(c);
    }
    const hWhere = Prisma.join(hConds, ' AND ');
    const pWhere = Prisma.join(pConds, ' AND ');
    const hFrom = Prisma.sql`FROM "ProxyUsageHourly" h JOIN "UserProxy" u ON u.id = h."userProxyId"`;
    const pFrom = Prisma.sql`FROM "ProxyUsage" p JOIN "UserProxy" u ON u.id = p."userProxyId"`;
    const local = Prisma.sql`(h.hour AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text`;

    const tlHours = Math.min(days, 14) * 24;
    const tlSince = new Date(Date.now() - tlHours * 3600_000);
    const tlConds = hConds.map((c) => c).filter((c) => c !== hConds[0]);
    const tlWhere = Prisma.join([Prisma.sql`h.hour >= ${tlSince}`, ...tlConds], ' AND ');
    const [grid, avgAccounts, hourlyDaily, daily, weekdayDaily, meta, timeline] = await Promise.all([
      this.q<{ dow: number; hr: number; bytes: number; requests: number }>(Prisma.sql`
        SELECT EXTRACT(DOW FROM ${local})::int AS dow, EXTRACT(HOUR FROM ${local})::int AS hr,
               SUM(h."bytesSent"+h."bytesReceived") AS bytes, SUM(h.requests) AS requests
        ${hFrom} WHERE ${hWhere} GROUP BY 1, 2`),
      this.q<{ hr: number; avg: number; max: number }>(Prisma.sql`
        SELECT hr, AVG(n) AS avg, MAX(n) AS max FROM (
          SELECT h.hour, EXTRACT(HOUR FROM ${local})::int AS hr, COUNT(DISTINCT h."userProxyId") AS n
          ${hFrom} WHERE ${hWhere} GROUP BY h.hour) t GROUP BY hr`),
      this.q<{ day: string; bytes: number; requests: number }>(Prisma.sql`
        SELECT to_char(${local}, 'YYYY-MM-DD') AS day, SUM(h."bytesSent"+h."bytesReceived") AS bytes, SUM(h.requests) AS requests
        ${hFrom} WHERE ${hWhere} GROUP BY 1 ORDER BY 1`),
      this.q<{ day: string; bytes: number; requests: number; accounts: number }>(Prisma.sql`
        SELECT to_char((p.date AT TIME ZONE 'UTC') AT TIME ZONE ${SERVER_TZ}::text, 'YYYY-MM-DD') AS day,
               SUM(p."bytesSent"+p."bytesReceived") AS bytes, SUM(p.requests) AS requests, COUNT(DISTINCT p."userProxyId") AS accounts
        ${pFrom} WHERE ${pWhere} GROUP BY p.date ORDER BY p.date`),
      this.q<{ dow: number; bytes: number; requests: number; days: number }>(Prisma.sql`
        SELECT EXTRACT(DOW FROM (p.date AT TIME ZONE 'UTC') AT TIME ZONE ${SERVER_TZ}::text)::int AS dow,
               SUM(p."bytesSent"+p."bytesReceived") AS bytes, SUM(p.requests) AS requests, COUNT(DISTINCT p.date) AS days
        ${pFrom} WHERE ${pWhere} GROUP BY 1`),
      this.q<{ first: Date | null; n: number }>(Prisma.sql`SELECT MIN(hour) AS first, COUNT(*) AS n FROM "ProxyUsageHourly"`),
      // Chronologie heure par heure (14 jours max) du périmètre demandé.
      this.q<{ hour: Date; sent: number; received: number; requests: number; accounts: number }>(Prisma.sql`
        SELECT h.hour, SUM(h."bytesSent") AS sent, SUM(h."bytesReceived") AS received, SUM(h.requests) AS requests,
               COUNT(DISTINCT h."userProxyId") AS accounts
        ${hFrom} WHERE ${tlWhere} GROUP BY h.hour ORDER BY h.hour`),
    ]);

    const hasHourly = grid.length > 0;
    const heatBytes: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const heatReq: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const g of grid) { heatBytes[g.dow][g.hr] = g.bytes; heatReq[g.dow][g.hr] = g.requests; }

    const hourOfDay = Array.from({ length: 24 }, (_, hr) => {
      const a = avgAccounts.find((x) => x.hr === hr);
      let bytes = 0; let requests = 0;
      for (let d = 0; d < 7; d++) { bytes += heatBytes[d][hr]; requests += heatReq[d][hr]; }
      return { hour: hr, bytes, requests, avgActiveAccounts: a ? Math.round(a.avg * 10) / 10 : 0, maxActiveAccounts: a?.max ?? 0 };
    });

    // Nombre de jours de chaque jour de semaine dans la fenêtre (pour des moyennes justes).
    const dayCounts = Array(7).fill(0);
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < days; i++) dayCounts[names.indexOf(fmt.format(new Date(Date.now() - i * 86400_000)))] += 1;

    // Jour de semaine : depuis l'historique horaire s'il existe, sinon depuis l'historique journalier (antérieur à la collecte horaire).
    const weekday = Array.from({ length: 7 }, (_, dow) => {
      const fromHourly = heatBytes[dow].reduce((a, b) => a + b, 0);
      const reqHourly = heatReq[dow].reduce((a, b) => a + b, 0);
      const wd = weekdayDaily.find((x) => x.dow === dow);
      const bytes = hasHourly ? fromHourly : wd?.bytes ?? 0;
      const requests = hasHourly ? reqHourly : wd?.requests ?? 0;
      const n = Math.max(1, hasHourly ? dayCounts[dow] : wd?.days ?? 0);
      return { dow, bytes, requests, avgBytes: bytes / n, avgRequests: requests / n };
    });

    const byDay = daily.length ? daily : hourlyDaily.map((d) => ({ ...d, accounts: 0 }));

    // Indicateurs clés
    const totalBytes = hourOfDay.reduce((a, h) => a + h.bytes, 0);
    const peakHour = hasHourly ? [...hourOfDay].sort((a, b) => b.bytes - a.bytes)[0] : null;
    const slots = [] as { dow: number; hour: number; bytes: number; requests: number }[];
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) slots.push({ dow: d, hour: h, bytes: heatBytes[d][h], requests: heatReq[d][h] });
    const topSlots = hasHourly ? slots.filter((s) => s.bytes > 0).sort((a, b) => b.bytes - a.bytes).slice(0, 5) : [];
    const peakWeekday = [...weekday].sort((a, b) => b.avgBytes - a.avgBytes)[0];
    const peakDay = [...byDay].sort((a, b) => b.bytes - a.bytes)[0] ?? null;

    // Fenêtre la plus calme de 3 h consécutives (circulaire) — idéale pour une maintenance.
    let quiet: { startHour: number; bytes: number } | null = null;
    if (hasHourly && totalBytes > 0) {
      for (let s = 0; s < 24; s++) {
        const b = hourOfDay[s].bytes + hourOfDay[(s + 1) % 24].bytes + hourOfDay[(s + 2) % 24].bytes;
        if (!quiet || b < quiet.bytes) quiet = { startHour: s, bytes: b };
      }
    }

    // Tranches de la journée et semaine / week-end (dans le fuseau demandé).
    const part = (from: number, to: number) => {
      let b = 0;
      let r = 0;
      for (let d = 0; d < 7; d++) for (let h = from; h < to; h++) { b += heatBytes[d][h]; r += heatReq[d][h]; }
      return { bytes: b, requests: r };
    };
    const dayparts = { night: part(0, 6), morning: part(6, 12), afternoon: part(12, 18), evening: part(18, 24) };
    const sumDays = (list: number[]) => list.reduce((n, d) => n + heatBytes[d].reduce((a, b) => a + b, 0), 0);
    const weekend = {
      weekday: sumDays([1, 2, 3, 4, 5]),
      weekend: sumDays([0, 6]),
      weekdayDays: dayCounts[1] + dayCounts[2] + dayCounts[3] + dayCounts[4] + dayCounts[5],
      weekendDays: dayCounts[0] + dayCounts[6],
    };

    return {
      period: { days, tz, serverTz: SERVER_TZ },
      dayparts,
      weekend,
      timeline,
      hasHourly,
      hourlySince: meta[0]?.first ?? null,
      hourlyRows: meta[0]?.n ?? 0,
      hourOfDay,
      weekday,
      heatmap: { bytes: heatBytes, requests: heatReq },
      byDay,
      peak: {
        hour: peakHour ? { hour: peakHour.hour, bytes: peakHour.bytes, share: totalBytes ? peakHour.bytes / totalBytes : 0 } : null,
        weekday: peakWeekday && peakWeekday.avgBytes > 0 ? { dow: peakWeekday.dow, avgBytes: peakWeekday.avgBytes } : null,
        day: peakDay ? { day: peakDay.day, bytes: peakDay.bytes } : null,
        slots: topSlots,
        quietWindow: quiet ? { startHour: quiet.startHour, endHour: (quiet.startHour + 3) % 24, bytes: quiet.bytes } : null,
      },
    };
  }

  // ===================================================================== categories
  async categories(days: number, tz: string) {
    const since = dayStart(days);
    const hourSince = new Date(Date.now() - days * 86400_000);
    const [pools, accounts, traffic, backend, daily, hours] = await Promise.all([
      this.prisma.proxyPool.findMany({ orderBy: { name: 'asc' } }),
      this.q(Prisma.sql`SELECT COALESCE(pool, '') AS pool, COUNT(*) AS total, COUNT(*) FILTER (WHERE "isBlocked") AS blocked,
          COUNT(*) FILTER (WHERE "totalGb" > 0 AND "usedGb" >= "totalGb") AS "overQuota",
          COALESCE(SUM("usedGb"),0) AS "usedGb", COALESCE(SUM("totalGb"),0) AS "quotaGb"
          FROM "UserProxy" GROUP BY 1`),
      this.q(Prisma.sql`SELECT COALESCE(u.pool, '') AS pool, SUM(p."bytesSent") AS sent, SUM(p."bytesReceived") AS received,
          SUM(p.requests) AS requests, COUNT(DISTINCT p."userProxyId") AS active, COUNT(DISTINCT p.hostname) AS domains
          FROM "ProxyUsage" p JOIN "UserProxy" u ON u.id = p."userProxyId" WHERE p.date >= ${since} GROUP BY 1`),
      this.q(Prisma.sql`SELECT COALESCE(pool, '') AS pool, COUNT(*) AS total,
          COUNT(*) FILTER (WHERE "isWorking" AND NOT "isBlacklisted") AS working,
          COUNT(*) FILTER (WHERE NOT "isWorking" AND NOT "isBlacklisted") AS dead,
          COUNT(*) FILTER (WHERE "isBlacklisted") AS blacklisted,
          AVG("averageLatency") FILTER (WHERE "isWorking" AND "averageLatency" IS NOT NULL) AS "avgLatencyMs"
          FROM "BackendProxy" GROUP BY 1`),
      this.q(Prisma.sql`SELECT to_char((p.date AT TIME ZONE 'UTC') AT TIME ZONE ${SERVER_TZ}::text, 'YYYY-MM-DD') AS day,
          COALESCE(u.pool, '') AS pool, SUM(p."bytesSent"+p."bytesReceived") AS bytes
          FROM "ProxyUsage" p JOIN "UserProxy" u ON u.id = p."userProxyId" WHERE p.date >= ${since} GROUP BY p.date, 2 ORDER BY p.date`),
      this.q<{ pool: string; hr: number; b: number }>(Prisma.sql`SELECT COALESCE(u.pool, '') AS pool,
          EXTRACT(HOUR FROM (h.hour AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text)::int AS hr, SUM(h."bytesSent"+h."bytesReceived") AS b
          FROM "ProxyUsageHourly" h JOIN "UserProxy" u ON u.id = h."userProxyId" WHERE h.hour >= ${hourSince} GROUP BY 1, 2`),
    ]);

    const find = (arr: any[], name: string) => arr.find((x) => x.pool === name);
    const peakOf = (name: string) => {
      const rows = hours.filter((h) => h.pool === name);
      return rows.length ? rows.sort((a, b) => b.b - a.b)[0].hr : null;
    };
    const build = (name: string, meta: any) => {
      const a = find(accounts, name), t = find(traffic, name), b = find(backend, name);
      const sent = t?.sent ?? 0, received = t?.received ?? 0;
      return {
        name: name || null,
        key: name || DEFAULT_POOL,
        ...meta,
        accounts: { total: a?.total ?? 0, blocked: a?.blocked ?? 0, overQuota: a?.overQuota ?? 0, active: t?.active ?? 0, usedGb: a?.usedGb ?? 0, quotaGb: a?.quotaGb ?? 0 },
        traffic: { sent, received, total: sent + received, requests: t?.requests ?? 0, domains: t?.domains ?? 0 },
        upstream: { total: b?.total ?? 0, working: b?.working ?? 0, dead: b?.dead ?? 0, blacklisted: b?.blacklisted ?? 0, avgLatencyMs: b?.avgLatencyMs ?? null },
        peakHour: peakOf(name),
      };
    };
    const list = [
      build('', { description: null, color: null, trafficMultiplier: 1, alwaysOnline: false, checkerEnabled: true, antiVpnEnabled: false, port: null, domain: null, isDefault: true }),
      ...pools.map((p) => build(p.name, {
        id: p.id, description: p.description, color: p.color, trafficMultiplier: p.trafficMultiplier, alwaysOnline: p.alwaysOnline,
        checkerEnabled: p.checkerEnabled, antiVpnEnabled: p.antiVpnEnabled, port: p.port, domain: p.domain, isDefault: false,
      })),
    ].filter((c) => c.accounts.total > 0 || c.upstream.total > 0 || !c.isDefault);

    return { period: { days, tz }, categories: list, daily };
  }

  // ===================================================================== pool (proxies amont)
  async pool() {
    const [status, byProvider, byProtocol, byCountry, latency, ageing, failDist, best, worst] = await Promise.all([
      this.q(Prisma.sql`SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE "isWorking" AND NOT "isBlacklisted") AS working,
          COUNT(*) FILTER (WHERE NOT "isWorking" AND NOT "isBlacklisted" AND NOT archived) AS dead,
          COUNT(*) FILTER (WHERE "isBlacklisted") AS blacklisted, COUNT(*) FILTER (WHERE archived) AS archived,
          COUNT(DISTINCT country) FILTER (WHERE "isWorking") AS countries, COUNT(DISTINCT provider) AS providers,
          AVG("averageLatency") FILTER (WHERE "isWorking" AND "averageLatency" IS NOT NULL) AS "avgLatencyMs",
          percentile_cont(0.5) WITHIN GROUP (ORDER BY "averageLatency") FILTER (WHERE "isWorking" AND "averageLatency" IS NOT NULL) AS "medianLatencyMs",
          COALESCE(SUM("successCount"),0) AS successes, COALESCE(SUM("failureCount"),0) AS failures
          FROM "BackendProxy"`),
      this.q(Prisma.sql`SELECT provider, COUNT(*) AS total,
          COUNT(*) FILTER (WHERE "isWorking" AND NOT "isBlacklisted") AS working,
          COUNT(*) FILTER (WHERE "isBlacklisted") AS blacklisted,
          AVG("averageLatency") FILTER (WHERE "isWorking" AND "averageLatency" IS NOT NULL) AS "avgLatencyMs",
          COALESCE(SUM("successCount"),0) AS successes, COALESCE(SUM("failureCount"),0) AS failures
          FROM "BackendProxy" GROUP BY provider ORDER BY working DESC, total DESC`),
      this.q(Prisma.sql`SELECT protocol, COUNT(*) AS total, COUNT(*) FILTER (WHERE "isWorking" AND NOT "isBlacklisted") AS working,
          AVG("averageLatency") FILTER (WHERE "isWorking" AND "averageLatency" IS NOT NULL) AS "avgLatencyMs"
          FROM "BackendProxy" GROUP BY 1 ORDER BY total DESC`),
      this.q(Prisma.sql`SELECT COALESCE(country, 'Unknown') AS country, COUNT(*) AS total,
          COUNT(*) FILTER (WHERE "isWorking" AND NOT "isBlacklisted") AS working,
          AVG("averageLatency") FILTER (WHERE "isWorking" AND "averageLatency" IS NOT NULL) AS "avgLatencyMs"
          FROM "BackendProxy" GROUP BY 1 ORDER BY working DESC, total DESC LIMIT 40`),
      this.q(Prisma.sql`SELECT
          COUNT(*) FILTER (WHERE "averageLatency" < 300) AS "lt300",
          COUNT(*) FILTER (WHERE "averageLatency" >= 300 AND "averageLatency" < 800) AS "lt800",
          COUNT(*) FILTER (WHERE "averageLatency" >= 800 AND "averageLatency" < 1500) AS "lt1500",
          COUNT(*) FILTER (WHERE "averageLatency" >= 1500 AND "averageLatency" < 3000) AS "lt3000",
          COUNT(*) FILTER (WHERE "averageLatency" >= 3000 AND "averageLatency" < 5000) AS "lt5000",
          COUNT(*) FILTER (WHERE "averageLatency" >= 5000) AS "gte5000",
          COUNT(*) FILTER (WHERE "averageLatency" IS NULL) AS unknown
          FROM "BackendProxy" WHERE "isWorking" AND NOT "isBlacklisted"`),
      this.q(Prisma.sql`SELECT
          COUNT(*) FILTER (WHERE "lastChecked" >= now() - interval '1 hour') AS "h1",
          COUNT(*) FILTER (WHERE "lastChecked" < now() - interval '1 hour' AND "lastChecked" >= now() - interval '6 hours') AS "h6",
          COUNT(*) FILTER (WHERE "lastChecked" < now() - interval '6 hours' AND "lastChecked" >= now() - interval '24 hours') AS "h24",
          COUNT(*) FILTER (WHERE "lastChecked" < now() - interval '24 hours' AND "lastChecked" >= now() - interval '7 days') AS "d7",
          COUNT(*) FILTER (WHERE "lastChecked" < now() - interval '7 days') AS "older"
          FROM "BackendProxy" WHERE NOT archived`),
      this.q(Prisma.sql`SELECT "failCount" AS fails, COUNT(*) AS n FROM "BackendProxy" WHERE NOT "isWorking" AND NOT archived
          GROUP BY 1 ORDER BY 1 LIMIT 15`),
      this.q(Prisma.sql`SELECT ip, port, protocol, country, provider, pool, "averageLatency" AS "latencyMs", "successCount", "failureCount",
          ROUND(100.0 * "successCount" / NULLIF("successCount" + "failureCount", 0), 1) AS "successPct"
          FROM "BackendProxy" WHERE "isWorking" AND NOT "isBlacklisted" AND "successCount" + "failureCount" >= 20
          ORDER BY "successCount"::float / NULLIF("successCount" + "failureCount", 0) DESC, "successCount" DESC LIMIT 15`),
      this.q(Prisma.sql`SELECT ip, port, protocol, country, provider, pool, "averageLatency" AS "latencyMs", "successCount", "failureCount",
          ROUND(100.0 * "successCount" / NULLIF("successCount" + "failureCount", 0), 1) AS "successPct"
          FROM "BackendProxy" WHERE "isWorking" AND NOT "isBlacklisted" AND "successCount" + "failureCount" >= 20
          ORDER BY "successCount"::float / NULLIF("successCount" + "failureCount", 0) ASC, "failureCount" DESC LIMIT 15`),
    ]);
    const inUse = this.engine.getActiveUpstreamProxies();
    return {
      status: status[0], byProvider, byProtocol, byCountry, latency: latency[0], ageing: ageing[0], failDistribution: failDist,
      best, worst,
      inUse: { proxies: inUse.length, connections: inUse.reduce((n, p) => n + p.connections, 0), top: inUse.sort((a, b) => b.connections - a.connections).slice(0, 10) },
    };
  }

  // ===================================================================== checker
  async checkerStats(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const [runs, health, agg] = await Promise.all([
      this.q(Prisma.sql`SELECT id, "startedAt", "durationMs", processed, ok, failed FROM "JobRun"
          WHERE kind = 'checker' AND "startedAt" >= ${since} ORDER BY "startedAt" DESC LIMIT 200`),
      this.q(Prisma.sql`SELECT "createdAt", total, working, dead, "healthPct" FROM "PoolHealthSnapshot"
          WHERE "createdAt" >= ${since} ORDER BY "createdAt" ASC`),
      this.q(Prisma.sql`SELECT COUNT(*) AS cycles, COALESCE(AVG("durationMs"),0) AS "avgDurationMs", COALESCE(MAX("durationMs"),0) AS "maxDurationMs",
          COALESCE(SUM(processed),0) AS tested, COALESCE(SUM(ok),0) AS alive,
          CASE WHEN SUM(processed) > 0 THEN 100.0 * SUM(ok) / SUM(processed) ELSE NULL END AS "alivePct",
          COALESCE(AVG(processed),0) AS "avgTested"
          FROM "JobRun" WHERE kind = 'checker' AND "startedAt" >= ${since}`),
    ]);
    // Échantillonnage pour borner la réponse (≤ 240 points).
    const step = Math.max(1, Math.ceil(health.length / 240));
    return {
      status: this.checker.getStatus(),
      intervalSec: this.settings.getPositiveNumber('proxyCheckInterval') || 900,
      summary: agg[0],
      runs,
      health: health.filter((_, i) => i % step === 0 || i === health.length - 1),
    };
  }

  // ===================================================================== scraper
  async scraperStats(days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const [sources, runs, agg] = await Promise.all([
      this.q(Prisma.sql`SELECT s.id, s.name, s.protocol, s.enabled, s.pool, s."failCount", s."lastError", s."lastSuccess", s."createdAt",
          COALESCE(b.total,0) AS total, COALESCE(b.working,0) AS working, b.lat AS "avgLatencyMs"
          FROM "ScraperSource" s LEFT JOIN (
            SELECT provider, COUNT(*) AS total, COUNT(*) FILTER (WHERE "isWorking" AND NOT "isBlacklisted") AS working,
                   AVG("averageLatency") FILTER (WHERE "isWorking" AND "averageLatency" IS NOT NULL) AS lat
            FROM "BackendProxy" GROUP BY provider) b ON b.provider = s.name
          ORDER BY working DESC, s.name ASC`),
      this.q(Prisma.sql`SELECT id, "startedAt", "durationMs", processed, ok, failed, extra FROM "JobRun"
          WHERE kind = 'scraper' AND "startedAt" >= ${since} ORDER BY "startedAt" DESC LIMIT 200`),
      this.q(Prisma.sql`SELECT COUNT(*) AS cycles, COALESCE(AVG("durationMs"),0) AS "avgDurationMs", COALESCE(AVG(processed),0) AS "avgUnique",
          COALESCE(SUM(ok),0) AS "sourcesOk", COALESCE(SUM(failed),0) AS "sourcesFailed"
          FROM "JobRun" WHERE kind = 'scraper' AND "startedAt" >= ${since}`),
    ]);
    const other = await this.q(Prisma.sql`SELECT provider, COUNT(*) AS total,
        COUNT(*) FILTER (WHERE "isWorking" AND NOT "isBlacklisted") AS working
        FROM "BackendProxy" WHERE provider IS NULL OR provider NOT IN (SELECT name FROM "ScraperSource") GROUP BY provider ORDER BY total DESC`);
    return { status: this.scraper.getStatus(), summary: agg[0], sources, otherProviders: other, runs };
  }

  // ===================================================================== security
  async security(days: number, isAdmin = true) {
    const since = dayStart(days);
    const sinceTs = new Date(Date.now() - days * 86400_000);
    const [bans, recentBans, errors, errorHosts, auditActions, auditDaily, auditUsers, sessions, keys, blocks, errorsDaily] = await Promise.all([
      this.q(Prisma.sql`SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE "expiresAt" IS NULL OR "expiresAt" > now()) AS active,
          COUNT(*) FILTER (WHERE "expiresAt" IS NULL) AS permanent,
          COUNT(*) FILTER (WHERE "createdBy" = 'auto') AS auto,
          COUNT(*) FILTER (WHERE "createdAt" >= ${sinceTs}) AS "createdInPeriod" FROM "BannedIp"`),
      this.q(Prisma.sql`SELECT ip, reason, "createdBy", "expiresAt", "createdAt" FROM "BannedIp" ORDER BY "createdAt" DESC LIMIT 10`),
      this.q(Prisma.sql`SELECT reason, SUM(count) AS count, COUNT(DISTINCT "userProxyId") AS accounts, COUNT(DISTINCT hostname) AS hosts
          FROM "ProxyUsageError" WHERE date >= ${since} GROUP BY reason ORDER BY count DESC`),
      this.q(Prisma.sql`SELECT hostname, SUM(count) AS count FROM "ProxyUsageError" WHERE date >= ${since} GROUP BY hostname ORDER BY count DESC LIMIT 10`),
      this.q(Prisma.sql`SELECT action, COUNT(*) AS count FROM "AuditLog" WHERE "createdAt" >= ${sinceTs} GROUP BY action ORDER BY count DESC LIMIT 15`),
      this.q(Prisma.sql`SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${SERVER_TZ}::text, 'YYYY-MM-DD') AS day, COUNT(*) AS count
          FROM "AuditLog" WHERE "createdAt" >= ${sinceTs} GROUP BY 1 ORDER BY 1`),
      this.q(Prisma.sql`SELECT "userEmail" AS email, COUNT(*) AS count FROM "AuditLog" WHERE "createdAt" >= ${sinceTs}
          GROUP BY 1 ORDER BY count DESC LIMIT 10`),
      this.q(Prisma.sql`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE "lastSeen" >= now() - interval '24 hours') AS "active24h" FROM "ActiveSession"`),
      this.q(Prisma.sql`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE "isActive") AS active,
          COUNT(*) FILTER (WHERE "expiresAt" IS NOT NULL AND "expiresAt" < now()) AS expired,
          COUNT(*) FILTER (WHERE "lastUsed" >= now() - interval '30 days') AS "used30d" FROM "ApiKey"`),
      this.q(Prisma.sql`SELECT COUNT(*) AS total FROM "TargetBlock"`),
      this.q(Prisma.sql`SELECT to_char((date AT TIME ZONE 'UTC') AT TIME ZONE ${SERVER_TZ}::text, 'YYYY-MM-DD') AS day, SUM(count) AS count
          FROM "ProxyUsageError" WHERE date >= ${since} GROUP BY date ORDER BY date`),
    ]);
    return {
      // Adresses IP bannies : la gestion des bans est réservée aux ADMIN.
      bans: bans[0], recentBans: isAdmin ? recentBans : [], errors, errorHosts, errorsDaily,
      audit: { actions: auditActions, daily: auditDaily, users: auditUsers },
      sessions: sessions[0], apiKeys: keys[0], targetBlocks: blocks[0]?.total ?? 0,
    };
  }
}
