import { SETTING_DEFS, SECRET_MASK } from '../../config/settings.service';

/**
 * Normalise n'importe quel fichier de réglages en `{ clé: valeur }` :
 *  - fichier plat `{ "siteName": "…" }`,
 *  - `{ settings: {…} }` (export de config),
 *  - sauvegarde complète `{ data: { setting: [{key,value}] } }` (ou `data.settings`).
 * Ne garde que les clés CONNUES du panel (aucune pollution de la base, pas de marqueurs `__*`).
 */
export function extractSettings(raw: any): Record<string, string> {
  const root = raw && typeof raw === 'object' ? raw : {};
  const data = root.data && typeof root.data === 'object' ? root.data : root;
  let flat: Record<string, any> = {};
  if (Array.isArray(data.setting)) {
    for (const r of data.setting) if (r && typeof r.key === 'string') flat[r.key] = r.value;
  } else if (data.settings && typeof data.settings === 'object') {
    flat = data.settings;
  } else {
    flat = data;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) {
    if (!(k in SETTING_DEFS) || k === 'updateCheckUrl') continue;
    if (v === null || v === undefined || typeof v === 'object') continue;
    const s = String(v);
    if (s === SECRET_MASK || /^•+$/.test(s)) continue; // jamais un masque par-dessus un vrai secret
    out[k] = s;
  }
  return out;
}
