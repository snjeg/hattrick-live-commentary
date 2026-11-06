import type { Formation } from './types';

/**
 * Decodes a CHPP formation code such as 1030502 (3-5-2): a leading 1, then two digits each for
 * defenders, midfielders and attackers. Returns undefined for anything else, including codes whose
 * outfield players do not add up to 10.
 */
export function decodeFormation(code: number | string): Formation | undefined {
  const m = /^1(\d{2})(\d{2})(\d{2})$/.exec(String(code).trim());
  if (!m) return undefined;
  const defenders = Number(m[1]);
  const midfielders = Number(m[2]);
  const attackers = Number(m[3]);
  if (defenders + midfielders + attackers !== 10) return undefined;
  return { defenders, midfielders, attackers, label: `${defenders}-${midfielders}-${attackers}` };
}
