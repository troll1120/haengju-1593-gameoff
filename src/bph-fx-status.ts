import type { BphEffect, BphEffectConsumer, BphFxContext, BphFxEvent } from "./bph-contract";
import { aliveBphTomes as aliveTomes } from "./bph-active-tomes";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { BPH_ENEMY_MAP, BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { bphRelicClassMatches } from "./bph-relic-classes";
import type { Enemy, Unit } from "./rules";
import { CENTER } from "./geometry";
import { beginBphCast } from "./bph-effects-entry";
import { bphStats } from "./bph-combat";
import { BPH_TAP_STRIKE } from "./bph-tap-strike";
import type { BphTapStrikeView } from "./bph-tap-strike";
import { BPH_BLIZZARD, BPH_DRAGON_FIRE, BPH_HERO_FRENZY, castBphBlizzard, landBphDragonFire, tickBphTomeFields } from "./bph-tome-fields";
import { TUNABLES } from "./tunables";
import { bphDrawPool } from "./bph-tome-availability";

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
  const haengjuClass = effect.targets[secondary ? "secondTargetHaengjuClass" : "targetHaengjuClass"];
  if (haengjuClass && !bphRelicClassMatches(ctx.effects, profile.classId, haengjuClass)) return false;
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

/** Local shock: two damage, a brief interruption, and the equipped extra jumps.
 * Uses the authored Electrify power (2) and Thunderbolt interruption (0.4s).
 * Each jump visits a different living enemy within one world unit. */
export function electrifyBphTarget(ctx: BphFxContext, target: Enemy, source?: Unit): void {
  const hit = new Set<number>();
  let current: Enemy | undefined = target;
  const jumps = Math.max(0, Math.floor(sum(ctx, "ElectrifyExtraChainJumps")));
  const amount = 2 * (1 + sum(ctx, "ElectrifyChainDamagePercent"));
  for (let jump = 0; current && jump <= jumps; jump++) {
    hit.add(current.id);
    const position: { x: number; y: number } = { x: current.x, y: current.y };
    ctx.applyDamage({ target: current, amount, source, spellId: "Electrify", position });
    if (current.hp > 0) current.stun = Math.max(current.stun, SPELLS.Spell_Thunderbolt.stun);
    ctx.emit({ kind: "shot", x: position.x, y: position.y, value: amount, target: current.id, label: "bolt" });
    current = ctx.run.enemies.filter(enemy => enemy.hp > 0 && !hit.has(enemy.id) &&
      Math.hypot(enemy.x - position.x, enemy.y - position.y) <= BPH_WORLD_TO_PX)
      .sort((a, b) => Math.hypot(a.x - position.x, a.y - position.y) -
        Math.hypot(b.x - position.x, b.y - position.y))[0];
  }
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

/** Tactics that follow the pointer instead of firing on their own (owner DMs 1794920233.660669, 1794920802.911539,
 *  1794920906.443119, 1794922243.201739): while drawn they are the cursor together and act only where the player points.
 *  every: seconds between casts at the pointer; radius: battlefield px of the aim ring and of the effect. */
export const BPH_CURSOR_TACTICS: Readonly<Record<string, { readonly every: number; readonly radius: () => number }>> = {
  Tome_Thunderstorm: { every: TUNABLES.cursorTactics.everySeconds.Tome_Thunderstorm, radius: () => BPH_TAP_STRIKE.radius },
  // The authored Shockwave radius (3 world units, 400 px) covers the whole field; at the pointer it is one world unit.
  Tome_Earthquake: { every: TUNABLES.cursorTactics.everySeconds.Tome_Earthquake, radius: () => BPH_WORLD_TO_PX },
  // A fire patch is laid wherever the drag has moved a patch's width, or again in place once the last one burns out.
  // (Radii are read lazily: bph-tome-fields and this module import each other.)
  Tome_DragonsCall: { every: TUNABLES.cursorTactics.everySeconds.Tome_DragonsCall, radius: () => BPH_DRAGON_FIRE.radius * BPH_WORLD_TO_PX },
  Tome_Blizzard: { every: TUNABLES.cursorTactics.everySeconds.Tome_Blizzard, radius: () => BPH_BLIZZARD.radius * BPH_WORLD_TO_PX },
};
/** A tactic book without an authored duration lasts this long. */
export const BPH_TACTIC_DEFAULT_SECONDS = TUNABLES.cursorTactics.defaultSeconds;

type CursorTactic = { readonly prefix: string; readonly id: string; readonly foil: boolean };

function aliveTomePrefixes(ctx: BphFxContext): string[] {
  return Object.keys(ctx.state.timers).filter(key => key.startsWith("status:tome:") && key.endsWith(":until") &&
    ctx.state.timers[key] > ctx.run.time).map(key => key.slice(0, -6));
}

/** Every live pointer tactic is the cursor at once (owner DM 1794922243.201739): each fires at the pointer on its own rate.
 *  Empty while the default arrow volley is the cursor. */
function cursorTactics(ctx: BphFxContext): CursorTactic[] {
  return aliveTomePrefixes(ctx).map(prefix => ({ prefix, id: prefix.split(":")[3], foil: ctx.state.counters[`${prefix}:foil`] === 1 }))
    .filter(tactic => BPH_CURSOR_TACTICS[tactic.id]);
}

/** keys: the active tactics' timer keys (their indicators are highlighted); radius: the largest reach, drawn as the aim ring. */
export type BphTacticCursorView = { readonly keys: readonly string[]; readonly ids: readonly string[]; readonly radius: number };
export function bphTacticCursorView(ctx: BphFxContext): BphTacticCursorView | null {
  const tactics = cursorTactics(ctx);
  return tactics.length ? { keys: tactics.map(tactic => `${tactic.prefix}:until`), ids: tactics.map(tactic => tactic.id),
    radius: Math.max(...tactics.map(tactic => BPH_CURSOR_TACTICS[tactic.id].radius())) } : null;
}

function adoptTome(ctx: BphFxContext, id: string): void {
  if (!ctx.run.bph) return;
  const stacks = aliveTomes(ctx).filter(active => active.id === id).length;
  const existing = ctx.run.bph.tomes.find(active => active.id === id);
  if (existing) { existing.clock = Infinity; existing.stacks = stacks; }
  else ctx.run.bph.tomes.push({ id, clock: Infinity, stacks });
  ctx.state.counters[`status:adopted-tome:${id}`] = stacks;
}

function startTome(ctx: BphFxContext, id: string, foil: boolean): boolean {
  const tome = BPH_TOMES[id];
  if (!tome) return false;
  const duration = (Number(tome.raw.buffDuration) > 0 ? Number(tome.raw.buffDuration) : BPH_TACTIC_DEFAULT_SECONDS) * (1 +
    tomeEffects(ctx, "TomeBuffDurationIncrease", id, foil).reduce((sum, e) => sum + e.value, 0));
  const live = BPH_CURSOR_TACTICS[id] || id === BPH_HERO_FRENZY.id ? aliveTomePrefixes(ctx).find(prefix => prefix.split(":")[3] === id) : undefined;
  if (live) {
    // Drawing a pointer tactic (or 격려) again lengthens the one in play.
    ctx.state.timers[`${live}:until`] += duration;
    if (foil) ctx.state.counters[`${live}:foil`] = 1;
    ctx.state.counters["status:tome-serial"] = (ctx.state.counters["status:tome-serial"] ?? 0) + 1;
    adoptTome(ctx, id);
    return true;
  }
  if ([4, 5].includes(tome.effectKind) && aliveTomes(ctx).some(active => active.id === id)) {
    unconfirmed(ctx, `tome:${id}:stacks`,
      "원본 cursorDpsCumulativePercentage/giant 중첩식 미확인; 선형 중첩으로 대체하지 않음");
    return false;
  }
  if ([7, 8, 9, 10, 11].includes(tome.effectKind) && id !== "Tome_Blizzard")
    unconfirmed(ctx, `tome:${id}`, "원본 혼령·변환·표식·소비품·얼음 개체의 실행식 미확인");
  const serial = (ctx.state.counters["status:tome-serial"] ?? 0) + 1;
  ctx.state.counters["status:tome-serial"] = serial;
  const prefix = `status:tome:${serial}:${id}`;
  ctx.state.timers[`${prefix}:until`] = ctx.run.time + duration;
  ctx.state.timers[`${prefix}:clock`] = 0;
  ctx.state.counters[`${prefix}:foil`] = Number(foil);
  const bonus = tomeEffects(ctx, "TomeChannelIntervalReduction", id, foil).reduce((sum, e) => sum + e.value, 0);
  ctx.state.timers[`${prefix}:interval`] = tome.interval / (1 + bonus);
  adoptTome(ctx, id);
  return true;
}

/** One cast of the cursor tactic at the pointer, using each book's existing spell or field. */
function castAtPointer(ctx: BphFxContext, cursor: CursorTactic, at: { readonly x: number; readonly y: number }): void {
  const { prefix, id, foil } = cursor, tome = BPH_TOMES[id], radius = BPH_CURSOR_TACTICS[id].radius();
  const casts = tome.casts + tomeEffects(ctx, "TomeChannelCastsPerTickBonus", id, foil).reduce((sum, e) => sum + e.value, 0);
  if (id === "Tome_Thunderstorm") {
    // Resolve one hit per foe in the aim ring, keeping the book's full bolt damage per cast.
    const targets = ctx.run.enemies.filter(enemy => enemy.hp > 0 && Math.hypot(enemy.x - at.x, enemy.y - at.y) <= radius);
    for (const target of targets) {
      executeSpell(ctx, { id: "Spell_Thunderbolt", x: target.x, y: target.y, power: casts, targetId: target.id,
        radiusPx: radius, fx: "bolt" }, id, foil);
    }
  } else if (id === "Tome_Earthquake") {
    executeSpell(ctx, { id: "Spell_Shockwave", x: at.x, y: at.y, power: 1, radiusPx: radius, fx: "quake" }, id, foil);
    unconfirmed(ctx, `tome:${id}:push`, "원본 BellTower 힘→변위의 물리 적분식 미확인");
  } else if (id === "Tome_DragonsCall") {
    const last = { x: ctx.state.timers[`${prefix}:fire-x`], y: ctx.state.timers[`${prefix}:fire-y`] };
    const laidAt = ctx.state.timers[`${prefix}:fire-at`];
    if (laidAt !== undefined && Math.hypot(at.x - last.x, at.y - last.y) < radius &&
      ctx.run.time - laidAt < BPH_DRAGON_FIRE.duration) return;
    ctx.state.timers[`${prefix}:fire-x`] = at.x; ctx.state.timers[`${prefix}:fire-y`] = at.y;
    ctx.state.timers[`${prefix}:fire-at`] = ctx.run.time;
    const spell = { id: "Spell_DragonsCall", x: at.x, y: at.y, power: 1 };
    const amount = BPH_DRAGON_FIRE.damage * tomePower(ctx, id, foil) * (1 + spellSum(ctx, "TargetSpellDamageBonus", spell, id));
    for (let i = 0; i < casts; i++) landBphDragonFire(ctx, amount, at);
  } else if (id === "Tome_Blizzard") {
    for (let i = 0; i < casts; i++) castBphBlizzard(ctx, tomePower(ctx, id, foil), at);
  }
}

/** Cursor tactics act only while the player points (desktop hover, a pressed finger), each on its own clock. */
function tickCursorTactics(ctx: BphFxContext, dt: number): void {
  for (const cursor of cursorTactics(ctx)) tickCursorTactic(ctx, cursor, dt);
}

function tickCursorTactic(ctx: BphFxContext, cursor: CursorTactic, dt: number): void {
  // TomeChannelIntervalReduction (the book's cast speed upgrades) quickens the cursor rate as it did the old channel.
  const speed = 1 + tomeEffects(ctx, "TomeChannelIntervalReduction", cursor.id, cursor.foil).reduce((sum, e) => sum + e.value, 0);
  const every = BPH_CURSOR_TACTICS[cursor.id].every / speed, clockKey = `${cursor.prefix}:clock`;
  const remaining = ctx.state.timers[`${cursor.prefix}:until`] - (ctx.run.time - dt);
  let clock = (ctx.state.timers[clockKey] ?? 0) + Math.min(dt, Math.max(0, remaining));
  const at = ctx.state.aim;
  if (!at) { ctx.state.timers[clockKey] = Math.min(clock, every); return; }
  // A press that starts after a full rest strikes at once; holding on repeats at the tactic's rate.
  while (clock >= every) { clock -= every; castAtPointer(ctx, cursor, at); }
  ctx.state.timers[clockKey] = clock;
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
    if (!tome || remaining <= 0 || BPH_CURSOR_TACTICS[id]) continue;
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
      } else if (tome.effectKind === 0 && reference(tome.raw.targetSpell) === "Spell_DragonsCall") {
        const spell = { id: "Spell_DragonsCall", x: CENTER.x, y: CENTER.y, power: 1 };
        const amount = BPH_DRAGON_FIRE.damage * tomePower(ctx, id, foil) * (1 + spellSum(ctx, "TargetSpellDamageBonus", spell, id));
        for (let i = 0; i < casts; i++) landBphDragonFire(ctx, amount);
      } else if (tome.effectKind === 11 && id === "Tome_Blizzard") {
        for (let i = 0; i < casts; i++) castBphBlizzard(ctx, tomePower(ctx, id, foil));
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

function tomePower(ctx: BphFxContext, id: string, foil: boolean): number {
  return (1 + sum(ctx, "TomePowerPerFoilTomeInCollection") * ctx.save.foils.filter(card => BPH_TOMES[card]).length) *
    (1 + tomeEffects(ctx, "TomeEffectPower", id, foil).reduce((total, effect) => total + effect.value, 0));
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

type Spell = BphFxContext["state"]["spells"][number] & {
  /** Base hit radius in px instead of the authored one (the earthquake at the pointer). */
  readonly radiusPx?: number;
  /** The picture this cast's spell effect carries (owner DM 1794922729.289679): a cursor tactic's 뇌격 bolt or 지진 shockwave. */
  readonly fx?: "bolt" | "quake";
  readonly damageSnapshot?: number;
  readonly criticalSnapshot?: boolean;
};
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
  "Spell_Shockwave", "Spell_PoisonCloud", "Spell_Mine", "Spell_Fireball", "Spell_TeleportAndDamageAoe",
  "Spell_SkeletonBone", "Spell_BladeRain"]);

/** Shared raw spell damage for native resolution and army auxiliary attacks. */
export function bphSpellDamage(ctx: BphFxContext, spell: Spell, tomeId?: string): number {
  const definition = SPELLS[spell.id];
  if (!definition || !BPH_EXECUTABLE_SPELLS.has(spell.id)) return 0;
  if (spell.id === "Spell_Stun") return 0;
  const source = ctx.run.squads.flatMap(s => [s, ...s.soldiers]).find(unit => unit.id === spell.sourceId);
  // Hero.GetSpellCastBaseDamage delegates to EffectiveAttackDamage. spellPower
  // scales the original planeswalker heal/revive/buff spells, not hero attacks.
  const base = (source && bphStats(source, ctx.run)?.damage) ?? definition.damage * spell.power;
  const collectionPower = tomeId ? 1 + sum(ctx, "TomePowerPerFoilTomeInCollection") *
    ctx.save.foils.filter(id => BPH_TOMES[id]).length : 1;
  return base * collectionPower * (1 + spellSum(ctx, "TargetSpellDamageBonus", spell, tomeId) +
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
  const radius = (spell.radiusPx ?? definition.radius * BPH_WORLD_TO_PX) *
    (1 + spellSum(ctx, "SpellAoeRadius", spell, tomeId) + spellSum(ctx, "TargetSpellRadius", spell, tomeId) +
      (spell.id === "Spell_Mine" ? spellSum(ctx, "HeroMineAoeRadius", spell, tomeId) : 0) +
      (spell.id === "Spell_Stun" ? spellSum(ctx, "PaladinTauntArea", spell, tomeId) : 0));
  const duration = definition.duration * (1 + spellSum(ctx, "SpellDuration", spell, tomeId));
  const collectionPower = tomeId ? 1 + sum(ctx, "TomePowerPerFoilTomeInCollection") *
    ctx.save.foils.filter(id => BPH_TOMES[id]).length : 1;
  const bookPower = tomeId ? collectionPower * (1 +
    tomeEffects(ctx, "TomeEffectPower", tomeId, foil).reduce((sum, e) => sum + e.value, 0)) : 1;
  const baseDamage = bphSpellDamage(ctx, spell, tomeId);
  const sourceStats = source ? bphStats(source, ctx.run) : null;
  const critical = spell.criticalSnapshot ?? (baseDamage > 0 && sourceStats !== null &&
    sourceStats.critChance > 0 && ctx.random() < ctx.chance(sourceStats.critChance));
  const amount = spell.damageSnapshot ?? baseDamage * (critical ? 2 + (sourceStats?.critDamage ?? 0) : 1);
  if (!arrived && spell.id === "Spell_SkeletonBone") {
    // Native death throw: the bone flies from the corpse to the nearest enemy
    // (Spell_SkeletonBone speed 3.5) and hits that single target on arrival.
    if (!target) return;
    const flight = Math.hypot(target.x - spell.x, target.y - spell.y) /
      (definition.speed * BPH_WORLD_TO_PX);
    ctx.state.actors.push({ id: ctx.run.nextId++, ownerId: source?.id ?? -1, kind: "mine",
      x: target.x, y: target.y, toX: target.x, toY: target.y, startedAt: ctx.run.time,
      until: ctx.run.time + flight, power: amount, radius, targets: [], cast, data: {
        statusSpell: 1, mode: 2, boneTargetId: target.id,
        clock: 0, interval: definition.tick, sourceId: source?.id ?? -1,
        fromX: spell.x, fromY: spell.y, critical: Number(critical),
        spellIndex: Object.keys(SPELLS).indexOf(spell.id), castPower: spell.power,
        tomeIndex: tomeId ? Object.keys(BPH_TOMES).indexOf(tomeId) : -1, foil: Number(foil),
      } });
    return;
  }
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
        fromX: source?.x ?? spell.x, fromY: source?.y ?? spell.y, critical: Number(critical),
        ...(spell.id === "Spell_Mine" ? { fuseAt: 0, chained: 0, igniterId: -1 } : {}),
        spellIndex: Object.keys(SPELLS).indexOf(spell.id), castPower: spell.power,
        tomeIndex: tomeId ? Object.keys(BPH_TOMES).indexOf(tomeId) : -1, foil: Number(foil),
      } });
    return;
  }
  if (spell.id === "Spell_TeleportAndDamageAoe" && source) { source.x = spell.x; source.y = spell.y; }
  const targets = spell.id === "Spell_Thunderbolt" || spell.id === "Spell_SkeletonBone"
    ? (target ? [target] : []) :
    ctx.run.enemies.filter(enemy => enemy.hp > 0 && Math.hypot(enemy.x - spell.x, enemy.y - spell.y) <= radius);
  const stun = (spell.id === "Spell_Stun" ? duration : definition.stun) * bookPower +
    spellSum(ctx, "TargetSpellHitStunSeconds", spell, tomeId);
  for (const enemy of targets) {
    if (amount > 0) ctx.applyDamage({ target: enemy, amount: amount * damageBonus(ctx, enemy), source, critical,
      spellId: spell.id, position: { x: spell.x, y: spell.y }, cast });
    if (stun > 0 && enemy.hp > 0) enemy.stun = Math.max(enemy.stun, stun);
  }
  ctx.emit({ kind: spell.id === "Spell_Thunderbolt" ? "shot" : "blast",
    x: spell.x, y: spell.y, value: spell.fx === "bolt" ? spell.radiusPx ?? radius : radius,
    ...(spell.fx ? { label: spell.fx } : {}), ...(target ? { target: target.id } : {}) });
}

function tickSpellActors(ctx: BphFxContext, dt: number): void {
  const completed = new Set<number>();
  for (const actor of [...ctx.state.actors].filter(actor => actor.data.statusSpell === 1)) {
    const id = Object.keys(SPELLS)[actor.data.spellIndex], source = ctx.run.squads
      .flatMap(s => [s, ...s.soldiers]).find(unit => unit.id === actor.data.sourceId);
    if (actor.data.mode === 2) {
      if (ctx.run.time >= actor.until) {
        executeSpell(ctx, { id, x: actor.x, y: actor.y, power: actor.data.castPower, sourceId: actor.data.sourceId,
          cast: actor.cast, damageSnapshot: actor.power, criticalSnapshot: actor.data.critical === 1,
          ...(actor.data.boneTargetId === undefined ? {} : { targetId: actor.data.boneTargetId }) },
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
      // Native ColossusMine: only the cursor's DPS hit area or another mine's
      // chain ignites it (0.2s fuse); enemy contact never detonates it, and it
      // quietly disappears when its 30s lifetime ends.
      if (actor.data.fuseAt > 0 && ctx.run.time >= actor.data.fuseAt) {
        actor.data.exploded = 1;
        const chainBonus = actor.data.chained === 1 ? 1 + sum(ctx, "HeroMineChainDamageBonus") : 1;
        ctx.emitEvent({ kind: "mine-chain", actor,
          previous: ctx.state.actors.find(other => other.id === actor.data.igniterId) ?? null });
        for (const target of targets) {
          const dealt = ctx.applyDamage({ target, amount: actor.power * chainBonus * damageBonus(ctx, target),
            source, critical: actor.data.critical === 1, spellId: id, position: actor, cast: actor.cast });
          if (dealt > 0) actor.targets.push(target.id);
        }
        ctx.emit({ kind: "blast", x: actor.x, y: actor.y, value: actor.radius });
        for (const other of ctx.state.actors) {
          if (other === actor || other.data.statusSpell !== 1 || other.data.mode !== 1
            || other.data.fuseAt > 0) continue;
          if (Math.hypot(other.x - actor.x, other.y - actor.y) <= actor.radius) {
            other.data.fuseAt = ctx.run.time + 0.2;
            other.data.chained = 1;
            other.data.igniterId = actor.id;
          }
        }
        completed.add(actor.id);
      }
      continue;
    } else {
      actor.data.clock += Math.min(dt, remaining);
      while (actor.data.clock >= actor.data.interval) {
        actor.data.clock -= actor.data.interval;
        for (const target of targets) if (target.hp > 0) ctx.applyDamage({
          target, amount: actor.power * damageBonus(ctx, target), source, critical: actor.data.critical === 1,
          spellId: id, position: actor, cast: actor.cast,
        });
      }
    }
    if (ctx.run.time >= actor.until) completed.add(actor.id);
  }
  ctx.state.actors = ctx.state.actors.filter(actor => !completed.has(actor.id));
}

/** The Frenzy book's own cursor fields while it is active (node bonuses are read separately below). */
function frenzy(ctx: BphFxContext, field: string): number {
  return aliveTomes(ctx).filter(tome => tome.id === "Tome_CursorDPS").reduce((bonus, tome) => bonus +
    Number(BPH_TOMES[tome.id].raw[field] ?? 0) * (field === "cursorDpsAreaBonusPercent" ? 1 +
      tomeEffects(ctx, "TomeEffectPower", tome.id, tome.foil).reduce((value, effect) => value + effect.value, 0) : 1), 0);
}

/** The original cursor upgrades now shape the tap strike: CursorDps* radius, damage and attack speed (recharge),
 *  the two former Frenzy-only nodes add one volley each, the former cursor Rain of Arrows node lights fire arrows. */
function tapStrikeStats(ctx: BphFxContext) {
  const rapier = Object.entries(ctx.state.timers).filter(([key, until]) =>
    key.startsWith("status:rapier:") && until > ctx.run.time).length * sum(ctx, "OpenPackCursorTimedAttackSpeedPercent");
  return {
    speed: 1 + sum(ctx, "CursorDpsIntervalReduction") + rapier + frenzy(ctx, "cursorDpsAttackSpeedBonusPercent"),
    radius: BPH_TAP_STRIKE.radius * (1 + sum(ctx, "CursorDpsRadius") + (ctx.state.counters["status:cursor-death-radius"] ?? 0) +
      sum(ctx, "TomeCursorDpsAreaBonus") + frenzy(ctx, "cursorDpsAreaBonusPercent")),
    max: BPH_TAP_STRIKE.charges + ctx.effects.filter(effect =>
      effect.type === "TomeCursorDpsAttackSpeedBonus" || effect.type === "TomeCursorDpsCritChance").length,
    fire: ctx.effects.some(effect => effect.type === "CursorCritKillCastSpellAtMonster"),
  };
}

function tapCharges(ctx: BphFxContext, max: number): number {
  return Math.min(max, ctx.state.counters["tap:charges"] ?? max);
}

export function bphTapStrikeView(ctx: BphFxContext): BphTapStrikeView {
  const { max, radius } = tapStrikeStats(ctx), charges = tapCharges(ctx, max);
  return { charges, max, radius, refill: charges >= max ? 1 : (ctx.state.timers["tap:clock"] ?? 0) / BPH_TAP_STRIKE.rechargeSeconds };
}

function rechargeStrikes(ctx: BphFxContext, dt: number): void {
  const { speed, max } = tapStrikeStats(ctx);
  let charges = tapCharges(ctx, max), clock = ctx.state.timers["tap:clock"] ?? 0;
  if (charges < max && speed > 0) {
    clock += dt * speed;
    while (clock >= BPH_TAP_STRIKE.rechargeSeconds && charges < max) { clock -= BPH_TAP_STRIKE.rechargeSeconds; charges++; }
  }
  ctx.state.counters["tap:charges"] = charges;
  ctx.state.timers["tap:clock"] = charges >= max ? 0 : clock;
}

function callStrike(ctx: BphFxContext, position: { readonly x: number; readonly y: number }): void {
  const { radius, max, fire } = tapStrikeStats(ctx), charges = tapCharges(ctx, max);
  if (charges < 1) return;
  ctx.state.counters["tap:charges"] = charges - 1;
  ctx.state.strikes.push({ x: position.x, y: position.y, landAt: ctx.run.time + BPH_TAP_STRIKE.travelSeconds });
  ctx.emit({ kind: "strike", x: position.x, y: position.y, value: radius, fromX: CENTER.x, fromY: CENTER.y,
    ...(fire ? { label: "fire" } : {}) });
}

function landStrikes(ctx: BphFxContext): void {
  const landed = ctx.state.strikes.filter(strike => strike.landAt <= ctx.run.time + 1e-9);
  if (!landed.length) return;
  ctx.state.strikes = ctx.state.strikes.filter(strike => !landed.includes(strike));
  for (const strike of landed) {
    // Each volley is one original cursor attack: every-Nth relics, crits and heal modifiers count volleys.
    const ordinal = (ctx.state.counters["status:cursor-hits"] ?? 0) + 1;
    ctx.state.counters["status:cursor-hits"] = ordinal;
    const { radius, fire } = tapStrikeStats(ctx);
    let amount = BPH_TAP_STRIKE.damage * (1 + sum(ctx, "CursorDpsDamage") + (ctx.state.counters["status:cursor-death-damage"] ?? 0) +
      sum(ctx, "HeroAliveCursorDpsDamage") * fighters(ctx).filter(unit => ctx.profileId(unit)).length);
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
    const critical = chance(ctx, frenzy(ctx, "cursorDpsCritChance"));
    if (critical) {
      unconfirmed(ctx, "cursor:critical-damage", "커서 치명 피해 배율 원본 미확인");
    }
    // Every volley (the former cursor DPS hit) ignites resting mines under its landing circle
    // (native ColossusMine trigger collider; 0.2s fuse, inference: heal-mode
    // volleys ignite too because the hit area is the same zone).
    for (const actor of ctx.state.actors)
      if (actor.data.statusSpell === 1 && actor.data.mode === 1 && !(actor.data.fuseAt > 0)
        && Math.hypot(actor.x - strike.x, actor.y - strike.y) <= radius)
        actor.data.fuseAt = ctx.run.time + 0.2;
    if (sum(ctx, "CursorHealsHeroesInsteadOfMonsterDamage") > 0) {
      for (const unit of fighters(ctx).filter(unit => ctx.profileId(unit)))
        if (Math.hypot(unit.x - strike.x, unit.y - strike.y) <= radius)
        ctx.heal(unit, amount * sum(ctx, "CursorHealsHeroesInsteadOfMonsterDamage"));
    } else {
      const targets = ctx.run.enemies.filter(enemy => enemy.hp > 0 &&
        Math.hypot(enemy.x - strike.x, enemy.y - strike.y) <= radius);
      const freezeEffects = ctx.effects.filter(effect => effect.type === "CursorDpsEveryNthFreezeIntoIceCube");
      const hitOrdinal = (ctx.state.counters["status:cursor-enemy-hits"] ?? 0) + 1;
      if (freezeEffects.length && targets.length) ctx.state.counters["status:cursor-enemy-hits"] = hitOrdinal;
      for (const target of targets) {
        ctx.applyDamage({ target, amount: amount * damageBonus(ctx, target), critical, spellId: "CursorDps",
          position: strike });
        if (fire && target.hp > 0) target.burn = Math.max(target.burn, BPH_TAP_STRIKE.fireSeconds);
        for (const effect of ctx.effects.filter(effect => effect.type === "CursorDpsEveryNthApplyStatus"))
          if (effect.value > 0 && ordinal % effect.value === 0) applyStatus(ctx, effect, target, effect.effectPower);
        if (target.hp > 0) {
          for (const effect of freezeEffects)
            if (effect.value > 0 && hitOrdinal % effect.value === 0)
              applyStatus(ctx, { ...effect, targets: { ...effect.targets, targetStatus: "Frozen" } }, target);
          for (const effect of ctx.effects.filter(effect => effect.type === "CursorDpsApplyStatusChance"))
            if (effect.targets.targetStatus === "Electrify" && chance(ctx, effect.effectPower))
              electrifyBphTarget(ctx, target);
        }
      }
    }
  }
}

function baseline(ctx: BphFxContext, event: BphFxEvent): void {
  if (event.kind === "run-start") {
    ctx.state.castleShield.hp = ctx.state.castleShield.maxHp = ctx.run.maxBase * sum(ctx, "BonfireStartShieldPercent");
  } else if (event.kind === "unitKilled" && event.side === "ally" && ctx.profileId(event.unit)) {
    ctx.save.questProgress["status:hero-deaths"] = (ctx.save.questProgress["status:hero-deaths"] ?? 0) + 1;
    const revive = ctx.state.statuses.find(status => status.targetId === event.unit.id &&
      status.id === "Revive" && status.until > ctx.run.time);
    if (revive) {
      ctx.state.statuses.splice(ctx.state.statuses.indexOf(revive), 1);
      ctx.state.counters[`status:revive:${event.unit.id}`] = 1;
    }
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
  } else if (event.kind === "tap") {
    // While a tactic is the cursor the tap belongs to it; the volley waits for the arrow cursor to return.
    if (!cursorTactics(ctx).length) callStrike(ctx, event.position);
  } else if (event.kind === "aim") {
    ctx.state.aim = event.position ? { x: event.position.x, y: event.position.y } : null;
  } else if (event.kind === "step") {
    // Death resolution writes downUntil after unitKilled; restore on the next
    // battle step so it cannot overwrite the resurrection.
    for (const unit of ctx.run.squads.flatMap(squad => [squad, ...squad.soldiers])) {
      const revive = `status:revive:${unit.id}`;
      if (!ctx.state.counters[revive]) continue;
      delete ctx.state.counters[revive];
      if (unit.hp <= 0) {
        unit.hp = unit.maxHp / 2;
        unit.downUntil = 0;
        unit.clock = 0;
        unit.strikeAt = 0;
        ctx.emit({ kind: "rise", x: unit.x, y: unit.y, value: unit.hp, target: unit.id });
      }
    }
    if (ctx.run.bph) for (const active of [...ctx.run.bph.tomes]) {
      const copies = active.clock === Infinity
        ? active.stacks - (ctx.state.counters[`status:adopted-tome:${active.id}`] ?? 0) : active.stacks;
      for (let i = 0; i < copies; i++) startTome(ctx, active.id, false);
    }
    tickSpellActors(ctx, event.dt);
    tickBphTomeFields(ctx, event.dt);
    tickTomes(ctx, event.dt);
    tickCursorTactics(ctx, event.dt);
    rechargeStrikes(ctx, event.dt);
    landStrikes(ctx);
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
    if (event.unit.kind !== "general" && aliveTomes(ctx).some(tome => tome.id === BPH_HERO_FRENZY.id)) {
      event.stats.cooldown /= 1 + BPH_HERO_FRENZY.attackSpeed;
      event.stats.damageReduction += BPH_HERO_FRENZY.reduction;
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
      if (event.kind === "after-attack" && matches(ctx, effect, event.unit)) {
        // The named Monkey upgrade authors duration in value and chance in effectPower.
        const id = effect.targets.targetStatus;
        const probability = effect.effectPower > 0 ? effect.effectPower : effect.value;
        if (chance(ctx, probability)) {
          if (id === "Electrify") electrifyBphTarget(ctx, event.target, event.unit);
          else applyStatus(ctx, effect, id === "Fortify" ? event.unit : event.target,
              effect.nodeId === "SN_MonkeyAttackStun" ? effect.value : undefined);
        }
      }
      return;
    case "HeroSpawnApplyStatusToSelf":
      if (event.kind === "unit-spawn" && matches(ctx, effect, event.unit)) applyStatus(ctx, effect, event.unit);
      return;
    case "HeroFirstSpawnsApplyStatusToSelf":
      if (event.kind === "unit-spawn" && matches(ctx, effect, event.unit)) {
        const seen = ctx.state.counters[key(effect)] ?? 0;
        ctx.state.counters[key(effect)] = seen + 1;
        if (seen < effect.value) applyStatus(ctx, effect, event.unit);
      }
      return;
    case "FirstTargetSpawnAdditionalTome":
      if (event.kind === "unit-spawn" && matches(ctx, effect, event.unit)) {
        const seen = ctx.state.counters[key(effect)] ?? 0;
        if (seen >= effect.value) return;
        const usable = (packId: string) => {
          const pack = BPH_PACKS[packId];
          return (pack ? bphDrawPool(pack) : []).filter(entry => {
            const tome = BPH_TOMES[entry.id];
            return tome && entry.weight > 0 && !([4, 5].includes(tome.effectKind) &&
              aliveTomes(ctx).some(active => active.id === entry.id));
          });
        };
        let pool = usable(ctx.unitInfo(event.unit)?.packId ?? "");
        if (!pool.length) pool = usable("Pack_Tomes");
        const total = pool.reduce((weight, entry) => weight + entry.weight, 0);
        if (!total) return;
        let roll = ctx.random() * total;
        for (const entry of pool) {
          roll -= entry.weight;
          if (roll < 0) {
            if (startTome(ctx, entry.id, false)) ctx.state.counters[key(effect)] = seen + 1;
            break;
          }
        }
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
      if (event.kind === "unitKilled" && event.side === "enemy" && event.critical &&
        event.source && matches(ctx, effect, event.source)) {
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
    case "CursorCritKillCastSpellAtMonster":
    case "CursorDamagePerHeroDeath":
    case "CursorDamagePerPurchasedUpgrade":
    case "CursorDpsDamage":
    case "CursorDpsIntervalReduction":
    case "CursorDpsRadius":
    case "CursorDpsEveryNthDamageMult":
    case "CursorDpsEveryNthApplyStatus":
    case "CursorDpsEveryNthFreezeIntoIceCube":
    case "CursorDpsApplyStatusChance":
    case "ElectrifyChainDamagePercent":
    case "ElectrifyExtraChainJumps":
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
      return; // Read at the actual tap strike, book activation, or spell execution.
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
    case "TargetSpellBounce":
      // The Rider special uses the martial projectile's enemy-to-enemy bounce.
      if (effect.targets.targetHero === "Hero5_Rider" && effect.targets.targetSpell === "Spell_RiderPiercer") return;
      break;
  }
  if (event.kind === "run-start" && UNCONFIRMED[effect.type]) unconfirmed(ctx, effect.type, UNCONFIRMED[effect.type]);
}

const UNCONFIRMED: Readonly<Record<string, string>> = {
  ChapterFog: "전장 darkness/light-mask 렌더 경계 없음; 밝기 감소를 피해 감소로 대체하지 않음",
  ThunderboltApplyStatus: "Electrify 기본 피해와 체인 실행식 미확인",
  FogCursorTowerLightRadius: "원본 cursor0.8/tower1.1 반경은 확인; light-mask 렌더 경계 없음",
  FogSpectralsEmitLight: "혼령 개체와 light-mask 렌더 경계 없음",
  FogUnopenedPacksEmitLight: "원본 pack light 반경0.6은 확인; light-mask 렌더 경계 없음",
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
  "HeroMineAoeRadius",
  "HeroMineChainDamageBonus",
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
