import type { Point } from "./geometry";
import type { ChaosAttack } from "./chaos-contract";
import type { Effect, Enemy, Run, Squad, Unit } from "./rules";
import { chaosActive, chaosContext, chaosState } from "./chaos-state";
import { chaosOffenseAttack, tickChaosOffense, chaosChargeReturn } from "./chaos-offense";
import { chaosSupportAttack, chaosSupportKill, tickChaosSupport } from "./chaos-support";
import { chaosFleetAttack, tickChaosFleet } from "./chaos-fleet";

/** No new state, IDs, effects or RNG are touched when the army level is zero. */
export function tickChaos(run: Run, dt: number, effects: Effect[]): void {
  const ctx = chaosContext(run, effects);
  if (!ctx) return;
  const { state } = ctx;
  state.remainder += dt;
  while (state.remainder + 1e-9 >= 1 / 30) {
    state.remainder -= 1 / 30;
    state.tick++;
    if (run.bph) run.bph.fx.counters["general:tick"] = state.tick;
    tickChaosOffense(ctx);
    tickChaosSupport(ctx, chaosActive(run));
    tickChaosFleet(ctx, chaosActive(run));
  }
}

export function chaosAfterAttack(run: Run, attack: ChaosAttack, effects: Effect[]): void {
  const ctx = chaosContext(run, effects);
  if (!ctx || !chaosActive(run)) return;
  ctx.state.attacks++;
  chaosOffenseAttack(ctx, attack);
  chaosSupportAttack(ctx, attack);
  chaosFleetAttack(ctx, attack);
}

export function chaosDirectKill(run: Run, at: Point, effects: Effect[]): void {
  const ctx = chaosContext(run, effects);
  if (!ctx || !chaosActive(run) || ctx.state.general !== "곽재우") return;
  chaosSupportKill(ctx, at);
}

export function chaosAfterReturn(run: Run, route: { readonly from: Point; readonly to: Point; readonly power: number }, effects: Effect[]): void {
  const ctx = chaosContext(run, effects);
  if (ctx && chaosActive(run)) chaosChargeReturn(ctx, route);
}

export function chaosMovement(run: Run): number {
  const state = run.chaos;
  return state?.mods.general === "신립" && chaosActive(run) ? 1 + state.mods.moveRatio : 1;
}

export function chaosGuard(_run: Run, _unit: Unit): number {
  return 1;
}

export function chaosCastleGuard(_run: Run): number {
  return 1;
}

export function chaosDefense(run: Run) {
  const state = run.chaos;
  if (state?.general !== "김시민") return;
  return state.defense ??= { unitIncoming: 0, unitPrevented: 0, castleIncoming: 0, castlePrevented: 0 };
}

export function chaosDirectMultiplier(_run: Run, _enemy: Enemy): number {
  return 1;
}

export function clearChaos(run: Run): void {
  if (run.chaosSkills) run.chaosSkills.events = [];
  const state = run.chaos;
  if (!state) return;
  state.trails = []; state.rings = []; state.pools = []; state.militia = []; state.fleet = [];
  state.pendingTrails = []; state.pendingMilitia = []; state.stomps = []; state.orbitHits = {};
  if (run.bph) for (const key of Object.keys(run.bph.fx.timers))
    if (key.startsWith("chaos:pool:lastHealTick:")) delete run.bph.fx.timers[key];
}

export { chaosState };
