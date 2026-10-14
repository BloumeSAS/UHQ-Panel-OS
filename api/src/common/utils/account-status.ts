/** Statut courant d'un compte proxy (ce qui le ferait refuser maintenant). */
/** Ce qui ferait refuser ce compte à l'instant T (l'historique des tentatives est séparé). */
export function accountStatus(p: { isBlocked: boolean; expiresAt: Date | null; totalGb: number; usedGb: number; ipWhitelist: string | null; port: number | null }) {
  return {
    blocked: p.isBlocked,
    expired: !!p.expiresAt && p.expiresAt.getTime() < Date.now(),
    quotaReached: p.totalGb > 0 && p.usedGb >= p.totalGb,
    ipRestricted: !!p.ipWhitelist && p.ipWhitelist.trim() !== '*' && p.ipWhitelist.trim() !== '',
    dedicatedPort: p.port ?? null,
  };
}
