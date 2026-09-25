import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Octets → unité lisible (Go par défaut pour les gros volumes). */
/**
 * Unité "Go" du panel : Go DÉCIMAL (1 Go = 1 000 000 000 octets), comme les
 * fournisseurs de proxies — même constante que l'API (common/utils/units.ts).
 */
export const BYTES_PER_GB = 1_000_000_000;

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1000)));
  return `${(bytes / 1000 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
