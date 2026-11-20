import { BPH_WORLD_TO_PX } from "./bph-contract";
import type { BphActor, BphFxContext, BphFxEvent, BphFxState } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { martialSum, martialUnits } from "./bph-native-martial-common";
import { bphEffectCombat } from "./rules";
import type { Enemy, Unit } from "./rules";
import type { Point } from "./geometry";

type Impulse = { readonly target: Enemy; vx: number; vy: number };
const impulses = new WeakMap<BphFxState, Impulse[]>();

/** KnockbackManager level1:35447. Continuous exponential decay is inferred. */
export function martialImpulse(ctx: BphFxContext, target: Enemy, push: Point): void {
  if (target.hp <= 0) return;
  const ice = ctx.state.actors.find(actor => actor.data.martialIce === 1
    && actor.targets[0] === target.id && actor.until > ctx.run.time);
  if (ice) {
    const vx = ice.data.vx + push.x, vy = ice.data.vy + push.y;
    const scale = Math.min(1, 24 / (Math.hypot(vx, vy) || 1));
    ice.data.vx = vx * scale; ice.data.vy = vy * scale;
    return;
  }
  let active = impulses.get(ctx.state);
  if (!active) { active = []; impulses.set(ctx.state, active); }
  let entry = active.find(item => item.target === target);
  if (!entry) { entry = { target, vx: 0, vy: 0 }; active.push(entry); }
  entry.vx += push.x; entry.vy += push.y;
  const scale = Math.min(1, 30 / (Math.hypot(entry.vx, entry.vy) || 1));
  entry.vx *= scale; entry.vy *= scale;
}

export function tickMartialImpulses(ctx: BphFxContext, dt: number): void {
  const active = impulses.get(ctx.state);
  if (!active) return;
  const decay = Math.exp(-10 * dt);
  const move = bphEffectCombat(ctx.run, ctx.run.bph?.fxEvents ?? []).knock;
  for (const entry of active) {
    if (entry.target.hp <= 0 || !ctx.run.enemies.includes(entry.target)) continue;
    const speed = Math.hypot(entry.vx, entry.vy);
    move(entry.target, { x: entry.target.x - entry.vx * BPH_WORLD_TO_PX,
      y: entry.target.y - entry.vy * BPH_WORLD_TO_PX }, speed * (1 - decay) / 10 * BPH_WORLD_TO_PX);
    entry.vx *= decay; entry.vy *= decay;
  }
  impulses.set(ctx.state, active.filter(entry => entry.target.hp > 0 && ctx.run.enemies.includes(entry.target)
    && Math.hypot(entry.vx, entry.vy) > 0.001));
}

/** Call only at the existing actor's newly-entered collision, before damage. */
export function martialActorContact(ctx: BphFxContext, actor: BphActor, target: Enemy): void {
  const unit = martialUnits(ctx).find(candidate => candidate.id === actor.ownerId && candidate.hp > 0
    && ctx.unitInfo(candidate)?.lifeId === actor.data.lifeId);
  if (!unit) return;
  const id = ctx.profileId(unit);
  let force = 0;
  if (actor.kind === "dash" && (id === "Hero2_Monk" || id === "Hero5_Dino" || id === "Hero5_DinoRider"))
    force = Number(BPH_PROFILES[id].raw.dashPushForce);
  else if (actor.kind === "wheel" && id === "Hero6_Skelewheel")
    force = 1.5 * Number(BPH_PROFILES[id].raw.wheelHitKnockbackMultiplier);
  if (force === 0) return;
  const angle = actor.kind === "wheel" ? actor.data.angle
    : Math.atan2(actor.toY - actor.data.fromY, actor.toX - actor.data.fromX);
  martialImpulse(ctx, target, { x: Math.cos(angle) * force, y: Math.sin(angle) * force });
}

/** Call at each fixed wobble boundary before the parent's wheel movement slice. */
export function martialWheelWobble(ctx: BphFxContext, actor: BphActor, through: number): void {
  if (actor.kind !== "wheel" || actor.data.profiles !== 1) return;
  const owner = martialUnits(ctx).find(unit => unit.id === actor.ownerId && unit.hp > 0
    && ctx.unitInfo(unit)?.lifeId === actor.data.lifeId && ctx.profileId(unit) === "Hero6_Skelewheel");
  if (!owner) return;
  const raw = BPH_PROFILES.Hero6_Skelewheel.raw;
  const interval = Number(raw.wheelDirectionChangeIntervalSeconds);
  const ticks = Math.floor((Math.min(through, actor.until) - actor.startedAt + 1e-7) / interval);
  let completed = actor.data.martialWobbleTicks ?? 0;
  while (completed < ticks) {
    // Inference: independent +/-40-degree perturbations of current travel direction.
    actor.data.angle += (ctx.random() * 2 - 1) * Number(raw.wheelDirectionWobbleDegrees) * Math.PI / 180;
    completed++;
  }
  actor.data.martialWobbleTicks = completed;
}

/** Slice time only; the parent's existing tickWheel still owns movement/contact. */
export function tickMartialWheel(ctx: BphFxContext, actor: BphActor,
  step: { readonly dt: number; readonly move: (dt: number) => void }): void {
  const end = ctx.run.time;
  const interval = Number(BPH_PROFILES.Hero6_Skelewheel.raw.wheelDirectionChangeIntervalSeconds);
  let cursor = Math.max(actor.startedAt, end - step.dt);
  try {
    while (cursor < Math.min(end, actor.until)) {
      martialWheelWobble(ctx, actor, cursor);
      const tick = Math.floor((cursor - actor.startedAt + 1e-7) / interval);
      const boundary = actor.startedAt + (tick + 1) * interval;
      const next = Math.min(end, actor.until, boundary);
      ctx.run.time = next;
      step.move(next - cursor);
      cursor = next;
    }
    if (end < actor.until) martialWheelWobble(ctx, actor, end);
  } finally {
    ctx.run.time = end;
  }
}

export function martialBlackHole(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind === "step") {
    const move = bphEffectCombat(ctx.run, ctx.run.bph?.fxEvents ?? []).knock;
    for (const unit of martialUnits(ctx)) {
      if (unit.hp <= 0 || ctx.profileId(unit) !== "Hero9_BlackHole") continue;
      const radius = martialSum(ctx, unit, "HeroMonsterPullRadius") * BPH_WORLD_TO_PX;
      if (radius <= 0) continue;
      for (const enemy of ctx.run.enemies) {
        const distance = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
        // Inference: pull 1 world unit/s, stop at the source without overshooting.
        if (enemy.hp > 0 && distance > 0 && distance <= radius)
          move(enemy, unit, -Math.min(distance, BPH_WORLD_TO_PX * event.dt));
      }
    }
  }
  if (event.kind === "spellHit" && event.spellId === "Spell_TeleportAndDamageAoe" && event.source
    && ctx.profileId(event.source) === "Hero9_BlackHole"
    && (!event.cast || event.cast.sourceLifeId === ctx.unitInfo(event.source)?.lifeId)) {
    const bonus = martialSum(ctx, event.source, "TeleporterAoeKnockbackMultiplier");
    if (bonus <= 0) return;
    // The original teleport base force is absent. Use the manager's 1.5 baseline;
    // value 1 is +100%, and the upgrade enables this otherwise-unimplemented push.
    const from = event.cast?.position ?? event.position;
    const dx = event.target.x - from.x, dy = event.target.y - from.y;
    const length = Math.hypot(dx, dy);
    martialImpulse(ctx, event.target, { x: (length ? dx / length : 1) * 1.5 * (1 + bonus),
      y: (length ? dy / length : 0) * 1.5 * (1 + bonus) });
  }
}
