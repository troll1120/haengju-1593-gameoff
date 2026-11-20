export type DamageClass = "arrow" | "melee" | "artillery" | "skill";
export type BossId = "konishi" | "wakizaka" | "kobayakawa" | "ukita" | "kato_yoshiaki" | "kurushima" | "nabeshima" | "todo";
export const BOSS_IDS: readonly BossId[] = ["konishi", "wakizaka", "kobayakawa", "ukita", "kato_yoshiaki", "kurushima", "nabeshima", "todo"];
export const FULL_BOSS_ART = ["konishi", "kato_yoshiaki", "kurushima", "nabeshima", "todo", "wakizaka", "kobayakawa", "ukita"] as const;
export const BOSSES = {
  konishi: { pattern: "gunner", second: "salvo", resist: "arrow", weak: "melee" },
  wakizaka: { pattern: "ninja", second: "shield", resist: "melee", weak: "artillery" },
  kobayakawa: { pattern: "siege", second: "fire", resist: "artillery", weak: "arrow" },
  ukita: { pattern: "decree", second: "fire", resist: null, weak: "skill" },
  kato_yoshiaki: { pattern: "cavalry", second: "ladder", resist: "arrow", weak: "melee" },
  kurushima: { pattern: "ninja", second: "shield", resist: "melee", weak: "artillery" },
  nabeshima: { pattern: "gunner", second: "fire", resist: "artillery", weak: "arrow" },
  todo: { pattern: "siege", second: "ladder", resist: null, weak: "skill" },
} as const satisfies Record<BossId, { pattern: string; second: string; resist: DamageClass | null; weak: DamageClass }>;

export function matchup(boss: BossId, attack: DamageClass, final = false): number {
  if (final) return attack === "skill" ? 1.5 : 1;
  const identity = BOSSES[boss];
  return identity.resist === attack ? .4 : identity.weak === attack ? 1.5 : 1;
}

/** One counter of each class per run, plus one neutral; finals have no class resistance. */
export function bossRoster(random: () => number, startingClass: DamageClass): BossId[] {
  const roster: BossId[] = [];
  for (const resist of ["arrow", "melee", "artillery", null]) {
    const candidates = BOSS_IDS.filter(id => BOSSES[id].resist === resist);
    roster.push(candidates[Math.floor(random() * candidates.length)]);
  }
  for (let i = roster.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [roster[i], roster[j]] = [roster[j], roster[i]];
  }
  if (BOSSES[roster[0]].resist === startingClass) {
    const safe = roster.findIndex(id => BOSSES[id].resist !== startingClass);
    [roster[0], roster[safe]] = [roster[safe], roster[0]];
  }
  const finals = BOSS_IDS.filter(id => !roster.includes(id));
  roster.push(finals[Math.floor(random() * finals.length)]);
  return roster;
}
