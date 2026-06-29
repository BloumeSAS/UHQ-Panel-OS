/** Découpe "FR,DE, us , ,GB" → ["FR","DE","US","GB"] (espaces/casse tolérés, vides ignorés). */
export function parseCountryCodes(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

/** Égalité de deux listes de codes pays, ordre indifférent (doublons non significatifs). */
export function sameCountrySet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

/** Tirage unique dans [min,max] (min==max ⇒ valeur fixe). Jamais utilisé en mode rotatif (cf. hashToRange, déterministe). */
export function rollFakeCount(min: number, max: number): number {
  if (min >= max) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Sous-plage à utiliser pour UN pays selon qu'il est "prioritaire" ou non —
 * découpe [min,max] en deux moitiés disjointes pour GARANTIR que tout pays
 * prioritaire tire toujours plus haut que tout pays non-prioritaire,
 * quel que soit le tirage de chacun. Pas de place pour départager en
 * valeur fixe (min>=max) : la priorité est alors sans effet.
 */
export function splitRangeForPriority(min: number, max: number, isPriority: boolean): [number, number] {
  if (min >= max) return [min, max];
  const mid = min + Math.floor((max - min) / 2);
  return isPriority ? [mid + 1, max] : [min, mid];
}

/**
 * FNV-1a — déterministe à partir d'un seed, jamais Math.random(). Choisi
 * pour son bon avalanche : deux fenêtres de temps consécutives (seeds qui
 * ne diffèrent que par un compteur +1) doivent donner des valeurs très
 * différentes, pas juste +1 (un hash polynomial naïf type `h*31+c` ne le
 * garantit pas et rendrait le mode rotatif quasi invisible).
 */
export function hashToRange(seed: string, min: number, max: number): number {
  if (min >= max) return min;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return min + ((h >>> 0) % (max - min + 1));
}
