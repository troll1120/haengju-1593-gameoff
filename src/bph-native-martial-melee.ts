import { bphAttackReach, bphStats, meleeContactLimit } from "./bph-combat";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import type { BphFxContext, BphFxEvent } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import type { MartialAttack } from "./bph-native-martial-common";
import { martialActor, martialOwner, martialSum } from "./bph-native-martial-common";
import type { Enemy, Unit } from "./rules";

export function fisherUsesMelee(ctx: BphFxContext, unit: Unit, target: Enemy): boolean {
  return ctx.profileId(unit) === "Hero7_AstralFisher"
    && Math.hypot(target.x - unit.x, target.y - unit.y)
      <= Number(BPH_PROFILES.Hero7_AstralFisher.raw.astralFisherMeleeRange) * BPH_WORLD_TO_PX;
}

export function martialMeleeStats(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind !== "unit-stats" || event.profileId !== "Hero1_Barbarian") return;
  const bonus = martialSum(ctx, event.unit, "HeroLowHpAttackSpeed");
  // Inference: linear missing-HP bonus, value 1 means at most +100% speed.
  const missingHp = 1 - Math.max(0, Math.min(1, event.unit.hp / event.unit.maxHp));
  event.stats.cooldown /= 1 + bonus * missingHp;
}

/** The parent supplies ordinary attack damage, critical result and attack ID. */
export function martialMeleeAttack(ctx: BphFxContext, attack: MartialAttack): boolean {
  const unit = attack.unit, id = ctx.profileId(unit);
  const stats = bphStats(unit, ctx.run);
  if (!stats) return false;
  if (id === "Hero4_Duelist") {
    // Native Hero.BloodhunterMeleeRangeThreshold: nearby attacks stay melee.
    if (Math.hypot(attack.target.x - unit.x, attack.target.y - unit.y) <= 0.5 * BPH_WORLD_TO_PX) return false;
    const actor = martialActor(ctx, attack, id);
    actor.kind = "dash";
    const distance = Math.hypot(actor.toX - actor.x, actor.toY - actor.y);
    // No leap speed in the Duelist definition. Explicit adaptation: 5 world/s.
    actor.until = ctx.run.time + Math.max(0.05, distance / (5 * BPH_WORLD_TO_PX));
    actor.radius = stats.area * BPH_WORLD_TO_PX;
    Object.assign(actor.data, { martialLeap: 1, height: distance
      * Number(BPH_PROFILES[id].raw.bloodhunterLeapArcHeightFactor), elevation: 0 });
    unit.strikeAt = Infinity;
    return true;
  }
  if (id === "Hero1_Barbarian") {
    const dx = attack.target.x - unit.x, dy = attack.target.y - unit.y;
    const length = Math.hypot(dx, dy), radius = meleeContactLimit(Math.min(bphAttackReach(stats.range), stats.area * BPH_WORLD_TO_PX));
    // Attack is authored as a cone; its aperture is absent. Adaptation: 90 deg.
    // Its victims must remain inside the same weapon reach that admitted the attack.
    const targets = ctx.run.enemies.filter(enemy => {
      const ex = enemy.x - unit.x, ey = enemy.y - unit.y, distance = Math.hypot(ex, ey);
      return enemy.hp > 0 && distance < radius && (distance === 0
        || (ex * dx + ey * dy) / (distance * (length || 1)) >= Math.SQRT1_2);
    });
    for (const target of targets) ctx.applyDamage({ target, source: unit, amount: attack.amount,
      critical: attack.critical, attackId: attack.attackId });
    return true;
  }
  if (fisherUsesMelee(ctx, unit, attack.target)) {
    ctx.applyDamage({ target: attack.target, source: unit, amount: attack.amount,
      critical: attack.critical, attackId: attack.attackId });
    return true;
  }
  return false;
}

export function tickMartialLeaps(ctx: BphFxContext): void {
  const done = new Set<number>();
  for (const actor of ctx.state.actors) {
    if (actor.data.martialLeap !== 1) continue;
    const source = martialOwner(ctx, actor);
    if (!source) { done.add(actor.id); continue; }
    const t = Math.max(0, Math.min(1, (ctx.run.time - actor.startedAt) / (actor.until - actor.startedAt)));
    source.x = actor.x = actor.data.fromX + (actor.toX - actor.data.fromX) * t;
    source.y = actor.y = actor.data.fromY + (actor.toY - actor.data.fromY) * t;
    actor.data.elevation = 4 * t * (1 - t) * actor.data.height;
    if (t < 1) continue;
    done.add(actor.id);
    const raw = BPH_PROFILES.Hero4_Duelist.raw;
    const radius = Number(raw.bloodhunterLandingStunRadius) * BPH_WORLD_TO_PX;
    const landingMultiplier = Number(raw.bloodhunterLandingDamageMultiplier);
    for (const target of ctx.run.enemies) {
      if (target.hp <= 0) continue;
      const distance = Math.hypot(target.x - actor.x, target.y - actor.y);
      const basic = distance <= actor.radius ? actor.power : 0;
      const landing = distance <= radius ? actor.power * landingMultiplier : 0;
      if (basic + landing > 0) ctx.applyDamage({ target, source, amount: basic + landing,
        critical: actor.data.critical === 1, cast: actor.cast, attackId: actor.attackId });
      if (distance <= radius && target.hp > 0)
        target.stun = Math.max(target.stun, Number(raw.bloodhunterLandingStunSeconds));
    }
    source.strikeAt = 0;
  }
  ctx.state.actors = ctx.state.actors.filter(actor => !done.has(actor.id));
}
