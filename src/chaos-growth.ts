import { CHAOS_LEVELS, CHAOS_MAX_LEVEL } from "./chaos-contract";
import type { ChaosState } from "./chaos-contract";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { generalGrowthRank } from "./bph-general-growth-upgrade";
import { chaosState, generalStanding } from "./chaos-state";
import type { Enemy, Run, Squad } from "./rules";

/**
 * In-run general growth (general-growth/design.md 1.3-1.4, 2). Event driven, no RNG:
 * a kill by a general's own body or skill, a skill hit (capped per cast) and any boss kill grant XP;
 * battle coins buy one level at a time from the same pool as recruiting.
 * The run's generals share the one pool in run.chaos (owner DM 1794983077 "장수들 경험치는 공유로"): whoever earns, all of
 * them stand at its level, so a general who joins starts where the run already is. What a general earns himself is split
 * among the generals on their feet, so the pool rises about as fast as one general alone and not once per general (measured
 * 2026-11-18 against the 9th build: unsplit, three generals held 1.5-3.8 times the XP at 8:00-10:00; split, 0.7-2.3 times).
 * xpScale is the single knob for the natural curve (target: Lv5 at 3:00-4:00, Lv12-14 at 15:00).
 */
export const CHAOS_GROWTH = {
  killXp: 2, hitXp: .5, hitXpPerCast: 3, bossXp: 25, xpScale: 2,
  feed: { base: 4, step: 2, perSupply: 2 },
} as const;

/** Cumulative XP needed to stand at `level`: 4(L-1)² + 8(L-1). */
export function chaosLevelXp(level: number): number {
  const steps = level - 1;
  return 4 * steps * steps + 8 * steps;
}

export function chaosLevelForXp(xp: number): number {
  let level = 1;
  while (level < CHAOS_MAX_LEVEL && xp + 1e-9 >= chaosLevelXp(level + 1)) level++;
  return level;
}

/** The first and last levels sit on the endpoints, with equal time per level. */
export function survivalGeneralLevel(seconds: number, rank: number): number {
  const steps = 9 + 2 * rank, duration = 900 - 60 * rank;
  return 1 + Math.min(steps, Math.floor((seconds + 1e-8) * steps / duration));
}

export function advanceSurvivalGeneralLevel(run: Run): void {
  if (!run.bph?.survival || !run.chaos || run.chaos.manualLevel) return;
  const level = survivalGeneralLevel(run.time, generalGrowthRank(run.bph.save));
  if (level !== run.chaos.level) raiseChaosLevel(run.chaos, level);
  run.chaos.mods = CHAOS_LEVELS[run.chaos.general][Math.max(5, level)]!;
}

export function raiseChaosLevel(state: ChaosState, level: number): void {
  state.level = Math.max(1, Math.min(CHAOS_MAX_LEVEL, level));
  state.xp = Math.max(state.xp, chaosLevelXp(state.level));
  state.mods = CHAOS_LEVELS[state.general][state.level]!;
}

/** The run's generals on their feet, who alone earn (design 1.3); none where no pool runs, its owner not being in the run. */
function earners(run: Run): Squad[] {
  const state = run.chaos;
  return state && run.squads.some(squad => squad.general === state.general) ? run.squads.filter(squad => generalStanding(run, squad)) : [];
}

function gain(run: Run, amount: number): void {
  const state = run.chaos;
  if (!state || amount <= 0) return;
  state.xp += amount * CHAOS_GROWTH.xpScale;
  const level = chaosLevelForXp(state.xp);
  if (level > state.level) raiseChaosLevel(state, level);
}

/** Called once per enemy death. `killer`: the general whose own body or skill dealt the killing blow, if one did. */
export function chaosKillXp(run: Run, enemy: Enemy, killer?: Squad): void {
  if (run.bph?.survival) return;
  const up = earners(run);
  if (!up.length) return;
  gain(run, (enemy.boss || enemy.kind === "ukita" ? CHAOS_GROWTH.bossXp : 0)
    + (killer && up.includes(killer) ? CHAOS_GROWTH.killXp / up.length : 0));
}

/** One landed hit of `caster`'s skill cast `castId`; a cast pays at most hitXpPerCast. */
export function chaosHitXp(run: Run, castId: number, caster: Squad): void {
  if (run.bph?.survival) return;
  const state = run.chaos, up = earners(run);
  if (!state || !up.includes(caster)) return;
  const before = state.hitXp[castId] ?? 0, after = Math.min(CHAOS_GROWTH.hitXpPerCast, before + CHAOS_GROWTH.hitXp);
  state.hitXp[castId] = after;
  gain(run, (after - before) / up.length);
}

export function chaosFeedPrice(level: number): number {
  return CHAOS_GROWTH.feed.base + CHAOS_GROWTH.feed.step * (level - 1);
}

function feedWindow(run: Run): number {
  return Math.floor(run.time / BPH_SURVIVAL_TABLE.supplySeconds);
}

export function chaosFeedOffer(run: Run): { readonly price: number; readonly left: number } | undefined {
  if (run.bph?.survival) return;
  const state = run.bph ? chaosState(run) : undefined;
  if (!state || state.level >= CHAOS_MAX_LEVEL) return;
  const used = state.feedWindow === feedWindow(run) ? state.feeds : 0;
  return { price: chaosFeedPrice(state.level), left: CHAOS_GROWTH.feed.perSupply - used };
}

export function feedChaosGeneral(run: Run): boolean {
  const battle = run.bph, offer = chaosFeedOffer(run), state = run.chaos;
  if (!battle || !offer || !state || run.phase !== "playing" || offer.left <= 0 || run.gold < offer.price) return false;
  const window = feedWindow(run);
  if (state.feedWindow !== window) { state.feedWindow = window; state.feeds = 0; }
  state.feeds++;
  run.gold -= offer.price;
  battle.save.coins = run.gold;
  raiseChaosLevel(state, state.level + 1);
  return true;
}
