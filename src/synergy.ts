import type { Run, SoldierKind } from "./rules";

export const SYNERGY_THRESHOLDS = [2, 4, 6] as const;
/** One class star track replaces headcount synergy and blacksmith multipliers. */
export function synergy(run: Run, kind: SoldierKind) {
  const count = run.squads.reduce((sum, squad) => sum + squad.soldiers.reduce((n, unit) =>
    n + (unit.kind === kind ? 3 ** (unit.tier - 1) : 0), 0), 0);
  const tier = run.drill[kind];
  return {
    count, tier,
    power: 1 + tier * (kind === "spearman" ? 1.435 : kind === "monk" ? 1.23 : kind === "archer" ? .895 : kind === "panokseon" ? .75 : .71),
    tempo: 1 + tier * (kind === "archer" ? .25 : .23),
    guard: 1 + tier * (kind === "spearman" ? 1.4 : kind === "monk" ? .95 : kind === "panokseon" ? .75 : .65),
    reach: tier * (kind === "spearman" ? 27 : kind === "monk" ? 18 : kind === "panokseon" ? 0 : 4.5),
  };
}
