import type { BphEffect, BphEffectConsumer, BphFxContext, BphFxEvent } from "./bph-contract";
import { aliveBphTomes as aliveTomes } from "./bph-active-tomes";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { BPH_ENEMY_MAP, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import type { Enemy, Unit } from "./rules";
import { CENTER } from "./geometry";
import { beginBphCast } from "./bph-effects-entry";

// StatusEffectDefinition, resources.assets:1489/1492/1494/1495/1496.
// Duration mode Charge lasts until consumed; Timed/Fixed use the authored seconds.
const definitions: Readonly<Record<string, { readonly duration: number; readonly power: number }>> = {
  Charge: { duration: 10, power: 100 },
  Fortify: { duration: Infinity, power: 0 },
  Invisibility: { duration: 5, power: 100 },
  Revive: { duration: Infinity, power: 0 },
  Stun: { duration: 5, power: 0 },
  Weak: { duration: 5, power: 50 },
  Vulnerable: { duration: 5, power: 50 },
  Strength: { duration: 5, power: 50 },
  Haste: { duration: 5, power: 50 },
  Regenerate: { duration: 10, power: 5 },
  Poison: { duration: 5, power: 10 },
  Frozen: { duration: 5, power: 0 },
  Slow: { duration: 5, power: 50 },
  Exhaust: { duration: 5, power: 50 },
  Momentum: { duration: 5, power: 50 },
  Thorns: { duration: 5, power: 100 },
} as const;

function fighters(ctx: BphFxContext): Unit[] {
  return ctx.run.squads.flatMap(squad => [squad, ...squad.soldiers]).filter(unit => unit.hp > 0);
}

function matches(ctx: BphFxContext, effect: BphEffect, unit: Unit, secondary = false): boolean {
  const id = ctx.profileId(unit), profile = id ? BPH_PROFILES[id] : undefined;
  if (!profile) return false;
  if (!secondary && effect.targets.targetHero && effect.targets.targetHero !== id) return false;
  const classId = Number(effect.targets[secondary ? "secondTargetClass" : "targetClass"] ?? 0);
  if (classId && !ctx.originalClasses(unit).includes(classId)) return false;
  if (effect.nodeId.startsWith("FOIL_") && !ctx.unitInfo(unit)?.foil) return false;
  return effect.targets.useTargetRarity !== "1" || profile.rarity === Number(effect.targets.targetRarity);
}

function key(effect: BphEffect): string {
  return `${effect.targets.placementId ?? effect.nodeId}:${effect.type}`;
}

function unconfirmed(ctx: BphFxContext, kind: string, reason: string): void {
  const key = `status:unconfirmed:${kind}`;
  if (ctx.state.counters[key]) return;
  ctx.state.counters[key] = 1;
  ctx.emit({ kind: "event", x: 0, y: 0, value: 0, label: `미확인 ${kind}: ${reason}` });
}

function applyStatus(ctx: BphFxContext, effect: BphEffect, unit: Unit | Enemy, seconds?: number): void {
  const id = effect.targets.targetStatus, definition = definitions[id];
  if (!definition) {
    unconfirmed(ctx, effect.type, `${id} 상태 실행식 확인 필요`);
    return;
  }
  const bonus = ctx.effects.filter(e => e.type === "StatusEffectDurationBonus" && e.targets.targetStatus === id)
    .reduce((sum, e) => sum + e.value, 0);
  const until = ctx.run.time + (seconds ?? definition.duration) * (1 + bonus);
  const existing = ctx.state.statuses.find(status => status.targetId === unit.id && status.id === id);
  if (existing) existing.until = Math.max(existing.until, until);
  else ctx.applyBuff({ target: unit, side: "stun" in unit ? "enemy" : "ally",
    id, duration: until - ctx.run.time, power: definition.power, stacks: 1 });
  if ("stun" in unit && (id === "Stun" || id === "Frozen")) unit.stun = Math.max(unit.stun, until - ctx.run.time);
}

function chance(ctx: BphFxContext, value: number): boolean {
  const probability = ctx.chance(value);
  return probability > 0 && (probability >= 1 || ctx.random() < probability);
}

function sum(ctx: BphFxContext, type: string): number {
  return ctx.effects.filter(effect => effect.type === type).reduce((value, effect) => value + effect.value, 0);
}

function tomeBonus(ctx: BphFxContext, kind: string, field: string): number {
  return aliveTomes(ctx).filter(tome => tome.id === "Tome_CursorDPS").reduce((bonus, tome) => bonus +
    Number(BPH_TOMES[tome.id].raw[field] ?? 0) * (field === "cursorDpsAreaBonusPercent" ? 1 +
      tomeEffects(ctx, "TomeEffectPower", tome.id, tome.foil).reduce((value, effect) => value + effect.value, 0) : 1) +
    tomeEffects(ctx, kind, tome.id, tome.foil).reduce((value, effect) => value + effect.value, 0), 0);
}

function reference(raw: string | number | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value: unknown = JSON.parse(raw);
  return value && typeof value === "object" && "name" in value && typeof value.name === "string" ? value.name : null;
}

function tomeEffects(ctx: BphFxContext, type: string, tomeId: string, foil: boolean): readonly BphEffect[] {
  const tome = BPH_TOMES[tomeId];
  const node = tome ? reference(tome.raw.foilNode) : null;
  return ctx.effects.filter(effect => effect.type === type &&
    (!effect.targets.targetTome || effect.targets.targetTome === tomeId) &&
    (!effect.nodeId.startsWith("FOIL_") || (foil && node === effect.nodeId)));
}

function startTome(ctx: BphFxContext, id: string, foil: boolean): void {
  const tome = BPH_TOMES[id];
  if (!tome) return;
  if ([4, 5].includes(tome.effectKind) && aliveTomes(ctx).some(active => active.id === id)) {
    unconfirmed(ctx, `tome:${id}:stacks`,
      "원본 cursorDpsCumulativePercentage/giant 중첩식 미확인; 선형 중첩으로 대체하지 않음");
    return;
  }
  if ([7, 8, 9, 10, 11].includes(tome.effectKind))
    unconfirmed(ctx, `tome:${id}`, "원본 혼령·변환·표식·소비품·얼음 개체의 실행식 미확인");
  const serial = (ctx.state.counters["status:tome-serial"] ?? 0) + 1;
  ctx.state.counters["status:tome-serial"] = serial;
  const prefix = `status:tome:${serial}:${id}`;
  const duration = Number(tome.raw.buffDuration) * (1 +
    tomeEffects(ctx, "TomeBuffDurationIncrease", id, foil).reduce((sum, e) => sum + e.value, 0));
  ctx.state.timers[`${prefix}:until`] = ctx.run.time + duration;
  ctx.state.timers[`${prefix}:clock`] = 0;
  ctx.state.counters[`${prefix}:foil`] = Number(foil);
  const bonus = tomeEffects(ctx, "TomeChannelIntervalReduction", id, foil).reduce((sum, e) => sum + e.value, 0);
  ctx.state.timers[`${prefix}:interval`] = tome.interval / (1 + bonus);
  if (ctx.run.bph) {
    const stacks = aliveTomes(ctx).filter(active => active.id === id).length;
    const existing = ctx.run.bph.tomes.find(active => active.id === id);
    if (existing) { existing.clock = Infinity; existing.stacks = stacks; }
    else ctx.run.bph.tomes.push({ id, clock: Infinity, stacks });
    ctx.state.counters[`status:adopted-tome:${id}`] = stacks;
  }
}

function channelInterval(ctx: BphFxContext, id: string, bonus: number): number {
  const tome = BPH_TOMES[id];
  const base = tome.intervalMin > 0 && tome.intervalMax >= tome.intervalMin
    ? tome.intervalMin + ctx.random() * (tome.intervalMax - tome.intervalMin) : tome.interval;
  return base / (1 + bonus);
}

function tickTomes(ctx: BphFxContext, dt: number): void {
  for (const entry of Object.keys(ctx.state.timers).filter(key => key.startsWith("status:tome:") && key.endsWith(":until"))) {
    const prefix = entry.slice(0, -6), id = prefix.split(":")[3], tome = BPH_TOMES[id];
    const remaining = ctx.state.timers[entry] - (ctx.run.time - dt);
    if (!tome || remaining <= 0) continue;
    const foil = ctx.state.counters[`${prefix}:foil`] === 1;
    const bonus = tomeEffects(ctx, "TomeChannelIntervalReduction", id, foil).reduce((sum, e) => sum + e.value, 0);
    let interval = ctx.state.timers[`${prefix}:interval`];
    if (!(interval > 0)) continue;
    let clock = (ctx.state.timers[`${prefix}:clock`] ?? 0) + Math.min(dt, remaining);
    const casts = tome.casts + tomeEffects(ctx, "TomeChannelCastsPerTickBonus", id, foil)
      .reduce((sum, e) => sum + e.value, 0);
    while (clock >= interval) {
      clock -= interval;
      if (tome.effectKind === 1) {
        const summon = reference(tome.raw.summonUnit);
        if (summon) {
          const before = new Set(fighters(ctx).map(unit => unit.id));
          ctx.spawnProfile(summon, casts, { packId: reference(tome.raw.binderSourcePack) ?? "DeliveryBox", cause: "summon" });
          const power = tomeEffects(ctx, "TomeEffectPower", id, foil).reduce((sum, effect) => sum + effect.value, 0) +
            sum(ctx, "TomePowerPerFoilTomeInCollection") * ctx.save.foils.filter(id => BPH_TOMES[id]).length;
          for (const unit of fighters(ctx).filter(unit => !before.has(unit.id)))
            ctx.state.counters[`status:summon-power:${unit.id}`] = power;
        }
      } else if (tome.effectKind === 0) {
        const spell = reference(tome.raw.targetSpell);
        for (let i = 0; spell && i < casts; i++) {
          const pool = ctx.run.enemies.filter(enemy => enemy.hp > 0);
          if (!pool.length) continue;
          const target = pool[Math.floor(ctx.random() * pool.length)];
          if (target) executeSpell(ctx, { id: spell, x: target.x, y: target.y,
            power: 1, targetId: target.id }, id, foil);
        }
      } else if (tome.effectKind === 6) {
        const spell = reference(tome.raw.targetSpell);
        if (spell) executeSpell(ctx, { id: spell, x: CENTER.x, y: CENTER.y, power: 1 }, id, foil);
        unconfirmed(ctx, `tome:${id}:push`, "원본 BellTower 힘→변위의 물리 적분식 미확인");
      }
      interval = channelInterval(ctx, id, bonus);
    }
    ctx.state.timers[`${prefix}:clock`] = clock;
    ctx.state.timers[`${prefix}:interval`] = interval;
  }
}

function cast(ctx: BphFxContext, effect: BphEffect, unit: Unit, count: number, target?: Enemy): void {
  const id = effect.targets.targetSpell, profileId = ctx.profileId(unit);
  const profile = profileId ? BPH_PROFILES[profileId] : undefined;
  if (!id || !profile) return;
  for (let i = 0; i < count; i++) ctx.state.spells.push({
    id, x: target?.x ?? unit.x, y: target?.y ?? unit.y,
    power: Number(profile.raw.spellPower), sourceId: unit.id, ...(target ? { targetId: target.id } : {}),
  });
}

type Spell = BphFxContext["state"]["spells"][number];
const SPELLS: Readonly<Record<string, { readonly damage: number; readonly radius: number;
  readonly duration: number; readonly tick: number; readonly stun: number; readonly speed: number;
  readonly bounces: number; readonly retain: number }>> = {
  "Spell_AoeCircle": {"damage":10,"radius":0.5,"duration":0,"tick":1,"stun":0,"speed":8,"bounces":0,"retain":0.5},
  "Spell_Dash": {"damage":1,"radius":1,"duration":5,"tick":1,"stun":0,"speed":6,"bounces":0,"retain":0.5},
  "Spell_DragonsCall": {"damage":60,"radius":0.25,"duration":4,"tick":0.5,"stun":0,"speed":6,"bounces":0,"retain":0.5},
  "Spell_Fireball": {"damage":4,"radius":0.30000001192092896,"duration":5,"tick":1,"stun":0,"speed":6,"bounces":0,"retain":0.5},
  "Spell_InfectionBomb": {"damage":0.25,"radius":0.4000000059604645,"duration":5,"tick":0.5,"stun":0,"speed":4,"bounces":0,"retain":0.5},
  "Spell_Mine": {"damage":10,"radius":0.6000000238418579,"duration":30,"tick":1,"stun":0,"speed":8,"bounces":0,"retain":0.5},
  "Spell_Quasar": {"damage":0,"radius":0.11999999731779099,"duration":0.4000000059604645,"tick":1,"stun":0,"speed":8,"bounces":1,"retain":0.5},
  "Spell_SpawnerSummon": {"damage":0,"radius":0,"duration":0,"tick":1,"stun":0,"speed":0,"bounces":0,"retain":0.5},
  "Spell_Stun": {"damage":0,"radius":1,"duration":1.5,"tick":1,"stun":0,"speed":0,"bounces":0,"retain":0.5},
  "Spell_TeleportAndDamageAoe": {"damage":6,"radius":1.5,"duration":5,"tick":1,"stun":0,"speed":6,"bounces":0,"retain":0.5},
  "Spell_Thunderbolt": {"damage":1.5,"radius":0,"duration":0,"tick":1,"stun":0.4000000059604645,"speed":0,"bounces":0,"retain":0.5},
  "Spell_Tornado": {"damage":0,"radius":0.25,"duration":4,"tick":0.5,"stun":0,"speed":0.6000000238418579,"bounces":0,"retain":0.5},
  "Spell_BeamOfLight": {"damage":0.10000000149011612,"radius":1.2000000476837158,"duration":0,"tick":1,"stun":0,"speed":8,"bounces":0,"retain":0.5},
  "Spell_BladeRain": {"damage":1,"radius":1,"duration":5,"tick":1,"stun":0,"speed":6,"bounces":0,"retain":0.5},
  "Spell_HammerTaunt": {"damage":0,"radius":1,"duration":0,"tick":1,"stun":0,"speed":0,"bounces":0,"retain":0.5},
  "Spell_PoisonCloud": {"damage":0.5,"radius":0.5,"duration":4,"tick":0.5,"stun":0,"speed":8,"bounces":0,"retain":0.5},
  "Spell_RiderPiercer": {"damage":0,"radius":0,"duration":0,"tick":1,"stun":0,"speed":8,"bounces":0,"retain":0.5},
  "Spell_Seed": {"damage":0,"radius":0,"duration":0.800000011920929,"tick":1,"stun":0,"speed":10,"bounces":0,"retain":0.5},
  "Spell_Shockwave": {"damage":2,"radius":3,"duration":1.5,"tick":1,"stun":1.5,"speed":0,"bounces":0,"retain":0.5},
  "Spell_SkeletonBone": {"damage":4,"radius":0,"duration":0,"tick":1,"stun":0,"speed":3.5,"bounces":0,"retain":0.75},
};

function spellEffects(ctx: BphFxContext, type: string, spell: Spell, tomeId?: string): readonly BphEffect[] {
  const source = ctx.run.squads.flatMap(s => [s, ...s.soldiers]).find(unit => unit.id === spell.sourceId);
  return ctx.effects.filter(effect => effect.type === type &&
    (!effect.targets.targetSpell || effect.targets.targetSpell === spell.id) &&
    (!effect.targets.targetTome || effect.targets.targetTome === tomeId) &&
    (!effect.targets.targetHero || (source && matches(ctx, effect, source))) &&
    !effect.nodeId.startsWith("FOIL_"));
}

function spellSum(ctx: BphFxContext, type: string, spell: Spell, tomeId?: string): number {
  return spellEffects(ctx, type, spell, tomeId).reduce((value, effect) => value + effect.value, 0);
}

function damageBonus(ctx: BphFxContext, target: Enemy): number {
  let multiplier = target.stun > 0 ? 1 + sum(ctx, "StunnedEnemyDamageBonus") : 1;
  for (const status of ctx.state.statuses.filter(s => s.targetId === target.id && s.until > ctx.run.time)) {
    if (status.id === "Infected") multiplier *= 1 + sum(ctx, "InfectedEnemyDamageBonus");
    if (status.id === "Vulnerable") multiplier *= 1 + status.power / 100;
  }
  return multiplier;
}

export const BPH_EXECUTABLE_SPELLS: ReadonlySet<string> = new Set(["Spell_AoeCircle", "Spell_Thunderbolt", "Spell_Stun",
  "Spell_Shockwave", "Spell_PoisonCloud", "Spell_Mine", "Spell_Fireball", "Spell_TeleportAndDamageAoe"]);

/** Shared raw spell damage for native resolution and army auxiliary attacks. */
export function bphSpellDamage(ctx: BphFxContext, spell: Spell, tomeId?: string): number {
  const definition = SPELLS[spell.id];
  if (!definition || !BPH_EXECUTABLE_SPELLS.has(spell.id)) return 0;
  const collectionPower = tomeId ? 1 + sum(ctx, "TomePowerPerFoilTomeInCollection") *
    ctx.save.foils.filter(id => BPH_TOMES[id]).length : 1;
  return definition.damage * spell.power * collectionPower * (1 + spellSum(ctx, "TargetSpellDamageBonus", spell, tomeId) +
    (spell.id === "Spell_Thunderbolt" ? sum(ctx, "ThunderboltDamageBonus") : 0));
}

function executeSpell(ctx: BphFxContext, spell: Spell, tomeId?: string, foil = false, arrived = false): void {
  const definition = SPELLS[spell.id];
  if (!definition || !BPH_EXECUTABLE_SPELLS.has(spell.id)) {
    unconfirmed(ctx, `spell:${spell.id}`, "원본 이동·충돌·피해식 미확인; 다른 주문으로 대체하지 않음");
    return;
  }
  const source = ctx.run.squads.flatMap(s => [s, ...s.soldiers]).find(unit => unit.id === spell.sourceId);
  const target = ctx.run.enemies.find(enemy => enemy.id === spell.targetId && enemy.hp > 0) ??
    ctx.run.enemies.filter(enemy => enemy.hp > 0).sort((a, b) =>
      Math.hypot(a.x - spell.x, a.y - spell.y) - Math.hypot(b.x - spell.x, b.y - spell.y))[0];
  const cast = arrived ? spell.cast : beginBphCast(ctx, { spellId: spell.id,
    source: source ?? null, target: target ?? null, position: { x: spell.x, y: spell.y },
    tomeId, foil, power: spell.power,
    ...(spell.attackId === undefined ? {} : { attackId: spell.attackId }) });
  const radius = definition.radius * BPH_WORLD_TO_PX *
    (1 + spellSum(ctx, "SpellAoeRadius", spell, tomeId) + spellSum(ctx, "TargetSpellRadius", spell, tomeId));
  const duration = definition.duration * (1 + spellSum(ctx, "SpellDuration", spell, tomeId));
  const collectionPower = tomeId ? 1 + sum(ctx, "TomePowerPerFoilTomeInCollection") *
    ctx.save.foils.filter(id => BPH_TOMES[id]).length : 1;
  const bookPower = tomeId ? collectionPower * (1 +
    tomeEffects(ctx, "TomeEffectPower", tomeId, foil).reduce((sum, e) => sum + e.value, 0)) : 1;
  const amount = bphSpellDamage(ctx, spell, tomeId);
  if (!arrived && (spell.id === "Spell_PoisonCloud" || spell.id === "Spell_Mine" ||
      (spell.id === "Spell_Fireball" && source && definition.speed > 0))) {
    const flight = spell.id === "Spell_Fireball";
    const lifetime = flight && source ? Math.hypot(spell.x - source.x, spell.y - source.y) /
      (definition.speed * BPH_WORLD_TO_PX) : duration;
    ctx.state.actors.push({ id: ctx.run.nextId++, ownerId: source?.id ?? -1, kind: "mine",
      x: spell.x, y: spell.y, toX: spell.x, toY: spell.y, startedAt: ctx.run.time,
      until: ctx.run.time + lifetime, power: amount, radius, targets: [], cast, data: {
        statusSpell: 1, mode: flight ? 2 : spell.id === "Spell_Mine" ? 1 : 0,
        clock: 0, interval: definition.tick, sourceId: source?.id ?? -1,
        spellIndex: Object.keys(SPELLS).indexOf(spell.id), castPower: spell.power,
        tomeIndex: tomeId ? Object.keys(BPH_TOMES).indexOf(tomeId) : -1, foil: Number(foil),
      } });
    return;
  }
  if (spell.id === "Spell_TeleportAndDamageAoe" && source) { source.x = spell.x; source.y = spell.y; }
  const targets = spell.id === "Spell_Thunderbolt" ? (target ? [target] : []) :
    ctx.run.enemies.filter(enemy => enemy.hp > 0 && Math.hypot(enemy.x - spell.x, enemy.y - spell.y) <= radius);
  const stun = (spell.id === "Spell_Stun" ? duration : definition.stun) * bookPower +
    spellSum(ctx, "TargetSpellHitStunSeconds", spell, tomeId);
  for (const enemy of targets) {
    if (amount > 0) ctx.applyDamage({ target: enemy, amount: amount * damageBonus(ctx, enemy), source,
      spellId: spell.id, position: { x: spell.x, y: spell.y }, cast });
    if (stun > 0 && enemy.hp > 0) enemy.stun = Math.max(enemy.stun, stun);
  }
  ctx.emit({ kind: spell.id === "Spell_Thunderbolt" ? "shot" : "blast",
    x: spell.x, y: spell.y, value: radius, ...(target ? { target: target.id } : {}) });
}

function tickSpellActors(ctx: BphFxContext, dt: number): void {
  const completed = new Set<number>();
  for (const actor of [...ctx.state.actors].filter(actor => actor.data.statusSpell === 1)) {
    const id = Object.keys(SPELLS)[actor.data.spellIndex], source = ctx.run.squads
      .flatMap(s => [s, ...s.soldiers]).find(unit => unit.id === actor.data.sourceId);
    if (actor.data.mode === 2) {
      if (ctx.run.time >= actor.until) {
        executeSpell(ctx, { id, x: actor.x, y: actor.y, power: actor.data.castPower, sourceId: actor.data.sourceId, cast: actor.cast },
          Object.keys(BPH_TOMES)[actor.data.tomeIndex], actor.data.foil === 1, true);
        completed.add(actor.id);
      }
      continue;
    }
    const remaining = actor.until - (ctx.run.time - dt);
    if (remaining <= 0) { completed.add(actor.id); continue; }
    const targets = ctx.run.enemies.filter(enemy => enemy.hp > 0 &&
      Math.hypot(enemy.x - actor.x, enemy.y - actor.y) <= actor.radius);
    if (actor.data.mode === 1) {
      if (targets.length) {
        actor.data.exploded = 1;
        ctx.emitEvent({ kind: "mine-chain", actor, previous: null });
        for (const target of targets) {
          const dealt = ctx.applyDamage({ target, amount: actor.power * damageBonus(ctx, target),
            source, spellId: id, position: actor, cast: actor.cast });
          if (dealt > 0) actor.targets.push(target.id);
        }
        completed.add(actor.id);
        ctx.emit({ kind: "blast", x: actor.x, y: actor.y, value: actor.radius });
      }
    } else {
      actor.data.clock += Math.min(dt, remaining);
      while (actor.data.clock >= actor.data.interval) {
        actor.data.clock -= actor.data.interval;
        for (const target of targets) if (target.hp > 0) ctx.applyDamage({
          target, amount: actor.power * damageBonus(ctx, target), source, spellId: id, position: actor, cast: actor.cast,
        });
      }
    }
    if (ctx.run.time >= actor.until) completed.add(actor.id);
  }
  ctx.state.actors = ctx.state.actors.filter(actor => !completed.has(actor.id));
}

function tickCursor(ctx: BphFxContext, dt: number): void {
  // DamagePerSecondConfig sharedassets1.assets:2719; pointer is the actual last touch.
  const untils = Object.entries(ctx.state.timers).filter(([key, until]) =>
    key.startsWith("status:rapier:") && until > ctx.run.time);
  const rapier = untils.length * sum(ctx, "OpenPackCursorTimedAttackSpeedPercent");
  const speed = 1 + sum(ctx, "CursorDpsIntervalReduction") + rapier +
    tomeBonus(ctx, "TomeCursorDpsAttackSpeedBonus", "cursorDpsAttackSpeedBonusPercent");
  if (!(speed > 0)) return;
  const interval = 1 / speed;
  let clock = (ctx.state.timers["status:cursor-clock"] ?? 0) + dt;
  while (clock >= interval) {
    clock -= interval;
    const ordinal = (ctx.state.counters["status:cursor-hits"] ?? 0) + 1;
    ctx.state.counters["status:cursor-hits"] = ordinal;
    const radius = 0.30000001192092896 * BPH_WORLD_TO_PX * (1 + sum(ctx, "CursorDpsRadius") +
      (ctx.state.counters["status:cursor-death-radius"] ?? 0) +
      tomeBonus(ctx, "TomeCursorDpsAreaBonus", "cursorDpsAreaBonusPercent"));
    let amount = 1 + sum(ctx, "CursorDpsDamage") + (ctx.state.counters["status:cursor-death-damage"] ?? 0) +
      sum(ctx, "HeroAliveCursorDpsDamage") * fighters(ctx).filter(unit => ctx.profileId(unit)).length;
    amount *= 1 + sum(ctx, "CursorDamagePerFoilMonsterInCollection") *
      ctx.save.foils.filter(id => BPH_ENEMY_MAP[id]).length;
    for (const effect of ctx.effects.filter(effect => effect.type === "CursorDamagePerHeroDeath")) {
      const steps = Math.floor((ctx.save.questProgress["status:hero-deaths"] ?? 0) / effect.countStep);
      const bonus = steps * effect.value;
      amount *= 1 + (effect.stackCap > 0 ? Math.min(effect.stackCap, bonus) : bonus);
    }
    // Every type-0 node placed in the original seven grids has at least one effect.
    // Repeated placements remain separate purchases; several effects on one placement count once.
    const upgrades = new Set(ctx.effects.filter(effect => effect.targets.nodeType === "0")
      .map(effect => effect.targets.placementId ?? effect.nodeId)).size;
    amount *= 1 + ctx.effects.filter(effect => effect.type === "CursorDamagePerPurchasedUpgrade")
      .reduce((bonus, effect) => bonus + Math.floor(upgrades / effect.countStep) * effect.value, 0);
    amount *= 1 + tomeBonus(ctx, "TomeCursorDpsDamage", "cursorDpsDamageBonusPercent");
    for (const effect of ctx.effects.filter(effect => effect.type === "CursorDpsEveryNthDamageMult"))
      if (effect.value > 0 && ordinal % effect.value === 0) amount *= effect.effectPower;
    const critical = chance(ctx, tomeBonus(ctx, "TomeCursorDpsCritChance", "cursorDpsCritChance"));
    if (critical) {
      unconfirmed(ctx, "cursor:critical-damage", "커서 치명 피해 배율 원본 미확인");
    }
    if (sum(ctx, "CursorHealsHeroesInsteadOfMonsterDamage") > 0) {
      for (const unit of fighters(ctx).filter(unit => ctx.profileId(unit)))
        if (Math.hypot(unit.x - ctx.pointer.x, unit.y - ctx.pointer.y) <= radius)
        ctx.heal(unit, amount * sum(ctx, "CursorHealsHeroesInsteadOfMonsterDamage"));
    } else {
      for (const target of [...ctx.run.enemies].filter(enemy => enemy.hp > 0 &&
        Math.hypot(enemy.x - ctx.pointer.x, enemy.y - ctx.pointer.y) <= radius)) {
        ctx.applyDamage({ target, amount: amount * damageBonus(ctx, target), critical, spellId: "CursorDps",
          position: ctx.pointer });
        for (const effect of ctx.effects.filter(effect => effect.type === "CursorDpsEveryNthApplyStatus"))
          if (effect.value > 0 && ordinal % effect.value === 0) applyStatus(ctx, effect, target, effect.effectPower);
      }
    }
  }
  ctx.state.timers["status:cursor-clock"] = clock;
}

function baseline(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind === "run-start") {
    ctx.state.castleShield.hp = ctx.state.castleShield.maxHp = ctx.run.maxBase * sum(ctx, "BonfireStartShieldPercent");
  } else if (event.kind === "unitKilled" && event.side === "ally" && ctx.profileId(event.unit)) {
    ctx.save.questProgress["status:hero-deaths"] = (ctx.save.questProgress["status:hero-deaths"] ?? 0) + 1;
  } else if (event.kind === "pack-opened") {
    for (const card of event.result.cards) if (BPH_TOMES[card.profileId])
      for (let i = 0; i < card.copies; i++) startTome(ctx, card.profileId, card.foil);
    const seconds = sum(ctx, "OpenPackCursorTimedAttackSpeedDurationSeconds");
    const cap = sum(ctx, "OpenPackCursorTimedAttackSpeedMaxStacks");
    if (seconds > 0 && cap > 0) {
      const active = Object.entries(ctx.state.timers).filter(([key, until]) =>
        key.startsWith("status:rapier:") && until > ctx.run.time).sort((a, b) => a[1] - b[1]);
      const slot = active.length < cap ? (ctx.state.counters["status:rapier-serial"] ?? 0) + 1 : null;
      if (slot !== null) {
        ctx.state.counters["status:rapier-serial"] = slot;
        ctx.state.timers[`status:rapier:${slot}`] = ctx.run.time + seconds;
      } else if (active[0]) unconfirmed(ctx, "OpenPackCursorTimedAttackSpeedMaxStacks",
        "최대3스택 재개봉 시 지속 갱신 정책 미확인; 기존 만료시각 보존");
    }
  } else if (event.kind === "step") {
    if (ctx.run.bph) for (const active of [...ctx.run.bph.tomes]) {
      const copies = active.clock === Infinity
        ? active.stacks - (ctx.state.counters[`status:adopted-tome:${active.id}`] ?? 0) : active.stacks;
      for (let i = 0; i < copies; i++) startTome(ctx, active.id, false);
    }
    tickSpellActors(ctx, event.dt);
    tickTomes(ctx, event.dt);
    tickCursor(ctx, event.dt);
    for (const spell of ctx.state.spells.splice(0)) executeSpell(ctx, spell);
    if (ctx.run.bph) ctx.run.bph.tomes = ctx.run.bph.tomes.filter(active => {
      if (active.clock !== Infinity) return true;
      active.stacks = aliveTomes(ctx).filter(tome => tome.id === active.id).length;
      ctx.state.counters[`status:adopted-tome:${active.id}`] = active.stacks;
      return active.stacks > 0;
    });
    ctx.state.statuses = ctx.state.statuses.filter(status => status.until > ctx.run.time);
    const slow = ctx.effects.filter(e => e.type === "InfectedEnemyMoveSpeedMultiplier")
      .reduce((factor, e) => factor * e.value, 1);
    for (const enemy of ctx.run.enemies) {
      const infected = ctx.state.statuses.some(s => s.targetId === enemy.id && s.id === "Infected");
      const previous = ctx.state.counters[`status:infected-speed:${enemy.id}`] ?? 1;
      const next = infected ? slow : 1;
      if (previous !== next) enemy.speed *= next / previous;
      ctx.state.counters[`status:infected-speed:${enemy.id}`] = next;
    }
  } else if (event.kind === "before-unit-damage" && event.hit.amount > 0 && !event.hit.prevented) {
    const fortify = ctx.state.statuses.find(s => s.targetId === event.unit.id &&
      s.id === "Fortify" && s.until > ctx.run.time);
    if (fortify) {
      event.hit.prevented = true;
      ctx.state.statuses.splice(ctx.state.statuses.indexOf(fortify), 1);
      ctx.emit({ kind: "block", x: event.unit.x, y: event.unit.y, value: event.hit.amount, target: event.unit.id });
    }
  } else if (event.kind === "before-attack") {
    for (const status of ctx.state.statuses.filter(s => s.targetId === event.unit.id && s.until > ctx.run.time)) {
      if (status.id === "Charge") event.attack.multiplier *= 1 + status.power / 100;
      if (status.id === "Stun") event.attack.handled = true;
    }
  } else if (event.kind === "unit-stats") {
    const invisible = ctx.state.statuses.find(s => s.targetId === event.unit.id &&
      s.id === "Invisibility" && s.until > ctx.run.time);
    if (invisible) event.stats.cooldown /= 1 + invisible.power / 100;
    event.stats.damage *= 1 + (ctx.state.counters[`status:summon-power:${event.unit.id}`] ?? 0);
    for (const active of aliveTomes(ctx).filter(tome => BPH_TOMES[tome.id].effectKind === 5)) {
      const raw = BPH_TOMES[active.id].raw;
      event.stats.damage *= 1 + Number(raw.heroFrenzyDamageBonusPercent);
      event.stats.cooldown /= 1 + Number(raw.heroFrenzyAttackSpeedBonusPercent);
      event.stats.moveSpeed *= 1 + Number(raw.heroFrenzyMoveSpeedBonusPercent);
      event.stats.area *= 1 + Number(raw.heroFrenzyAreaBonusPercent);
      event.stats.damageReduction += Number(raw.heroFrenzyDamageReductionBonusPercent);
    }
  }
}

function consume(ctx: BphFxContext, event: BphFxEvent, effect: BphEffect): void {
  switch (effect.type) {
    case "HeroDeathCastSpell":
    case "HeroDeathCastSpellChance":
      if (event.kind === "unitKilled" && event.side === "ally" && matches(ctx, effect, event.unit) &&
          (effect.type === "HeroDeathCastSpell" || chance(ctx, effect.value)))
        cast(ctx, effect, event.unit, effect.type === "HeroDeathCastSpell" ? effect.value : 1);
      return;
    case "DayStartGainTargetTome":
      if (event.kind === "run-start") for (let i = 0; i < effect.value; i++)
        startTome(ctx, effect.targets.targetTome, false);
      return;
    case "TomeBuffDurationIncrease":
    case "TomeChannelCastsPerTickBonus":
    case "TomeChannelIntervalReduction":
      return; // Read at activation or at the actual channel tick, never multiplied per effect callback.
    case "HeroAttackExtraSpellCastChance":
      if (event.kind === "after-attack" && matches(ctx, effect, event.unit) && chance(ctx, effect.value))
        cast(ctx, effect, event.unit, 1, event.target);
      return;
    case "HeroAttackedCastSpellChance":
      if (event.kind === "damage-dealt" && event.side === "ally" && event.dealt > 0 &&
          "downUntil" in event.target && matches(ctx, effect, event.target) && chance(ctx, effect.value))
        cast(ctx, effect, event.target, 1);
      return;
    case "HeroBlockCastSpell":
      if (event.kind === "damage-dealt" && event.side === "ally" && event.attempted > 0 &&
          event.dealt === 0 && event.blocked >= event.attempted &&
          "downUntil" in event.target && matches(ctx, effect, event.target))
        cast(ctx, effect, event.target, effect.value);
      return;
    case "HeroAttackApplyStatusChance":
      if (event.kind === "run-start" && effect.targets.targetStatus === "Electrify")
        unconfirmed(ctx, effect.type, "Electrify 기본 체인 피해식 미확인");
      if (event.kind === "after-attack" && matches(ctx, effect, event.unit)) {
        // The named Monkey upgrade authors duration in value and chance in effectPower.
        // Electrify's base chain geometry is not confirmed; do not pretend it is a timed stun.
        const id = effect.targets.targetStatus;
        const probability = effect.effectPower > 0 ? effect.effectPower : effect.value;
        if (id !== "Electrify" && chance(ctx, probability))
          applyStatus(ctx, effect, id === "Fortify" ? event.unit : event.target,
            effect.nodeId === "SN_MonkeyAttackStun" ? effect.value : undefined);
      }
      return;
    case "HeroSpawnApplyStatusToSelf":
      if (event.kind === "run-start" && effect.targets.targetStatus === "Invisibility")
        unconfirmed(ctx, effect.type, "은신 지속·공격 속도 실행; 네이티브 적 표적 배제 경계 없음");
      if (event.kind === "unit-spawn" && matches(ctx, effect, event.unit)) applyStatus(ctx, effect, event.unit);
      return;
    case "HeroFirstSpawnsApplyStatusToSelf":
      if (event.kind === "run-start" && effect.targets.targetStatus === "Revive")
        unconfirmed(ctx, effect.type, "Revive 회복 HP와 재등장 지연 원본 미확인; 부여·횟수만 실행");
      if (event.kind === "unit-spawn" && matches(ctx, effect, event.unit)) {
        const seen = ctx.state.counters[key(effect)] ?? 0;
        ctx.state.counters[key(effect)] = seen + 1;
        if (seen < effect.value) applyStatus(ctx, effect, event.unit);
      }
      return;
    case "HeroSpawnApplyStatusToAllHeroes":
      if (event.kind === "unit-spawn" && matches(ctx, effect, event.unit)) {
        const pool = fighters(ctx).filter(unit => matches(ctx, effect, unit, true));
        const count = effect.effectPower > 0 ? Math.min(pool.length, effect.effectPower) : pool.length;
        for (let i = 0; i < count; i++) {
          const index = effect.effectPower > 0 ? Math.floor(ctx.random() * pool.length) : 0;
          const [target] = pool.splice(index, 1);
          if (target) applyStatus(ctx, effect, target);
        }
      }
      return;
    case "HeroKillApplyStatusToSelfChance":
      if (event.kind === "run-start")
        unconfirmed(ctx, effect.type, "0.25 확률·Charge 기본 효과 실행; 노드 value=5와 기본 지속10의 우선순위 미확인");
      if (event.kind === "unitKilled" && event.side === "enemy" && event.source && matches(ctx, effect, event.source) &&
          chance(ctx, effect.effectPower)) applyStatus(ctx, effect, event.source);
      return;
    case "HeroPeriodicApplyStatus":
      if (event.kind === "run-start" && effect.targets.targetStatus === "Invisibility")
        unconfirmed(ctx, effect.type, "15초 주기·은신 속도 실행; 네이티브 적 표적 배제 경계 없음");
      if (event.kind === "step" && effect.value > 0) {
        const clock = (ctx.state.timers[key(effect)] ?? 0) + event.dt;
        const ticks = Math.floor(clock / effect.value);
        ctx.state.timers[key(effect)] = clock % effect.value;
        if (ticks) for (const unit of fighters(ctx).filter(unit => matches(ctx, effect, unit))) applyStatus(ctx, effect, unit);
      }
      return;
    case "HeroCombatCoinGainedApplyStatusToRandom":
      if (event.kind === "coins-gained") {
        const pool = fighters(ctx).filter(unit => matches(ctx, effect, unit));
        for (let i = 0; i < event.amount && pool.length; i++) {
          const target = pool[Math.floor(ctx.random() * pool.length)];
          if (target) applyStatus(ctx, effect, target);
        }
      }
      return;
    case "StunnedEnemyDamageBonus":
      if (event.kind === "before-enemy-damage" && event.enemy.stun > 0) event.hit.amount *= 1 + effect.value;
      return;
    case "InfectedEnemyDamageBonus":
      if (event.kind === "before-enemy-damage" && ctx.state.statuses.some(s =>
        s.targetId === event.enemy.id && s.id === "Infected" && s.until > ctx.run.time))
        event.hit.amount *= 1 + effect.value;
      return;
    case "InfectedEnemyMoveSpeedMultiplier":
      return; // Applied once per step in baseline, including restoration when infection expires.
    case "StatusEffectDurationBonus":
      return; // Read by applyStatus before a status is created, never accumulated per frame.
    case "BonfireStartShieldPercent":
      return; // Initialized once from the actual maxBase in baseline.
    case "BonfireShieldBreakCastSpell":
    case "TowerAttackedCastSpellChance":
      if ((effect.type === "BonfireShieldBreakCastSpell" && event.kind === "shieldBroken") ||
          (effect.type === "TowerAttackedCastSpellChance" && event.kind === "towerAttacked" &&
            event.hpLost > 0 && chance(ctx, effect.effectPower))) {
        ctx.state.spells.push({ id: effect.targets.targetSpell, x: event.position.x, y: event.position.y,
          power: 1, ...(event.attacker ? { targetId: event.attacker.id } : {}) });
      }
      return;
    case "CritKillCastSpellAtMonster":
    case "CursorCritKillCastSpellAtMonster":
      if (event.kind === "unitKilled" && event.side === "enemy" && event.critical &&
        (effect.type === "CritKillCastSpellAtMonster"
          ? event.source && matches(ctx, effect, event.source)
          : !event.source && event.origin === "effect")) {
        ctx.state.spells.push({ id: effect.targets.targetSpell, x: event.position.x, y: event.position.y,
          power: 1, ...(event.source ? { sourceId: event.source.id } : {}) });
      }
      return;
    case "HeroDeathCursorDpsDamageBonus":
    case "HeroDeathCursorDpsRadiusBonus":
      if (event.kind === "unitKilled" && event.side === "ally" && ctx.profileId(event.unit)) {
        const field = effect.type === "HeroDeathCursorDpsDamageBonus" ? "damage" : "radius";
        ctx.state.counters[`status:cursor-death-${field}`] = (ctx.state.counters[`status:cursor-death-${field}`] ?? 0) + effect.value;
      }
      return;
    case "CursorDamagePerHeroDeath":
    case "CursorDamagePerPurchasedUpgrade":
    case "CursorDpsDamage":
    case "CursorDpsIntervalReduction":
    case "CursorDpsRadius":
    case "CursorDpsEveryNthDamageMult":
    case "CursorDpsEveryNthApplyStatus":
    case "CursorHealsHeroesInsteadOfMonsterDamage":
    case "CursorDamagePerFoilMonsterInCollection":
    case "HeroAliveCursorDpsDamage":
    case "OpenPackCursorTimedAttackSpeedDurationSeconds":
    case "OpenPackCursorTimedAttackSpeedMaxStacks":
    case "OpenPackCursorTimedAttackSpeedPercent":
    case "TomeCursorDpsAreaBonus":
    case "TomeCursorDpsAttackSpeedBonus":
    case "TomeCursorDpsCritChance":
    case "SpellAoeRadius":
    case "SpellDuration":
    case "TargetSpellDamageBonus":
    case "TargetSpellRadius":
    case "TargetSpellHitStunSeconds":
    case "ThunderboltDamageBonus":
    case "TomeEffectPower":
    case "TomePowerPerFoilTomeInCollection":
      return; // Read at the actual cursor tick, book activation, or spell execution.
    case "SpellSurgeMasteryBonusPercent":
      if (event.kind === "run-start") unconfirmed(ctx, effect.type, "ResourceSurge 증폭의 가산·곱산 원본 공식 미확인");
      return;
    case "OpenPackCastSpell":
    case "OpenBoosterBoxCastSpell":
      if (event.kind === "pack-opened" && (!effect.targets.targetPack || effect.targets.targetPack === event.result.packId)) {
        const field = ctx.run.bph?.packs.find(pack => pack.packId === event.result.packId && pack.hp <= 0);
        if (!field) { unconfirmed(ctx, effect.type, "실제 개봉 위치/인스턴스 없음"); return; }
        if (effect.type === "OpenBoosterBoxCastSpell") {
          if (!field.box || ctx.state.counters[`status:box:${field.id}:${key(effect)}`]) return;
          ctx.state.counters[`status:box:${field.id}:${key(effect)}`] = 1;
        }
        for (let i = 0; i < effect.value; i++) ctx.state.spells.push({
          id: effect.targets.targetSpell, x: field.x, y: field.y, power: 1,
        });
      }
      return;
    case "InfectedDeathSpawnTargetHero":
    case "InfectedDeathSpreadRadius":
      if (event.kind === "unitKilled" && event.side === "enemy") {
        const infection = ctx.state.statuses.find(status => status.targetId === event.unit.id &&
          status.id === "Infected" && status.until > ctx.run.time);
        if (!infection) return;
        const source = ctx.run.squads.flatMap(s => [s, ...s.soldiers]).find(unit => unit.id === infection.sourceId);
        if (!source || !matches(ctx, effect, source)) return;
        if (effect.type === "InfectedDeathSpawnTargetHero") {
          if (chance(ctx, effect.value)) ctx.spawnProfile("Hero_Skeleton", 1, {
            packId: ctx.unitInfo(source)?.packId ?? "DeliveryBox", parentId: source.id,
            cause: "summon", position: event.position,
          });
        } else {
          const nearest = ctx.run.enemies.filter(enemy => enemy.hp > 0 &&
            !ctx.state.statuses.some(s => s.targetId === enemy.id && s.id === "Infected" && s.until > ctx.run.time) &&
            Math.hypot(enemy.x - event.position.x, enemy.y - event.position.y) <= effect.value * BPH_WORLD_TO_PX)
            .sort((a, b) => Math.hypot(a.x - event.position.x, a.y - event.position.y) -
              Math.hypot(b.x - event.position.x, b.y - event.position.y))[0];
          if (nearest) ctx.applyBuff({ target: nearest, side: "enemy", id: "Infected", source,
            duration: infection.until - ctx.run.time, power: infection.power, stacks: infection.stacks });
        }
      }
      return;
    case "TreantSeedFortifiedCastSpell":
      if (event.kind === "buff-applied" && event.request.id === "Fortify" && event.request.source &&
          matches(ctx, effect, event.request.source) && ctx.state.statuses.filter(status =>
            status.targetId === event.request.target.id && status.id === "Fortify" && status.until > ctx.run.time).length > 1) {
        for (let i = 0; i < effect.value; i++) ctx.state.spells.push({
          id: effect.targets.targetSpell, x: event.request.target.x, y: event.request.target.y,
          sourceId: event.request.source.id,
          power: Number(BPH_PROFILES[ctx.profileId(event.request.source) ?? ""].raw.spellPower),
        });
      }
      return;
  }
  if (event.kind === "run-start" && UNCONFIRMED[effect.type]) unconfirmed(ctx, effect.type, UNCONFIRMED[effect.type]);
}

const UNCONFIRMED: Readonly<Record<string, string>> = {
  ChapterFog: "전장 darkness/light-mask 렌더 경계 없음; 밝기 감소를 피해 감소로 대체하지 않음",
  CursorDpsApplyStatusChance: "Electrify electrifiedDamage=0과 power=2의 피해·점프 해석 미확인",
  ElectrifyChainDamagePercent: "증가율0.5 보존; 기본 Electrify 피해식 미확인",
  ElectrifyExtraChainJumps: "추가 점프 수 보존; 기본 체인 생성·명중 피해식 미확인",
  ThunderboltApplyStatus: "Electrify 기본 피해와 체인 실행식 미확인",
  FirstTargetSpawnAdditionalTome: "최초2명의 Arcanist 조건은 확인; 추가 책략의 원본 풀·분포 미확인",
  FogCursorTowerLightRadius: "원본 cursor0.8/tower1.1 반경은 확인; light-mask 렌더 경계 없음",
  FogSpectralsEmitLight: "혼령 개체와 light-mask 렌더 경계 없음",
  FogUnopenedPacksEmitLight: "원본 pack light 반경0.6은 확인; light-mask 렌더 경계 없음",
  CursorDpsEveryNthFreezeIntoIceCube: "매12번째 조건은 확인; 얼음 개체의 생성·파괴·충돌 전이 미확인",
  HeroAttackedFreezeIntoIceCubeChance: "0.01 확률은 확인; 얼음 개체 전이·물리 실행식 미확인",
  HeroDamageFreezeIntoIceCubeChance: "0.01 확률은 확인; 얼음 개체 전이·물리 실행식 미확인",
  IceCubeExtraHits: "Frozen 기본4회/+1은 확인; 얼음 피격→파괴→원형 복원 실행식 미확인",
  IceCubeSlideSpeed: "0.5 증가율은 확인; 원본 미끄러짐·충돌 물리 적분식 미확인",
  FrozenSlideBossMaxHpDamage: "최대HP 0.02 상한은 확인; 속도별 피해 곡선 미확인",
  FrozenSlideMaxHpDamage: "최대HP 0.2 상한은 확인; 속도별 피해 곡선 미확인",
  PackSpawnFrozen: "원본 cube/pack 연결과 실제 개봉 차단·해제 전이 미확인",
  HeroDeathSummonSpectralChance: "0.25/0.11 확률은 확인; 혼령 기본 체력·복귀 형태·감소식 미확인",
  SpectralHpDrainReduction: "감소율0.25는 확인; 기본 혼령 초당 HP 감소식 미확인",
  SpectralPactHpLossReduction: "감소율0.5는 확인; 기본 혼령 HP 감소식 미확인",
  HeroSpellCastApplyStatusChance: "Quasar 기본 피해0의 원본 산식 및 동시 시전 변형별 cast ID 미확인",
  HeroSpellCastSpeed: "원본 주문 간격은 평타 cooldown과 별개; PROFILES 기본 Portal 시전 타이머 연결 미확인",
  StatusEffectPowerBonus: "value1/effectPower0.5와 설명의25%가 달라 적용식 미확인",
  TargetSpellBounce: "원본은 화면 끝 도탄·랩; 네이티브 적 간 도탄으로 재해석하지 않음",
  TargetSpellPiercerHitRetainRateBonus: "유지율+0.1 확인; RiderPiercer.damage=0의 기본 피해 산식 미확인",
  TeleporterAoeHitApplyStatusChance: "value1/effectPower0.5와 설명의25% 충돌; Electrify 기본 피해식도 미확인",
  TomeExtraStacks: "포일 +1 giant stack 확인; 기본 거대 단계별 배율·크기 공식 미확인",
  SpellSurgeMasteryBonusPercent: "증가율0.5 확인; ResourceSurge 가산·곱산 및 원본 정산 순서 미확인",
};

const STATUS_KINDS = [
  "BonfireShieldBreakCastSpell",
  "BonfireStartShieldPercent",
  "ChapterFog",
  "CritKillCastSpellAtMonster",
  "CursorCritKillCastSpellAtMonster",
  "CursorDamagePerFoilMonsterInCollection",
  "CursorDamagePerHeroDeath",
  "CursorDamagePerPurchasedUpgrade",
  "CursorDpsApplyStatusChance",
  "CursorDpsDamage",
  "CursorDpsEveryNthApplyStatus",
  "CursorDpsEveryNthDamageMult",
  "CursorDpsEveryNthFreezeIntoIceCube",
  "CursorDpsIntervalReduction",
  "CursorDpsRadius",
  "CursorHealsHeroesInsteadOfMonsterDamage",
  "DayStartGainTargetTome",
  "ElectrifyChainDamagePercent",
  "ElectrifyExtraChainJumps",
  "FirstTargetSpawnAdditionalTome",
  "FogCursorTowerLightRadius",
  "FogSpectralsEmitLight",
  "FogUnopenedPacksEmitLight",
  "FrozenSlideBossMaxHpDamage",
  "FrozenSlideMaxHpDamage",
  "HeroAliveCursorDpsDamage",
  "HeroAttackApplyStatusChance",
  "HeroAttackExtraSpellCastChance",
  "HeroAttackedCastSpellChance",
  "HeroAttackedFreezeIntoIceCubeChance",
  "HeroBlockCastSpell",
  "HeroCombatCoinGainedApplyStatusToRandom",
  "HeroDamageFreezeIntoIceCubeChance",
  "HeroDeathCastSpell",
  "HeroDeathCastSpellChance",
  "HeroDeathCursorDpsDamageBonus",
  "HeroDeathCursorDpsRadiusBonus",
  "HeroDeathSummonSpectralChance",
  "HeroFirstSpawnsApplyStatusToSelf",
  "HeroKillApplyStatusToSelfChance",
  "HeroPeriodicApplyStatus",
  "HeroSpawnApplyStatusToAllHeroes",
  "HeroSpawnApplyStatusToSelf",
  "HeroSpellCastApplyStatusChance",
  "HeroSpellCastSpeed",
  "IceCubeExtraHits",
  "IceCubeSlideSpeed",
  "InfectedDeathSpawnTargetHero",
  "InfectedDeathSpreadRadius",
  "InfectedEnemyDamageBonus",
  "InfectedEnemyMoveSpeedMultiplier",
  "OpenBoosterBoxCastSpell",
  "OpenPackCastSpell",
  "OpenPackCursorTimedAttackSpeedDurationSeconds",
  "OpenPackCursorTimedAttackSpeedMaxStacks",
  "OpenPackCursorTimedAttackSpeedPercent",
  "PackSpawnFrozen",
  "SpectralHpDrainReduction",
  "SpectralPactHpLossReduction",
  "SpellAoeRadius",
  "SpellDuration",
  "SpellSurgeMasteryBonusPercent",
  "StatusEffectDurationBonus",
  "StatusEffectPowerBonus",
  "StunnedEnemyDamageBonus",
  "TargetSpellBounce",
  "TargetSpellDamageBonus",
  "TargetSpellHitStunSeconds",
  "TargetSpellPiercerHitRetainRateBonus",
  "TargetSpellRadius",
  "TeleporterAoeHitApplyStatusChance",
  "ThunderboltApplyStatus",
  "ThunderboltDamageBonus",
  "TomeBuffDurationIncrease",
  "TomeChannelCastsPerTickBonus",
  "TomeChannelIntervalReduction",
  "TomeCursorDpsAreaBonus",
  "TomeCursorDpsAttackSpeedBonus",
  "TomeCursorDpsCritChance",
  "TomeEffectPower",
  "TomeExtraStacks",
  "TomePowerPerFoilTomeInCollection",
  "TowerAttackedCastSpellChance",
  "TreantSeedFortifiedCastSpell"
] as const;

export const BPH_STATUS_CONSUMERS: readonly BphEffectConsumer[] = [{
  id: "status",
  kinds: STATUS_KINDS,
  onEvent: baseline,
  consume,
}];
