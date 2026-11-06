/**
 * Chooses template variants without immediate repetition: a variant used within the cooldown is
 * avoided while alternatives exist; otherwise the least recently used one is taken.
 */
export interface VariantPicker {
  pick<T extends { id: string }>(candidates: readonly T[], now: number): T | undefined;
  /** Marks a variant as used (pick does this already). */
  use(id: string, now: number): void;
  lastUsed(id: string): number | undefined;
}

export function createVariantPicker(options: {
  cooldownMs: number;
  random: () => number;
}): VariantPicker {
  const used = new Map<string, number>();

  return {
    pick(candidates, now) {
      if (candidates.length === 0) return undefined;
      const fresh = candidates.filter((c) => {
        const at = used.get(c.id);
        return at === undefined || now - at >= options.cooldownMs;
      });
      let chosen: (typeof candidates)[number] | undefined;
      if (fresh.length > 0) {
        chosen = fresh[Math.floor(options.random() * fresh.length)];
      } else {
        chosen = [...candidates].sort((a, b) => (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0))[0];
      }
      if (chosen) used.set(chosen.id, now);
      return chosen;
    },
    use(id, now) {
      used.set(id, now);
    },
    lastUsed(id) {
      return used.get(id);
    },
  };
}
