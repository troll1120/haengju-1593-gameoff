import type { BphActor, BphFxContext } from "./bph-contract";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { HEIGHT, WIDTH } from "./geometry";
import type { UnitAttackSpell } from "./bph-unit-attack-spells";
import { unitSpellEffects, unitSpellHit, unitSpellSum } from "./bph-unit-attack-spells";

// Native QuasarSpell constants. projectileSpeed is not used by this instant beam.
const PATH_STEP = 0.15000000596046448 * BPH_WORLD_TO_PX;
const MAX_STEPS = 800;
const EDGE_EPSILON = 0.0010000000474974513 * BPH_WORLD_TO_PX;

export function initializeUnitQuasar(ctx: BphFxContext, actor: BphActor, spell: UnitAttackSpell): void {
  const data = actor.data;
  data.angle = Math.atan2(spell.y - actor.y, spell.x - actor.x);
  actor.x = Math.max(EDGE_EPSILON, Math.min(WIDTH - EDGE_EPSILON, actor.x));
  actor.y = Math.max(EDGE_EPSILON, Math.min(HEIGHT - EDGE_EPSILON, actor.y));
  data.wraps = Math.max(0, Math.floor(1 + unitSpellSum(ctx, spell, "TargetSpellBounce")));
  data.wrapsUsed = 0;
  const chance = ctx.chance(data.critChance);
  data.castCritical = Number(chance > 0 && (chance >= 1 || ctx.random() < chance));
  for (const effect of unitSpellEffects(ctx, spell, "HeroSpellCastApplyStatusChance")) {
    const status = effect.targets.targetStatus;
    if (status !== "Weak" && status !== "Vulnerable") continue;
    const chance = ctx.chance(effect.value);
    if (chance <= 0 || (chance < 1 && ctx.random() >= chance)) continue;
    const bonus = unitSpellEffects(ctx, spell, "StatusEffectDurationBonus")
      .filter(e => e.targets.targetStatus === status).reduce((sum, e) => sum + e.value, 0);
    data[status] = 5 * (1 + bonus);
  }
  data.pathCount = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    data.angle += (ctx.random() * 2 - 1) * Math.PI / 180;
    const dx = Math.cos(data.angle) * PATH_STEP, dy = Math.sin(data.angle) * PATH_STEP;
    const edgeX = dx > 0 ? (WIDTH - actor.x) / dx : dx < 0 ? -actor.x / dx : Infinity;
    const edgeY = dy > 0 ? (HEIGHT - actor.y) / dy : dy < 0 ? -actor.y / dy : Infinity;
    const travel = Math.max(0, Math.min(1, edgeX, edgeY));
    const from = { x: actor.x, y: actor.y };
    actor.x = Math.max(0, Math.min(WIDTH, actor.x + dx * travel));
    actor.y = Math.max(0, Math.min(HEIGHT, actor.y + dy * travel));
    // Numeric segments retain the real curved, discontinuous path for the parent renderer.
    const n = data.pathCount++;
    data[`path${n}FromX`] = from.x; data[`path${n}FromY`] = from.y;
    data[`path${n}ToX`] = actor.x; data[`path${n}ToY`] = actor.y;
    if (travel >= 1) continue;
    if (data.wrapsUsed >= data.wraps) break;
    data.wrapsUsed++;
    if (edgeX <= travel + 1e-12) actor.x = dx > 0 ? EDGE_EPSILON : WIDTH - EDGE_EPSILON;
    if (edgeY <= travel + 1e-12) actor.y = dy > 0 ? EDGE_EPSILON : HEIGHT - EDGE_EPSILON;
  }
  // Native builds the complete path before applying hits; hit-triggered RNG must
  // not steer later segments of the same beam.
  const tip = { x: actor.x, y: actor.y };
  for (let n = 0; n < data.pathCount; n++) {
    actor.x = data[`path${n}ToX`]; actor.y = data[`path${n}ToY`];
    hitSegment(ctx, actor, { x: data[`path${n}FromX`], y: data[`path${n}FromY`] });
  }
  actor.x = tip.x; actor.y = tip.y;
}
function hitSegment(ctx: BphFxContext, actor: BphActor, from: { readonly x: number; readonly y: number }): void {
  const dx = actor.x - from.x, dy = actor.y - from.y, length2 = dx * dx + dy * dy;
  const hits = ctx.run.enemies.filter(enemy => enemy.hp > 0 && !actor.targets.includes(enemy.id))
    .map(enemy => {
      const projection = length2 ? Math.max(0, Math.min(1,
        ((enemy.x - from.x) * dx + (enemy.y - from.y) * dy) / length2)) : 0;
      return { enemy, projection, distance: Math.hypot(enemy.x - from.x - projection * dx,
        enemy.y - from.y - projection * dy) };
    }).filter(hit => hit.distance <= actor.radius + 1e-9)
    .sort((a, b) => a.projection - b.projection || a.enemy.id - b.enemy.id);
  for (const { enemy } of hits) {
    actor.targets.push(enemy.id);
    unitSpellHit(ctx, actor, enemy);
    if (enemy.hp <= 0 || !actor.cast) continue;
    for (const status of ["Weak", "Vulnerable"] as const) {
      const duration = actor.data[status];
      if (!(duration > 0)) continue;
      const until = ctx.run.time + duration;
      const existing = ctx.state.statuses.find(s => s.id === status && s.targetId === enemy.id);
      if (existing) {
        if (until > existing.until) {
          existing.until = until; existing.cast = actor.cast;
          if (actor.cast.sourceId !== null) existing.sourceId = actor.cast.sourceId;
        }
      } else ctx.applyBuff({ target: enemy, side: "enemy", id: status, duration, power: 50,
        stacks: 1, cast: actor.cast });
    }
  }
}
