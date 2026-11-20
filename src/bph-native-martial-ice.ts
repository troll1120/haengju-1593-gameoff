import { BPH_WORLD_TO_PX } from "./bph-contract";
import type { BphActor, BphFxContext, BphFxEvent } from "./bph-contract";
import { martialActor, martialOwner, segmentDistance } from "./bph-native-martial-common";
import { bphEffectCombat } from "./rules";
import type { Enemy, Unit } from "./rules";
import { HEIGHT, WIDTH } from "./geometry";
import { BPH_MONSTERS } from "./bph-data";

/** Frozen StatusEffectDefinition, sharedassets1.assets:2691. No visual colors. */
export const MARTIAL_FROZEN = {
  duration: 5, hits: 4, scale: 1.7999999523162842, friction: 0.6000000238418579,
  push: 1, maxSpeed: 24, impactMinSpeed: 1, impactRadius: 0.3499999940395355,
  impactAttack: 1, fullDamageSpeed: 10, impactKnockback: 1,
  bounce: 0.800000011920929, speedKept: 0.699999988079071,
  repeatCooldown: 0.3499999940395355, shatterRadius: 1.5, shatterStun: 1.5,
} as const;

export function freezeMartialEnemy(ctx: BphFxContext, source: Unit, target: Enemy): void {
  const actor = martialActor(ctx, { unit: source, target, amount: 0, critical: false,
    extraProjectiles: 0, bounces: 0 }, "Frozen");
  actor.kind = "mine"; actor.x = actor.toX = target.x; actor.y = actor.toY = target.y;
  actor.targets = [target.id]; actor.until = ctx.run.time + MARTIAL_FROZEN.duration;
  actor.radius = MARTIAL_FROZEN.impactRadius * BPH_WORLD_TO_PX;
  Object.assign(actor.data, { martialIce: 1, hits: MARTIAL_FROZEN.hits, scale: MARTIAL_FROZEN.scale,
    vx: 0, vy: 0, previousStunUntil: ctx.run.time + target.stun,
    attackPower: BPH_MONSTERS[target.bphProfileId ?? ""]?.damage ?? 0 });
  target.stun = Math.max(target.stun, MARTIAL_FROZEN.duration);
  target.strikeAt = 0;
  ctx.applyBuff({ target, source, side: "enemy", id: "Frozen", duration: MARTIAL_FROZEN.duration,
    power: 0, stacks: 1, cast: actor.cast });
}

function releaseIce(ctx: BphFxContext, actor: BphActor, shatter: boolean): void {
  const target = ctx.run.enemies.find(enemy => enemy.id === actor.targets[0]);
  ctx.state.statuses = ctx.state.statuses.filter(status => status.cast !== actor.cast || status.id !== "Frozen");
  if (target) {
    const otherStun = ctx.state.statuses.filter(status => status.targetId === target.id
      && (status.id === "Stun" || status.id === "Frozen")).reduce((until, status) => Math.max(until, status.until), 0);
    target.stun = Math.max(0, actor.data.previousStunUntil - ctx.run.time, otherStun - ctx.run.time);
  }
  actor.until = ctx.run.time;
  if (!shatter) return;
  for (const enemy of ctx.run.enemies) if (enemy.hp > 0
    && Math.hypot(enemy.x - actor.x, enemy.y - actor.y) <= MARTIAL_FROZEN.shatterRadius * BPH_WORLD_TO_PX)
    enemy.stun = Math.max(enemy.stun, MARTIAL_FROZEN.shatterStun);
  ctx.emitEvent({ kind: "ice-broken", targetId: actor.targets[0], side: "enemy", cast: actor.cast ?? null });
}

/** Pre-damage interception: the ice takes four hits, never four HP damage. */
export function martialIceHit(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind !== "before-enemy-damage" || event.hit.prevented || event.hit.amount <= 0) return;
  const actor = ctx.state.actors.find(candidate => candidate.data.martialIce === 1
    && candidate.targets[0] === event.enemy.id && candidate.until > ctx.run.time);
  if (!actor) return;
  event.hit.prevented = true;
  actor.data.hits--;
  if (event.source) {
    const dx = event.enemy.x - event.source.x, dy = event.enemy.y - event.source.y;
    const length = Math.hypot(dx, dy);
    // Inference: manager impulse 1.5 * frozen multiplier 5 * authored push 1.
    actor.data.vx += (length ? dx / length : 1) * 7.5 * MARTIAL_FROZEN.push;
    actor.data.vy += (length ? dy / length : 0) * 7.5 * MARTIAL_FROZEN.push;
    const factor = Math.min(1, MARTIAL_FROZEN.maxSpeed / (Math.hypot(actor.data.vx, actor.data.vy) || 1));
    actor.data.vx *= factor; actor.data.vy *= factor;
  }
  if (actor.data.hits <= 0) releaseIce(ctx, actor, true);
}

export function tickMartialIce(ctx: BphFxContext, dt: number): void {
  const done = new Set<number>(), move = bphEffectCombat(ctx.run, ctx.run.bph?.fxEvents ?? []).knock;
  for (const actor of ctx.state.actors) {
    if (actor.data.martialIce !== 1) continue;
    const target = ctx.run.enemies.find(enemy => enemy.id === actor.targets[0]);
    const source = martialOwner(ctx, actor);
    if (!target || target.hp <= 0 || ctx.run.time >= actor.until) {
      if (actor.until > ctx.run.time || actor.data.hits > 0) releaseIce(ctx, actor, false);
      done.add(actor.id); continue;
    }
    const elapsed = Math.max(0, Math.min(dt, ctx.run.time - actor.startedAt));
    const speed = Math.hypot(actor.data.vx, actor.data.vy);
    const from = { x: target.x, y: target.y };
    // Inference: serialized friction is exponential drag per second.
    const decay = Math.exp(-MARTIAL_FROZEN.friction * elapsed);
    move(target, { x: from.x - actor.data.vx * BPH_WORLD_TO_PX, y: from.y - actor.data.vy * BPH_WORLD_TO_PX },
      speed * (1 - decay) / MARTIAL_FROZEN.friction * BPH_WORLD_TO_PX);
    actor.x = actor.toX = target.x; actor.y = actor.toY = target.y;
    actor.data.vx *= decay; actor.data.vy *= decay;
    if (target.x <= 0 || target.x >= WIDTH) actor.data.vx *= -MARTIAL_FROZEN.bounce;
    if (target.y <= 0 || target.y >= HEIGHT) actor.data.vy *= -MARTIAL_FROZEN.bounce;
    if (speed < MARTIAL_FROZEN.impactMinSpeed) continue;
    for (const enemy of ctx.run.enemies) {
      const key = `hit:${enemy.id}`;
      if (enemy === target || enemy.hp <= 0 || (actor.data[key] ?? -Infinity) > ctx.run.time
        || segmentDistance(enemy, from, target) > actor.radius) continue;
      actor.data[key] = ctx.run.time + MARTIAL_FROZEN.repeatCooldown;
      // Inference: linear speed/fullDamageSpeed fraction of the frozen foe's attack.
      // Target damage is supplied by its original profile when present.
      const damage = actor.data.attackPower ?? 0;
      if (damage > 0) ctx.applyDamage({ target: enemy, source,
        amount: damage * MARTIAL_FROZEN.impactAttack * Math.min(1, speed / MARTIAL_FROZEN.fullDamageSpeed),
        spellId: "Frozen", cast: actor.cast });
      move(enemy, target, MARTIAL_FROZEN.impactKnockback * BPH_WORLD_TO_PX);
      actor.data.vx *= -MARTIAL_FROZEN.bounce * MARTIAL_FROZEN.speedKept;
      actor.data.vy *= -MARTIAL_FROZEN.bounce * MARTIAL_FROZEN.speedKept;
    }
  }
  ctx.state.actors = ctx.state.actors.filter(actor => !done.has(actor.id));
}
