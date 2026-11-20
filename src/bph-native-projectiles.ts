import { BPH_WORLD_TO_PX } from "./bph-contract";
import type { BphActor, BphFxContext } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { bphStats } from "./bph-combat";
import { HEIGHT, WIDTH } from "./geometry";
import type { MartialAttack } from "./bph-native-martial-common";
import { martialActor, martialOwner, segmentDistance, segmentFraction } from "./bph-native-martial-common";
import { nativeEffects } from "./bph-native-passives-common";

// Spell_RiderPiercer (sharedassets1.assets:2687), Hero.FireShotgunVolley
// 0x84B2A8 and native ShotgunArrowProjectile/ColossusPiercerSpell constants.
const RIDER_SPEED = 8;
const RIDER_RETAIN = 0.5;
const ARROW_SPEED = 8;
const ARROW_RADIUS = 0.11999999731779099 * BPH_WORLD_TO_PX;
const PIERCER_RADIUS = 0.18000000715255737 * BPH_WORLD_TO_PX;

export function fireMartialArrow(ctx: BphFxContext, attack: MartialAttack, angle: number): BphActor {
  const profileId = ctx.profileId(attack.unit) ?? "";
  const piercer = profileId === "Hero5_Rider" || profileId === "Hero5_DinoRider";
  const spellId = piercer ? "Spell_RiderPiercer" : profileId;
  const actor = martialActor(ctx, attack, spellId);
  const speed = (piercer ? RIDER_SPEED : ARROW_SPEED) * BPH_WORLD_TO_PX;
  const range = bphStats(attack.unit, ctx.run)?.range ?? BPH_PROFILES[profileId].range;
  Object.assign(actor.data, { martialProjectile: 1, vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed, piercing: Number(piercer), retain: RIDER_RETAIN,
    bounces: attack.bounces, bounceRange: range,
    remaining: piercer ? Infinity : range * BPH_WORLD_TO_PX });
  if (profileId === "Hero5_Rider") {
    const bounces = nativeEffects(ctx, attack.unit, "TargetSpellBounce")
      .reduce((sum, effect) => sum + (effect.targets.targetSpell === spellId ? effect.value : 0), 0);
    if (bounces > 0) actor.data.riderBounces = bounces;
  }
  actor.radius = piercer ? PIERCER_RADIUS : ARROW_RADIUS;
  // No authored duration for RiderPiercer: exit the battlefield, never home.
  actor.until = ctx.run.time + (piercer ? Math.hypot(WIDTH, HEIGHT) / speed + 1 : 8);
  return actor;
}

/** Call instead of the normal shot branch, with already-resolved modifiers. */
export function martialProjectileAttack(ctx: BphFxContext, attack: MartialAttack): boolean {
  const id = ctx.profileId(attack.unit);
  if (id !== "Hero6_Shotgun" && id !== "Hero5_Rider") return false;
  const count = (id === "Hero6_Shotgun" ? Number(BPH_PROFILES[id].raw.shotgunArrowCount) : 1)
    + Math.max(0, Math.floor(attack.extraProjectiles));
  const cone = id === "Hero6_Shotgun" ? Number(BPH_PROFILES[id].raw.shotgunConeAngleDegrees) * Math.PI / 180 : 0;
  const aim = Math.atan2(attack.target.y - attack.unit.y, attack.target.x - attack.unit.x);
  for (let index = 0; index < count; index++)
    fireMartialArrow(ctx, attack, aim + (count > 1 ? index / (count - 1) - 0.5 : 0) * cone);
  return true;
}

export function tickMartialProjectiles(ctx: BphFxContext, dt: number): void {
  const done = new Set<number>();
  for (const actor of [...ctx.state.actors]) {
    if (actor.data.martialProjectile !== 1) continue;
    const source = martialOwner(ctx, actor);
    if (!source) { done.add(actor.id); continue; }
    const elapsed = Math.max(0, Math.min(dt, ctx.run.time - actor.startedAt, actor.until - (ctx.run.time - dt)));
    if (elapsed === 0) continue;
    const from = { x: actor.x, y: actor.y };
    const speed = Math.hypot(actor.data.vx, actor.data.vy);
    const travel = Math.min(speed * elapsed, actor.data.remaining);
    const to = { x: from.x + actor.data.vx / speed * travel, y: from.y + actor.data.vy / speed * travel };
    actor.data.remaining -= travel;
    const hits = ctx.run.enemies.filter(enemy => enemy.hp > 0 && !actor.targets.includes(enemy.id)
      && segmentDistance(enemy, from, to) <= actor.radius)
      .sort((a, b) => segmentFraction(a, from, to) - segmentFraction(b, from, to) || a.id - b.id);
    let bounced = false;
    for (const target of hits) {
      actor.targets.push(target.id);
      ctx.applyDamage({ target, source, amount: actor.power, critical: actor.data.critical === 1,
        spellId: actor.cast?.spellId, cast: actor.cast, attackId: actor.attackId });
      const piercing = actor.data.piercing === 1;
      if (piercing) actor.power *= actor.data.retain;
      const bounceKey = piercing ? "riderBounces" : "bounces";
      const next = actor.data[bounceKey] > 0 ? ctx.run.enemies.filter(enemy => enemy.hp > 0
        && !actor.targets.includes(enemy.id)
        && Math.hypot(enemy.x - target.x, enemy.y - target.y) <= actor.data.bounceRange * BPH_WORLD_TO_PX)
        .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0] : undefined;
      if (next) {
        const angle = Math.atan2(next.y - target.y, next.x - target.x);
        actor.x = target.x; actor.y = target.y; actor.toX = next.x; actor.toY = next.y;
        actor.data.vx = Math.cos(angle) * ARROW_SPEED * BPH_WORLD_TO_PX;
        actor.data.vy = Math.sin(angle) * ARROW_SPEED * BPH_WORLD_TO_PX;
        if (!piercing) actor.data.remaining = actor.data.bounceRange * BPH_WORLD_TO_PX;
        actor.data[bounceKey]--; bounced = true;
      } else if (piercing) continue;
      else done.add(actor.id);
      break;
    }
    if (!bounced) { actor.x = to.x; actor.y = to.y; }
    if (actor.data.remaining <= 0 || ctx.run.time >= actor.until || actor.x < 0 || actor.x > WIDTH || actor.y < 0 || actor.y > HEIGHT)
      done.add(actor.id);
  }
  ctx.state.actors = ctx.state.actors.filter(actor => !done.has(actor.id));
}
