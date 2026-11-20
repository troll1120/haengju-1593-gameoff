import { distance } from "./geometry";
import type { Point } from "./geometry";
import type { ChaosAttack, ChaosContext, ChaosTrail } from "./chaos-contract";
import { CHAOS_RULES } from "./chaos-contract";
import { might } from "./rules";
import type { Unit } from "./rules";

function segmentDistance(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x, dy = to.y - from.y;
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy);
}

function startTrail(ctx: ChaosContext, entry: Omit<ChaosTrail, "id" | "startedTick" | "untilTick" | "hits">): void {
  const { state, run } = ctx;
  const trail: ChaosTrail = { id: run.nextId++, ...entry, startedTick: state.tick,
    untilTick: state.tick + CHAOS_RULES.trail.lifetimeTicks, hits: [] };
  if (state.trails.length >= CHAOS_RULES.trail.capacity) {
    const expiredHit = state.trails.findIndex(trail => state.tick - trail.startedTick >= CHAOS_RULES.trail.hitTicks);
    if (expiredHit < 0) {
      state.pendingTrails.push(trail);
      return;
    }
    state.trails.splice(expiredHit, 1);
  }
  state.trails.push(trail);
}

function pulse(ctx: ChaosContext, input: { readonly at: Point; readonly radius: number; readonly power: number; readonly targets: number; readonly source?: Unit }): void {
  const { state, run, combat, squad } = ctx;
  for (const enemy of run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && distance(enemy, input.at) <= input.radius)
    .sort((a, b) => distance(a, input.at) - distance(b, input.at) || a.id - b.id).slice(0, input.targets)) {
    combat.applyDamage({ target: enemy, amount: input.power, source: input.source ?? squad, spellId: "chaos:stomp", position: input.at });
  }
  if (state.rings.length >= CHAOS_RULES.ring.capacity) state.rings.shift();
  state.rings.push({ ...input.at, id: run.nextId++, radius: input.radius, startedTick: state.tick, untilTick: state.tick + CHAOS_RULES.ring.lifetimeTicks });
}

export function chaosOffenseAttack(ctx: ChaosContext, attack: ChaosAttack): void {
  const { state } = ctx, mods = state.mods;
  switch (mods.general) {
    case "신립": {
      if (state.attacks % mods.every) return;
      const length = Math.max(.001, distance(attack.unit, attack.target));
      const dx = (attack.target.x - attack.unit.x) / length, dy = (attack.target.y - attack.unit.y) / length;
      // Keep the authored length, but center distant ranged targets on the swept path.
      const shift = Math.max(0, length - mods.length / 2);
      const from = { x: attack.unit.x + dx * shift, y: attack.unit.y + dy * shift };
      const to = { x: from.x + dx * mods.length, y: from.y + dy * mods.length };
      const entry = { from, to, width: mods.width, power: attack.amount * mods.ratio, source: attack.unit.id };
      startTrail(ctx, entry);
      break;
    }
    case "황진":
      if (state.attacks % mods.every === 0)
        pulse(ctx, { at: attack.unit, radius: mods.radius, power: attack.amount * mods.ratio, targets: mods.targets, source: attack.unit });
      break;
  }
}

function tickTrail(ctx: ChaosContext, trail: ChaosTrail): void {
  const age = ctx.state.tick - trail.startedTick;
  if (age <= 0 || age > CHAOS_RULES.trail.hitTicks || trail.hits.length >= CHAOS_RULES.trail.targets) return;
  const point = (fraction: number): Point => ({
    x: trail.from.x + (trail.to.x - trail.from.x) * fraction,
    y: trail.from.y + (trail.to.y - trail.from.y) * fraction,
  });
  const from = point((age - 1) / CHAOS_RULES.trail.hitTicks), to = point(age / CHAOS_RULES.trail.hitTicks);
  const source = ctx.run.squads.flatMap(squad => [squad, ...squad.soldiers]).find(unit => unit.id === trail.source);
  for (const enemy of ctx.run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && !trail.hits.includes(enemy.id)
    && segmentDistance(enemy, from, to) <= trail.width / 2).sort((a, b) => distance(a, trail.from) - distance(b, trail.from) || a.id - b.id)) {
    if (trail.hits.length >= CHAOS_RULES.trail.targets) break;
    trail.hits.push(enemy.id);
    ctx.combat.applyDamage({ target: enemy, amount: trail.power, source, spellId: "chaos:trail", position: from });
  }
}

export function tickChaosOffense(ctx: ChaosContext): void {
  const { state } = ctx;
  state.trails = state.trails.filter(trail => trail.untilTick > state.tick);
  state.rings = state.rings.filter(ring => ring.untilTick > state.tick);
  for (const trail of [...state.trails, ...state.pendingTrails].sort((a, b) => a.id - b.id)) tickTrail(ctx, trail);
  state.pendingTrails = state.pendingTrails.filter(trail => state.tick - trail.startedTick < CHAOS_RULES.trail.hitTicks
    && trail.hits.length < CHAOS_RULES.trail.targets);
  for (const stomp of state.stomps) if (stomp.dueTick <= state.tick)
    pulse(ctx, { at: stomp.at, radius: stomp.radius, power: stomp.power, targets: Infinity });
  state.stomps = state.stomps.filter(stomp => stomp.dueTick > state.tick);
}

export function chaosOffenseCast(ctx: ChaosContext): void {
  const mods = ctx.state.mods;
  if (ctx.state.level < 20 || mods.general !== "황진") return;
  const radius = 113 + mods.manualRadiusBonus;
  for (const [delay, scale] of [[9, .7], [18, 1]])
    ctx.state.stomps.push({ at: { x: ctx.squad.x, y: ctx.squad.y },
      dueTick: ctx.state.tick + delay, radius: radius * scale, power: mods.stompPower * might(ctx.run) });
}

export function chaosChargeReturn(ctx: ChaosContext, route: { readonly from: Point; readonly to: Point; readonly power: number }): void {
  if (ctx.state.level < 20 || ctx.state.mods.general !== "신립") return;
  const length = Math.max(.001, distance(route.from, route.to));
  for (const offset of [-18, 18]) {
    const dx = -(route.to.y - route.from.y) / length * offset;
    const dy = (route.to.x - route.from.x) / length * offset;
    const entry = {
      from: { x: route.from.x + dx, y: route.from.y + dy },
      to: { x: route.to.x + dx, y: route.to.y + dy },
      width: ctx.state.mods.width, power: route.power * ctx.state.mods.ratio, source: ctx.squad.id,
    };
    startTrail(ctx, entry);
  }
}
