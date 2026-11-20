import { BPH_GENERALS } from "./bph-commanders";
import type { ChaosContext, ChaosState } from "./chaos-contract";
import type { Effect, Run } from "./rules";
import { bphEffectCombat } from "./rules";
import { growthFor } from "./skill-growth";

export function chaosState(run: Run): ChaosState | undefined {
  if (run.chaos) return run.chaos;
  if (!run.bph) return;
  const general = BPH_GENERALS.find(name => name === run.commander);
  if (!general) return;
  const growth = growthFor(general, run);
  if (!growth.army) return;
  const mods = growth.army;
  run.chaos = {
    general, level: growth.level, mods, tick: 0, remainder: 0,
    attacks: 0, rangedAttacks: 0, kills: 0,
    trails: [], rings: [], pools: [], militia: [], fleet: [], orbitHits: {},
    pendingMilitia: [], pendingTrails: [], stomps: [],
    nextFleetTick: mods.general === "이순신" ? mods.every : 0,
    nextBeltTick: mods.general === "김시민" ? mods.every : 0, militiaGroup: 0,
  };
  return run.chaos;
}

export function chaosContext(run: Run, effects: Effect[]): ChaosContext | undefined {
  const state = chaosState(run);
  if (!state) return;
  const squad = run.squads.find(member => member.general === state.general);
  if (!squad) return;
  return { run, state, squad, effects, combat: bphEffectCombat(run, effects) };
}

export function chaosActive(run: Run): boolean {
  const state = run.chaos;
  return !!state && run.squads.some(squad => squad.general === state.general
    && squad.hp > 0 && squad.state !== "down" && squad.downUntil <= run.time);
}
