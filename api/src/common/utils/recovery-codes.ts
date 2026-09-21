import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';

const GROUP_LEN = 4;

/** Génère `count` codes à usage unique, format "XXXX-XXXX" (lisibles, faciles à recopier). */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(GROUP_LEN).toString('hex').toUpperCase().slice(0, GROUP_LEN * 2);
    codes.push(`${raw.slice(0, GROUP_LEN)}-${raw.slice(GROUP_LEN)}`);
  }
  return codes;
}

/** Hash chaque code (bcrypt) et sérialise la liste pour stockage en base. */
export async function hashRecoveryCodes(codes: string[]): Promise<string> {
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
  return JSON.stringify(hashes);
}

/**
 * Vérifie `code` contre la liste de hash stockée. Si valide, renvoie la
 * liste mise à jour (JSON, hash consommé retiré) — l'appelant doit la
 * persister pour que le code ne soit plus utilisable une seconde fois.
 * `null` si invalide ou si aucune liste n'existe.
 */
export async function consumeRecoveryCode(storedJson: string | null | undefined, code: string): Promise<string | null> {
  if (!storedJson) return null;
  let hashes: string[];
  try {
    hashes = JSON.parse(storedJson);
  } catch {
    return null;
  }
  const normalized = code.trim().toUpperCase();
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(normalized, hashes[i])) {
      const remaining = [...hashes.slice(0, i), ...hashes.slice(i + 1)];
      return JSON.stringify(remaining);
    }
  }
  return null;
}
