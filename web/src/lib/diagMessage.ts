export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info';
export interface DiagCheck {
  id: string;
  status: CheckStatus;
  data?: Record<string, any>;
}

/** Remplace {clé} par la valeur correspondante (tableaux joints par une virgule). */
export function fillText(text: string, data?: Record<string, any>) {
  return text.replace(/\{(\w+)\}/g, (_, k) => {
    if (k === 'heartbeat') return data?.heartbeat ? ' + heartbeat' : '';
    const v = data?.[k];
    return v === undefined || v === null ? '—' : Array.isArray(v) ? v.join(', ') : String(v);
  });
}

/** Message d'un contrôle de diagnostic : `diag.<id>.<raison|état>`. */
export function diagMessage(t: (key: string) => string, c: DiagCheck): string {
  const reason = c.data?.reason as string | undefined;
  const key = [`diag.${c.id}.${reason ?? c.status}`, `diag.${c.id}.${c.status}`].find((k) => t(k) !== k);
  return key ? fillText(t(key), c.data) : '';
}
