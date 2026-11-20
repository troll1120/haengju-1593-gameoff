import { BPH_GENERALS } from "./bph-commanders";
import type { ChaosContext, ChaosState } from "./chaos-contract";
import { CHAOS_LEVELS, CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import type { Effect, Run, Squad } from "./rules";
import { bphEffectCombat } from "./rules";

export function chaosState(run: Run): ChaosState | undefined {
  if (run.chaos) return run.chaos;
  if (!run.bph) return;
  const general = BPH_GENERALS.find(name => name === run.commander);
  if (!general) return;
  // Every survival run starts its general at Lv1; the level grows from in-run XP (chaos-growth.ts), not purchases.
  const level = 1, mods = CHAOS_LEVELS[general][level]!;
  run.chaos = {
    general, level, mods, tick: 0, remainder: 0, xp: 0, hitXp: {}, feedWindow: -1, feeds: 0,
    attacks: 0, rangedAttacks: 0, kills: 0,
    trails: [], rings: [], pools: [], militia: [], fleet: [], orbitHits: {},
    pendingMilitia: [], pendingTrails: [], stomps: [],
    nextFleetTick: mods.general === "이순신" ? mods.every : 0,
    nextBeltTick: mods.general === "김시민" ? CHAOS_RULES.skills.cannon.passiveEvery[chaosSkillBand(level)] : 0, militiaGroup: 0,
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

/** On his feet: a fallen general neither fights nor earns. */
export function generalStanding(run: Run, squad: Squad): boolean {
  return squad.hp > 0 && squad.state !== "down" && squad.downUntil <= run.time;
}

export function chaosActive(run: Run): boolean {
  const state = run.chaos;
  return !!state && run.squads.some(squad => squad.general === state.general && generalStanding(run, squad));
}
