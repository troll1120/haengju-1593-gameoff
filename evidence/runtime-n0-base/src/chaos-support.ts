import type { ChaosAttack, ChaosContext } from "./chaos-contract";
import { CHAOS_RULES } from "./chaos-contract";
import { allyRoute, contains, crosses, distance, fieldPoint, fortRect, gapToRect } from "./geometry";
import type { Point } from "./geometry";
import { might } from "./rules";
import { riverBank } from "./river";

/** Final damage reduction, applied once by the native allied damage owner. */
export function chaosBeltReduction(ctx: Pick<ChaosContext, "run" | "state" | "squad">, at: Point): number {
  const { run, state, squad } = ctx, mods = state.mods;
  return run.phase === "playing" && squad.hp > 0 && squad.state !== "down" && squad.downUntil <= run.time
    && mods.general === "김시민" && gapToRect(fortRect(run.fort), at) <= mods.width ? mods.reduction : 0;
}

function inBelt(ctx: Pick<ChaosContext, "run" | "state">, at: Point): boolean {
  const wall = fortRect(ctx.run.fort), mods = ctx.state.mods;
  return mods.general === "김시민" && !contains(wall, at) && gapToRect(wall, at) <= mods.pulseWidth;
}

/** Four quarter-lap spaced shields on the middle of the outer belt. No IDs or RNG. */
export function chaosBeltPositions(ctx: Pick<ChaosContext, "run" | "state">): Point[] {
  const { state } = ctx, mods = state.mods;
  if (mods.general !== "김시민" || state.level < 20) return [];
  const wall = fortRect(ctx.run.fort, mods.width / 2);
  const width = wall.right - wall.left, height = wall.bottom - wall.top, lap = 2 * (width + height);
  return Array.from({ length: CHAOS_RULES.orbit.count }, (_, index) => {
    let along = ((state.tick % CHAOS_RULES.orbit.periodTicks) / CHAOS_RULES.orbit.periodTicks
      + index / CHAOS_RULES.orbit.count) % 1 * lap;
    if (along < width) return { x: wall.left + along, y: wall.top };
    along -= width;
    if (along < height) return { x: wall.right, y: wall.top + along };
    along -= height;
    if (along < width) return { x: wall.right - along, y: wall.bottom };
    return { x: wall.left, y: wall.bottom - (along - width) };
  });
}

function tickBelt(ctx: ChaosContext, active: boolean): void {
  const { run, state, combat, squad } = ctx, mods = state.mods;
  if (mods.general !== "김시민") return;
  if (state.nextBeltTick <= 0) state.nextBeltTick = mods.every;
  if (state.tick >= state.nextBeltTick) {
    state.nextBeltTick = state.tick + mods.every;
    if (active) for (const target of run.enemies) {
      if (target.hp <= 0 || target.kind === "ship" || !inBelt(ctx, target)) continue;
      combat.applyDamage({ target, amount: mods.power * might(run), source: squad, spellId: "chaos:belt" });
      if (run.phase !== "playing") return;
    }
  }
  if (!active || state.level < 20) return;
  const shields = chaosBeltPositions(ctx);
  for (const target of run.enemies) {
    if (target.hp <= 0 || target.kind === "ship") continue;
    if (state.tick - (state.orbitHits[target.id] ?? -Infinity) < CHAOS_RULES.orbit.cooldownTicks) continue;
    if (!shields.some(at => distance(at, target) <= CHAOS_RULES.orbit.radius)) continue;
    state.orbitHits[target.id] = state.tick;
    combat.applyDamage({ target, amount: CHAOS_RULES.orbit.power * might(run), source: squad, spellId: "chaos:orbit" });
    if (run.phase !== "playing") return;
  }
  for (const id of Object.keys(state.orbitHits)) {
    const key = Number(id);
    if (state.tick - state.orbitHits[key] >= CHAOS_RULES.orbit.cooldownTicks) delete state.orbitHits[key];
  }
}

/** Called after the parent increments state.attacks for an original direct attack. */
export function chaosSupportAttack(ctx: ChaosContext, attack: ChaosAttack): void {
  const { state, run } = ctx, mods = state.mods;
  if (run.phase !== "playing" || mods.general !== "사명대사") return;
  if (state.attacks % mods.every !== 0) return;
  state.pools = state.pools.filter(pool => state.tick < pool.untilTick);
  if (state.pools.length >= mods.count) {
    state.pools.sort((a, b) => a.startedTick - b.startedTick || a.id - b.id).shift();
  }
  state.pools.push({ id: run.nextId++, x: attack.unit.x, y: attack.unit.y, radius: mods.radius,
    startedTick: state.tick, untilTick: state.tick + mods.lifetime,
    nextTick: state.tick + mods.healEvery, healRatio: mods.healRatio });
}

/** Called only for original direct kills while the commander is active. */
export function chaosSupportKill(ctx: ChaosContext, at: Point): void {
  const { state, run } = ctx, mods = state.mods;
  if (run.phase !== "playing" || mods.general !== "곽재우") return;
  state.kills++;
  if (state.kills % mods.every === 0)
    state.pendingMilitia.push({ at: { x: at.x, y: at.y }, dueTick: state.tick + 1 });
}

function tickMilitia(ctx: ChaosContext): void {
  const { state, run } = ctx, mods = state.mods;
  if (mods.general !== "곽재우") return;
  state.militia = state.militia.filter(member => state.tick < member.untilTick);
  const pending = state.pendingMilitia;
  state.pendingMilitia = [];
  for (const spawn of pending) {
    if (spawn.dueTick > state.tick) { state.pendingMilitia.push(spawn); continue; }
    if (state.militia.length >= mods.count) {
      const oldest = [...state.militia].sort((a, b) => a.startedTick - b.startedTick || a.id - b.id)[0];
      oldest.untilTick = state.tick + mods.lifetime;
      continue;
    }
    const projected = fieldPoint(run.fort, spawn.at, 12);
    const at = { x: projected.x, y: Math.min(projected.y, riverBank() - 8) };
    state.militia.push({ ...at, id: run.nextId++, startedTick: state.tick, untilTick: state.tick + mods.lifetime,
      nextTick: state.tick + mods.period, aimX: at.x, aimY: at.y, struckTick: -100 });
  }
  const ordered = [...state.militia].sort((a, b) => a.id - b.id);
  const group = state.level >= 20 && ordered.length === 12 && state.tick % mods.groupEvery === 0
    ? ordered.slice(state.militiaGroup * 4, state.militiaGroup * 4 + 4) : [];
  if (group.length) state.militiaGroup = (state.militiaGroup + 1) % 3;
  for (const member of ordered) {
    const targets = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship"
      && enemy.y <= riverBank() - 8 && distance(member, enemy) <= mods.reach)
      .sort((a, b) => distance(member, a) - distance(member, b) || a.id - b.id);
    const target = targets[0];
    if (target) {
      member.aimX = target.x; member.aimY = target.y;
      if (distance(member, target) > mods.cleaveRadius) {
        const goal = fieldPoint(run.fort, target, 12), next = allyRoute(run.fort, member, goal, 12);
        const gap = distance(member, next), step = Math.min(gap, mods.moveSpeed / 30);
        if (gap > 0) {
          const at = fieldPoint(run.fort, { x: member.x + (next.x - member.x) / gap * step,
            y: member.y + (next.y - member.y) / gap * step }, 12);
          member.x = at.x; member.y = Math.min(at.y, riverBank() - 8);
        }
      }
    }
    const boosted = group.includes(member);
    if (!boosted && state.tick < member.nextTick) continue;
    // Replace a normal hit only when it is due on this tick; future hits keep their deadline.
    if (state.tick >= member.nextTick) member.nextTick += mods.period;
    if (!target || crosses(fortRect(run.fort), member, target)) continue;
    member.aimX = target.x; member.aimY = target.y; member.struckTick = state.tick;
    ctx.effects.push({ kind: "swing", x: target.x, y: target.y, fromX: member.x, fromY: member.y, value: 1, by: "spearman" });
    for (const enemy of targets.filter(enemy => distance(enemy, target) <= mods.cleaveRadius
      && !crosses(fortRect(run.fort), member, enemy)).slice(0, 2)) {
      ctx.combat.applyDamage({ target: enemy, amount: (boosted ? mods.groupPower : mods.power) * might(run),
        source: ctx.squad, spellId: boosted ? "chaos:militia-group" : "chaos:militia" });
      if (run.phase !== "playing") return;
    }
  }
}

function tickPools(ctx: ChaosContext): void {
  const { state, run } = ctx, mods = state.mods;
  if (!run.bph || mods.general !== "사명대사") return;
  const timers = run.bph.fx.timers;
  state.pools = state.pools.filter(pool => state.tick < pool.untilTick);
  const due = state.pools.filter(pool => state.tick >= pool.nextTick);
  for (const pool of due) pool.nextTick += mods.healEvery;
  for (const squad of run.squads) for (const unit of [squad, ...squad.soldiers]) {
    if (unit.hp <= 0) continue;
    const key = `chaos:pool:lastHealTick:${unit.id}`;
    if (state.tick - (timers[key] ?? -Infinity) < mods.healEvery) continue;
    if (!due.some(pool => distance(unit, pool) <= pool.radius)) continue;
    const covering = state.pools.filter(pool => distance(unit, pool) <= pool.radius);
    const strongest = covering.sort((a, b) => b.healRatio - a.healRatio || a.id - b.id)[0];
    if (!strongest) continue;
    timers[key] = state.tick;
    ctx.combat.heal(unit, unit.maxHp * strongest.healRatio * (unit.kind === "general" ? mods.generalHealScale : 1), ctx.squad);
    if (run.phase !== "playing") return;
  }
}

/** Successful manual heal cast hook; the original manual healing remains separate. */
export function chaosSupportCast(ctx: ChaosContext): void {
  const { state, run } = ctx;
  if (run.phase !== "playing" || state.mods.general !== "사명대사" || state.level < 20) return;
  const pools = state.pools.filter(pool => state.tick < pool.untilTick)
    .sort((a, b) => a.startedTick - b.startedTick || a.id - b.id).slice(0, CHAOS_RULES.purification.count);
  for (const target of run.enemies) {
    if (target.hp <= 0 || target.kind === "ship" || !pools.some(pool => distance(target, pool) <= CHAOS_RULES.purification.radius)) continue;
    ctx.combat.applyDamage({ target, amount: CHAOS_RULES.purification.power * might(run), source: ctx.squad, spellId: "chaos:purification" });
    if (run.phase !== "playing") return;
  }
}

/** Parent advances state.tick exactly once per integer simulation tick before this call. */
export function tickChaosSupport(ctx: ChaosContext, active: boolean): void {
  if (ctx.run.phase !== "playing") {
    if (ctx.run.phase === "won" || ctx.run.phase === "lost") {
      ctx.state.militia = []; ctx.state.pendingMilitia = []; ctx.state.pools = []; ctx.state.orbitHits = {};
    }
    return;
  }
  tickBelt(ctx, active);
  if (ctx.run.phase !== "playing") return;
  tickMilitia(ctx);
  if (ctx.run.phase !== "playing") return;
  tickPools(ctx);
}
