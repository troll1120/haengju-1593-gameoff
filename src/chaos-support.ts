import type { ChaosAttack, ChaosContext } from "./chaos-contract";
import { CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import { allyRoute, crosses, distance, fieldPoint, fortGates, fortRect } from "./geometry";
import type { Point } from "./geometry";
import { might } from "./rules";
import { riverBank } from "./river";
import { castChaosSkill } from "./chaos-skill-cast";

/** Retired belt readers report no protection or shield geometry at any level. */
export function chaosBeltReduction(_ctx: Pick<ChaosContext, "run" | "state" | "squad">, _at: Point): number {
  return 0;
}

/** Existing display consumers must not receive phantom shield positions. */
export function chaosBeltPositions(_ctx: Pick<ChaosContext, "run" | "state">): Point[] {
  return [];
}

function tickBelt(ctx: ChaosContext, active: boolean): void {
  const { run, state, squad } = ctx, mods = state.mods;
  if (mods.general !== "김시민") return;
  const every = CHAOS_RULES.skills.cannon.passiveEvery[chaosSkillBand(state.level)];
  if (state.nextBeltTick <= 0) state.nextBeltTick = every;
  if (state.tick >= state.nextBeltTick) {
    state.nextBeltTick = state.tick + every;
    // At Lv20 each shell also lands armyRatio of the army's blows since the last volley; that tally never outlives a volley.
    const army = (state.blows ?? 0) * (mods.armyRatio ?? 0);
    if (mods.armyRatio) state.blows = 0;
    if (active) castChaosSkill(run, squad, ctx.effects, true, army);
  }
}

/** Called after the parent increments state.attacks for an original direct attack. */
export function chaosSupportAttack(ctx: ChaosContext, attack: ChaosAttack): void {
  const { state, run } = ctx, mods = state.mods;
  if (run.phase !== "playing") return;
  if (mods.general === "김시민") {
    if (mods.armyRatio) state.blows = (state.blows ?? 0) + attack.amount;
    return;
  }
  if (mods.general === "곽재우") {
    rally(ctx, attack);
    return;
  }
  if (mods.general !== "사명대사") return;
  if (state.attacks % CHAOS_RULES.skills.bell.passiveEvery[chaosSkillBand(state.level)] !== 0) return;
  castChaosSkill(run, ctx.squad, ctx.effects, true);
}

/** 곽재우's militia ride the army at Lv20: every `rally` army attacks the militiaman nearest the struck enemy, and within
 *  reach of it, strikes it at once for rallyRatio of that blow. His own strike clock is left alone. */
function rally(ctx: ChaosContext, attack: ChaosAttack): void {
  const { state, run } = ctx, mods = state.mods;
  if (mods.general !== "곽재우" || !mods.rally || state.attacks % mods.rally) return;
  const target = run.enemies.find(enemy => enemy === attack.target && enemy.hp > 0 && enemy.kind !== "ship" && enemy.y <= riverBank() - 8);
  if (!target) return;
  const member = state.militia.filter(member => distance(member, target) <= mods.reach && !crosses(fortRect(run.fort), member, target))
    .sort((a, b) => distance(a, target) - distance(b, target) || a.id - b.id)[0];
  if (!member) return;
  member.aimX = target.x; member.aimY = target.y; member.struckTick = state.tick;
  ctx.effects.push({ kind: "swing", x: target.x, y: target.y, fromX: member.x, fromY: member.y, value: 1, by: "spearman" });
  ctx.combat.applyDamage({ target, amount: attack.amount * (mods.rallyRatio ?? 0), source: ctx.squad, spellId: "chaos:militia" });
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
        const goal = fieldPoint(run.fort, target, 12), next = allyRoute(run.fort, member, goal, 12, fortGates(!!run.bph));
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
}
