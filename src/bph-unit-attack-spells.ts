import type { BphActor, BphEffect, BphFxContext, BphFxState } from "./bph-contract";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { beginBphCast } from "./bph-effects-entry";
import { applyInfection } from "./bph-fx-conditions";
import type { Enemy } from "./rules";
import { bphStats } from "./bph-combat";
import { tickUnitTornado } from "./bph-unit-attack-spells-tornado";
import { initializeUnitQuasar } from "./bph-unit-attack-spells-quasar";

export type UnitAttackSpell = BphFxState["spells"][number];
export type UnitAttackSpellOptions = { readonly tomeId?: string; readonly foil?: boolean };

export function unitSpellSource(ctx: BphFxContext, spell: UnitAttackSpell) {
  return ctx.run.squads.flatMap(s => [s, ...s.soldiers]).find(unit =>
    unit.id === (spell.cast ? spell.cast.sourceId : spell.sourceId) &&
    (!spell.cast || ctx.unitInfo(unit)?.lifeId === spell.cast.sourceLifeId));
}

export function unitSpellEffects(ctx: BphFxContext, spell: UnitAttackSpell, type: string): readonly BphEffect[] {
  const source = unitSpellSource(ctx, spell), info = source && ctx.unitInfo(source);
  return ctx.effects.filter(effect => effect.type === type && !effect.nodeId.startsWith("FOIL_") &&
    (!effect.targets.targetSpell || effect.targets.targetSpell === spell.id) &&
    (!effect.targets.targetTome || effect.targets.targetTome === spell.cast?.tomeId) &&
    (!effect.targets.targetHero || effect.targets.targetHero === info?.profileId) &&
    (!Number(effect.targets.targetClass) || (source && ctx.originalClasses(source).includes(Number(effect.targets.targetClass)))) &&
    (effect.targets.useTargetRarity !== "1" || (info &&
      BPH_PROFILES[info.profileId].rarity === Number(effect.targets.targetRarity))));
}

export function unitSpellSum(ctx: BphFxContext, spell: UnitAttackSpell, type: string): number {
  return unitSpellEffects(ctx, spell, type).reduce((sum, effect) => sum + effect.value, 0);
}

/** Raw original HP units. Unsupported spells return undefined for the parent fallback. */
export function bphUnitAttackSpellDamage(ctx: BphFxContext, spell: UnitAttackSpell): number | undefined {
  let damage: number;
  switch (spell.id) {
    case "Spell_InfectionBomb": damage = 0.25; break;
    case "Spell_Tornado": case "Spell_Quasar": damage = 0; break;
    default: return undefined;
  }
  const source = unitSpellSource(ctx, spell);
  // Native Hero.GetSpellCastBaseDamage branches to EffectiveAttackDamage.
  // spellPower does not scale these hero attack spells.
  return (source ? bphStats(source, ctx.run)?.damage ?? damage : damage) *
    (1 + unitSpellSum(ctx, spell, "TargetSpellDamageBonus"));
}

export function unitSpellHit(ctx: BphFxContext, actor: BphActor, target: Enemy): number {
  const cast = actor.cast;
  if (!cast) return 0;
  const spell = { id: cast.spellId, x: actor.x, y: actor.y, power: cast.power, cast };
  let multiplier = target.stun > 0 ? 1 + ctx.effects.filter(e => e.type === "StunnedEnemyDamageBonus")
    .reduce((sum, e) => sum + e.value, 0) : 1;
  for (const status of ctx.state.statuses.filter(s => s.targetId === target.id && s.until > ctx.run.time)) {
    if (status.id === "Vulnerable") multiplier *= 1 + status.power / 100;
    if (status.id === "Infected") multiplier *= 1 + ctx.effects.filter(e => e.type === "InfectedEnemyDamageBonus")
      .reduce((sum, e) => sum + e.value, 0);
  }
  const chance = ctx.chance(actor.data.critChance);
  const critical = cast.spellId === "Spell_Quasar" ? actor.data.castCritical === 1 :
    cast.spellId === "Spell_Tornado" && chance > 0 && (chance >= 1 || ctx.random() < chance);
  const dealt = ctx.applyDamage({ target, amount: actor.power * multiplier *
    (critical ? 2 + actor.data.critBonus : 1), cast, critical,
    source: unitSpellSource(ctx, spell), spellId: cast.spellId, position: actor,
    ...(cast.attackId === undefined ? {} : { attackId: cast.attackId }) });
  if (target.hp > 0 && actor.data.hitStun > 0) target.stun = Math.max(target.stun, actor.data.hitStun);
  return dealt;
}

export function castBphUnitAttackSpell(ctx: BphFxContext, spell: UnitAttackSpell,
  options: UnitAttackSpellOptions = {}): boolean {
  if (spell.id !== "Spell_InfectionBomb" && spell.id !== "Spell_Tornado" && spell.id !== "Spell_Quasar") return false;
  const source = unitSpellSource(ctx, spell);
  const target = ctx.run.enemies.find(e => e.id === spell.targetId && e.hp > 0) ?? null;
  const cast = spell.cast ?? beginBphCast(ctx, { spellId: spell.id, source: source ?? null,
    target, position: { x: spell.x, y: spell.y }, power: spell.power, foil: options.foil ?? false,
    ...(options.tomeId === undefined ? {} : { tomeId: options.tomeId }),
    ...(spell.attackId === undefined ? {} : { attackId: spell.attackId }) });
  const attributed = { ...spell, cast };
  const stats = source ? bphStats(source, ctx.run) : null;
  const tornado = spell.id === "Spell_Tornado", quasar = spell.id === "Spell_Quasar";
  const radius = (tornado ? 0.25 : quasar ? 0.11999999731779099 : 0.4000000059604645) * BPH_WORLD_TO_PX * (1 +
    unitSpellSum(ctx, attributed, "SpellAoeRadius") + unitSpellSum(ctx, attributed, "TargetSpellRadius"));
  const duration = (tornado ? 4 : quasar ? 0.4000000059604645 : 5) *
    (1 + unitSpellSum(ctx, attributed, "SpellDuration"));
  const flight = tornado || quasar ? 0 : 0.8999999761581421;
  const actor: BphActor = { id: ctx.run.nextId++, ownerId: cast.sourceId ?? -1, kind: quasar ? "beam" : "mine",
    x: tornado ? spell.x : source?.x ?? spell.x, y: tornado ? spell.y : source?.y ?? spell.y,
    toX: spell.x, toY: spell.y,
    startedAt: ctx.run.time, until: ctx.run.time + flight + duration,
    power: bphUnitAttackSpellDamage(ctx, attributed) ?? 0, radius, targets: [], cast,
    ...(cast.attackId === undefined ? {} : { attackId: cast.attackId }),
    data: { unitSpell: 1, fromX: source?.x ?? spell.x, fromY: source?.y ?? spell.y,
      flight, duration, tick: quasar ? 1 : 0.5, age: 0, ticks: 0, landed: 0, simulated: 0,
      anchorX: spell.x, anchorY: spell.y, retargetAt: 0, angle: 0,
      critChance: stats?.critChance ?? 0, critBonus: stats?.critDamage ?? 0,
      hitStun: unitSpellSum(ctx, attributed, "TargetSpellHitStunSeconds") } };
  ctx.state.actors.push(actor);
  if (quasar) initializeUnitQuasar(ctx, actor, attributed);
  return true;
}

export function tickBphUnitAttackSpells(ctx: BphFxContext, dt: number): void {
  if (dt <= 0) return;
  const completed = new Set<number>();
  for (const actor of ctx.state.actors) {
    if (actor.data.unitSpell !== 1) continue;
    if (actor.cast?.spellId === "Spell_Quasar") {
      actor.data.age = Math.min(actor.data.duration, actor.data.age + dt);
      if (actor.data.age >= actor.data.duration) completed.add(actor.id);
      continue;
    }
    if (actor.cast?.spellId === "Spell_Tornado") {
      if (tickUnitTornado(ctx, actor, dt)) completed.add(actor.id);
      continue;
    }
    if (actor.cast?.spellId !== "Spell_InfectionBomb") continue;
    const data = actor.data;
    data.age = Math.min(data.flight + data.duration, data.age + dt);
    const progress = Math.min(1, data.age / data.flight);
    actor.x = data.fromX + (actor.toX - data.fromX) * progress;
    actor.y = data.fromY + (actor.toY - data.fromY) * progress;
    if (data.age < data.flight) continue;
    if (!data.landed) {
      data.landed = 1;
      for (const enemy of ctx.run.enemies) {
        // Pixel subtraction can round a mathematically inclusive circumference outward.
        if (enemy.hp <= 0 || Math.hypot(enemy.x - actor.x, enemy.y - actor.y) > actor.radius + 1e-9) continue;
        actor.targets.push(enemy.id);
        // Backdate lifetime to impact when a caller advances across the flight boundary.
        const remaining = data.duration - (data.age - data.flight);
        applyInfection(ctx, { target: enemy, cast: actor.cast, duration: remaining });
      }
    }
    const ticks = Math.floor((data.age - data.flight + 1e-10) / data.tick);
    while (data.ticks < ticks) {
      data.ticks++;
      for (const enemy of ctx.run.enemies) {
        if (enemy.hp > 0 && actor.targets.includes(enemy.id)) unitSpellHit(ctx, actor, enemy);
      }
    }
    if (data.age >= data.flight + data.duration) completed.add(actor.id);
  }
  if (completed.size) ctx.state.actors = ctx.state.actors.filter(actor => !completed.has(actor.id));
}
