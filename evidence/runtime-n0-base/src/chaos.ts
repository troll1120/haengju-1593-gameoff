import { fortRect, guardPoint, sideOf, SIDES } from "./geometry";
import type { Point } from "./geometry";
import type { ChaosAttack } from "./chaos-contract";
import type { Effect, Enemy, Run, Squad, Unit } from "./rules";
import { pressure } from "./rules";
import { holdDongnae, onLine } from "./skills-unique";
import { chaosActive, chaosContext, chaosState } from "./chaos-state";
import { chaosOffenseAttack, chaosOffenseCast, tickChaosOffense, chaosChargeReturn } from "./chaos-offense";
import { chaosBeltReduction, chaosSupportAttack, chaosSupportCast, chaosSupportKill, tickChaosSupport } from "./chaos-support";
import { tickChaosFleet } from "./chaos-fleet";

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
}

export function chaosDirectKill(run: Run, at: Point, effects: Effect[]): void {
  const ctx = chaosContext(run, effects);
  if (!ctx || !chaosActive(run) || ctx.state.general !== "곽재우") return;
  chaosSupportKill(ctx, at);
}

export function chaosAfterCast(run: Run, squad: Squad, effects: Effect[]): void {
  const ctx = chaosContext(run, effects);
  if (!ctx || ctx.squad !== squad || !chaosActive(run)) return;
  chaosOffenseCast(ctx);
  chaosSupportCast(ctx);
  if (ctx.state.level < 20 || ctx.state.general !== "송상현") return;
  const first = run.uniqueSkills?.at(-1);
  if (first?.kind !== "hold") return;
  const side = sideOf(fortRect(run.fort), { x: (first.from.x + first.to.x) / 2, y: (first.from.y + first.to.y) / 2 });
  const threat = pressure(run);
  const next = SIDES.filter(value => value !== side).sort((a, b) => threat[b] - threat[a])[0];
  const mods = ctx.state.mods;
  if (mods.general !== "송상현") return;
  effects.push(...holdDongnae({ run, squad, aim: guardPoint(run.fort, next, 40) }, {
    lineLengthBonus: mods.lineLengthBonus, lineHalfWidth: mods.lineHalfWidth,
    lineSeconds: mods.lineSeconds, linePowerScale: mods.linePowerScale,
  }));
  const second = run.uniqueSkills?.at(-1);
  if (second?.kind === "hold") {
    // Lifetime power is immutable after creation; replace the authored second line.
    run.uniqueSkills = run.uniqueSkills?.map(line => line === second ? { ...line, power: first.power * .5 } : line);
  }
}

export function chaosAfterReturn(run: Run, route: { readonly from: Point; readonly to: Point; readonly power: number }, effects: Effect[]): void {
  const ctx = chaosContext(run, effects);
  if (ctx && chaosActive(run)) chaosChargeReturn(ctx, route);
}

export function chaosMovement(run: Run): number {
  const state = run.chaos;
  return state?.mods.general === "신립" && chaosActive(run) ? 1 + state.mods.moveRatio : 1;
}

export function chaosGuard(run: Run, unit: Unit): number {
  const state = run.chaos;
  if (!state || !chaosActive(run) || state.mods.general !== "김시민") return 1;
  const squad = run.squads.find(squad => squad.general === state.general);
  return squad ? 1 - chaosBeltReduction({ run, state, squad }, unit) : 1;
}

export function chaosCastleGuard(run: Run): number {
  const state = run.chaos;
  return state?.mods.general === "김시민" && chaosActive(run) ? 1 - state.mods.castleReduction : 1;
}

export function chaosDefense(run: Run) {
  const state = run.chaos;
  if (state?.general !== "김시민") return;
  return state.defense ??= { unitIncoming: 0, unitPrevented: 0, castleIncoming: 0, castlePrevented: 0 };
}

export function chaosDirectMultiplier(run: Run, enemy: Enemy): number {
  const state = run.chaos;
  return state?.mods.general === "송상현" && chaosActive(run) && run.uniqueSkills?.some(skill =>
    skill.kind === "hold" && run.time < skill.until && onLine(skill, enemy))
    ? 1 + state.mods.lineRatio : 1;
}

export function clearChaos(run: Run): void {
  const state = run.chaos;
  if (!state) return;
  state.trails = []; state.rings = []; state.pools = []; state.militia = []; state.fleet = [];
  state.pendingTrails = []; state.pendingMilitia = []; state.stomps = []; state.orbitHits = {};
  if (run.bph) for (const key of Object.keys(run.bph.fx.timers))
    if (key.startsWith("chaos:pool:lastHealTick:")) delete run.bph.fx.timers[key];
}

export { chaosState };
