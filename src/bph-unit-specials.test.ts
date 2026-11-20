import { expect, test } from "bun:test";
import { openBphPack } from "./bph";
import { bphStats, bphUnitInfo, hitBphPack } from "./bph-combat";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import type { BphEffect, BphFxEvent } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { bindBphConsumers, bphConsumers, bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { martialProjectileAttack } from "./bph-native-projectiles";
import { freshBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { activeBphEffects, BPH_UPGRADE_NODES } from "./bph-upgrades";
import { freshMeta } from "./meta";
import { advance, createRun } from "./rules";
import type { Enemy, Unit } from "./rules";

function battle(id = "", special?: number, random?: () => number, extraEffects: readonly BphEffect[] = []) {
  const meta = freshMeta();
  const save = meta.bph = freshBphSave(51);
  if (special !== undefined) save.unitUpgrades[id] = { special };
  const run = createBphRun(meta, { seed: 1593, general: "권율",
    upgrades: [...activeBphEffects(save), ...extraEffects] });
  const original = bphFxContext(run);
  if (!original) throw new Error("Expected a production BPH context");
  const ctx = random ? { ...original, random } : original;
  const events: BphFxEvent[] = [];
  bindBphConsumers(ctx, [...bphConsumers(), {
    id: "profiles", kinds: [], consume: () => {},
    onEvent: (_ctx, event) => { events.push(event); },
  }], false);
  const squad = run.squads[0];
  const units = () => squad.soldiers;
  const send = (event: BphFxEvent) => dispatchBphEffects(run, event);
  const step = (dt: number) => { run.time += dt; send({ kind: "step", dt }); };
  function spawn(profile: string, x = 100, y = 200, copies = 1) {
    const index = units().length;
    ctx.spawnProfile(profile, copies, { packId: "Pack1_Basic", position: { x, y }, resultId: 20 });
    const unit = units()[index];
    if (!unit) throw new Error(`Expected a spawned ${profile}`);
    unit.emerging = false;
    return unit;
  }
  function enemy(x = 125, y = 200, hp = 100) {
    const template = createRun(4).enemies[0];
    const target: Enemy = { ...template, id: run.nextId++, x, y, goalX: x, goalY: y,
      kind: "yari", hp, maxHp: hp, shielded: false, speed: 0, stun: 0 };
    run.enemies.push(target);
    return target;
  }
  function attack(unit: Unit, target = enemy()) {
    const attack = { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false };
    send({ kind: "before-attack", unit, target, attack });
    return attack;
  }
  function stats(unit: Unit) {
    const result = bphStats(unit, run);
    if (!result) throw new Error("Expected native unit stats");
    return result;
  }
  return { run, ctx, save, squad, units, spawn, enemy, send, step, attack, stats, events };
}

const tiers = [1, 3] as const;
const firstAndMax = <T,>(tier: number, first: T, max: T) => tier === 1 ? first : max;

test("Squire pierces nearby secondary enemies only below the tier chance", () => {
  const id = "Hero1_Squire";
  for (const tier of tiers) for (const succeeds of [true, false]) {
    const chance = firstAndMax(tier, .1, .3);
    const f = battle(id, tier, () => chance + (succeeds ? -1e-6 : 1e-6));
    const unit = f.spawn(id), primary = f.enemy(125);
    const secondary = f.enemy(165), otherSide = f.enemy(95), distant = f.enemy(166);
    f.send({ kind: "after-attack", unit, target: primary });
    const hp = 100 - (succeeds ? f.stats(unit).damage : 0);
    expect([primary.hp, secondary.hp, otherSide.hp, distant.hp]).toEqual([100, hp, hp, 100]);
  }
});

test("Barbarian momentum adds damage per other living militia in 80 px, capped at five", () => {
  const id = "Hero1_Barbarian";
  for (const tier of tiers) {
    const f = battle(id, tier), unit = f.spawn(id);
    const base = f.stats(unit).damage, bonus = firstAndMax(tier, .04, .08);
    f.spawn(id, 180);
    f.spawn(id, 181);
    f.spawn(id, 110).hp = 0;
    f.spawn("Hero2_Knight", 110);
    expect(f.stats(unit).damage).toBeCloseTo(base * (1 + bonus), 8);
    for (let i = 0; i < 5; i++) f.spawn(id, 115);
    expect(f.stats(unit).damage).toBeCloseTo(base * (1 + 5 * bonus), 8);
  }
});

test("Archer adds one or three arrows to the native attack", () => {
  const id = "Hero1_Archer";
  for (const tier of tiers) {
    const f = battle(id, tier), archer = f.spawn(id);
    expect(f.attack(archer).extraProjectiles).toBe(tier);
    expect(f.attack(f.spawn("Hero_Monkey")).extraProjectiles).toBe(0);
  }
});

test("Monk physically completes four or six dashes", () => {
  const id = "Hero2_Monk";
  for (const tier of tiers) {
    const f = battle(id, tier), unit = f.spawn(id);
    const target = f.enemy(100 + 1.2 * BPH_WORLD_TO_PX);
    f.attack(unit, target);
    for (let i = 0; i < 140; i++) f.step(.05);
    expect(f.events.filter(event => event.kind === "dash-end" && event.unit === unit)).toHaveLength(3 + tier);
    expect(target.hp).toBeLessThan(100);
  }
});

test("Monk passes over intervening enemies and damages only at the landing", () => {
  const f = battle(), unit = f.spawn("Hero2_Monk");
  const target = f.enemy(100 + 1.8 * BPH_WORLD_TO_PX), under = f.enemy((100 + target.x) / 2);
  f.attack(unit, target);
  f.step(.15);
  expect(unit.x).toBeGreaterThan(100);
  expect(f.ctx.state.actors.find(a => a.ownerId === unit.id)?.data.elevation).toBeGreaterThan(0);
  expect([target.hp, under.hp]).toEqual([100, 100]);
  expect(f.events.filter(event => event.kind === "dash-end")).toHaveLength(0);
  f.step(.4);
  expect(target.hp).toBeLessThan(100);
  expect(under.hp).toBe(100);
  expect(f.events.filter(event => event.kind === "dash-end")).toHaveLength(1);
});

test("Monk chains to fresh nearby targets in distance order and skips dead or distant targets", () => {
  const f = battle(), unit = f.spawn("Hero2_Monk");
  const world = BPH_WORLD_TO_PX;
  // Separate the living targets enough that their landing hits do not overlap.
  const first = f.enemy(100 + world), farther = f.enemy(100 + world * 3.4);
  const nearest = f.enemy(100 + world * 2.2), dead = f.enemy(100 + world * 1.5);
  dead.hp = 0;
  const distant = f.enemy(100 + world * 8);
  const path = [first.x, nearest.x, farther.x];
  f.attack(unit, first);
  for (let i = 0; i < 48; i++) f.step(.05);
  expect(f.events.flatMap(event => event.kind === "dash-end" && event.unit === unit ? [event.to.x] : []))
    .toEqual(path);
  for (const enemy of [first, nearest, farther]) expect(enemy.hp).toBeCloseTo(97.2);
  expect([dead.hp, distant.hp]).toEqual([0, 100]);
});

test("Monk lands between clustered enemies and hits both on impact", () => {
  const f = battle(), unit = f.spawn("Hero2_Monk");
  const target = f.enemy(100 + BPH_WORLD_TO_PX);
  const neighbor = f.enemy(100 + 1.7 * BPH_WORLD_TO_PX);
  const center = (target.x + neighbor.x) / 2;
  f.attack(unit, target);
  f.step(.15);
  expect([target.hp, neighbor.hp]).toEqual([100, 100]);
  f.step(.35);
  const landing = f.events.find(event => event.kind === "dash-end");
  expect(landing?.to.x).toBeCloseTo(center);
  for (const enemy of [target, neighbor]) expect(enemy.hp).toBeCloseTo(97.2);
});

test("Knight gains tier block chance and casts a stun on a full block", () => {
  const id = "Hero2_Knight";
  for (const tier of tiers) {
    const f = battle(id, tier), knight = f.spawn(id), enemy = f.enemy();
    const plain = battle();
    expect(f.stats(knight).blockChance - plain.stats(plain.spawn(id)).blockChance)
      .toBeCloseTo(firstAndMax(tier, .07, .21), 8);
    f.send({ kind: "damage-dealt", side: "ally", target: knight, source: enemy, attempted: 5, dealt: 0, blocked: 5,
      critical: false, overkill: 0 });
    f.step(.05);
    expect(enemy.stun).toBeGreaterThan(0);
  }
});

test("Pyromancer queues two or three source-attributed fireballs", () => {
  const id = "Hero2_Pyromancer";
  for (const tier of [1, 2]) {
    const f = battle(id, tier), mage = f.spawn(id);
    f.attack(mage);
    expect(f.ctx.state.spells.map(spell => [spell.id, spell.sourceId]))
      .toEqual(Array.from({ length: 1 + tier }, () => ["Spell_Fireball", mage.id]));
  }
});

test("Demon Slayer gains seven or twenty-one percentage points of crit chance", () => {
  const id = "Hero3_DemonSlayer";
  const plain = battle(), base = plain.stats(plain.spawn(id)).critChance;
  for (const tier of tiers) {
    const f = battle(id, tier);
    expect(f.stats(f.spawn(id)).critChance - base).toBeCloseTo(firstAndMax(tier, .07, .21), 8);
  }
});

test("Illusionist adds one or three copies to its actual Magic pack draw", () => {
  const id = "Hero3_Illusionist";
  for (const tier of tiers) {
    const save = freshBphSave(51);
    save.unitUpgrades[id] = { special: tier };
    save.discovered = ["Hero3_WitchDoctor", "Hero3_DemonSlayer", "Hero3_Portal"];
    save.packs.Pack3_Magic = { opened: 30, sinceNewHero: 11, sinceNewFoil: 0 };
    const result = openBphPack(save, { packId: "Pack3_Magic", effects: activeBphEffects(save) });
    expect(result.cards[0]).toMatchObject({ profileId: id, copies: 1 + tier });
  }
});

test("Portal summons its first ally at the tier-shortened cast interval", () => {
  const id = "Hero3_Portal", base = Number(BPH_PROFILES[id].raw.spellCastInterval);
  for (const tier of tiers) {
    const f = battle(id, tier, () => 0);
    f.save.discovered.push("Hero1_Squire");
    const portal = f.spawn(id);
    const children = () => f.units().filter(unit => bphUnitInfo(unit)?.parentId === portal.id);
    f.step(base / (1 + firstAndMax(tier, .25, .75)) - .001);
    expect(children()).toHaveLength(0);
    f.step(.002);
    expect(children()).toHaveLength(1);
  }
});

test("Witch Doctor's tier bonus increases resolved attack damage only against infected enemies", () => {
  const id = "Hero3_WitchDoctor";
  for (const tier of tiers) {
    const f = battle(id, tier), witch = f.spawn(id), infected = f.enemy(), plain = f.enemy();
    f.ctx.state.statuses.push({ targetId: infected.id, id: "Infected", power: 0, stacks: 1, until: 5 });
    const amount = (enemy: Enemy) => {
      const hit = { amount: 10, prevented: false, critical: false };
      f.send({ kind: "before-enemy-damage", enemy, source: witch, hit });
      return hit.amount;
    };
    expect(amount(infected)).toBeCloseTo(10 * (1 + firstAndMax(tier, .2, .6)), 8);
    expect(amount(plain)).toBe(10);
  }
});

test("Bannerman grants tier-scaled Charge buffs to distinct allies", () => {
  const id = "Hero4_Bannerman";
  for (const tier of tiers) {
    const f = battle(id, tier, () => 0);
    for (let i = 0; i < 5; i++) f.spawn("Hero1_Squire");
    f.attack(f.spawn(id));
    const charges = f.ctx.state.statuses.filter(status => status.id === "Charge");
    expect(charges).toHaveLength(1 + tier);
    expect(new Set(charges.map(status => status.targetId)).size).toBe(1 + tier);
  }
});

test("Duelist earns one bonus coin only below the tier kill chance", () => {
  const id = "Hero4_Duelist";
  for (const tier of tiers) for (const succeeds of [true, false]) {
    const chance = Number(BPH_PROFILES[id].raw.gainCoinOnKillChance) + firstAndMax(tier, .1, .3);
    const f = battle(id, tier, () => chance + (succeeds ? -1e-6 : 1e-6));
    const unit = f.spawn(id), coins = f.save.coins;
    f.send({ kind: "enemy-killed", enemy: f.enemy(125, 200, 0), killer: unit });
    expect(f.save.coins - coins).toBe(succeeds ? 1 : 0);
  }
});

test("Stormcaller keeps a live tornado for 4.8 or 6.4 seconds", () => {
  const id = "Hero4_Stormcaller";
  for (const tier of tiers) {
    const f = battle(id, tier, () => .99);
    f.attack(f.spawn(id));
    f.step(.05);
    const tornado = f.ctx.state.actors.find(actor => actor.cast?.spellId === "Spell_Tornado");
    if (!tornado) throw new Error("Expected the native tornado actor");
    expect(tornado.until - tornado.startedAt).toBeCloseTo(firstAndMax(tier, 4.8, 6.4), 8);
  }
});

test("Treant seed reaches one or three extra allies with real Fortify applications", () => {
  const id = "Hero5_Treant";
  for (const tier of tiers) {
    const f = battle(id, tier, () => 0);
    f.squad.x = f.squad.y = -1000;
    const allies = [125, 150, 175, 200, 225].map(x => f.spawn("Hero1_Squire", x));
    const unit = f.spawn(id);
    f.send({ kind: "after-attack", unit, target: f.enemy() });
    for (let i = 0; i < 24; i++) f.step(.05);
    expect(f.ctx.state.statuses.filter(status => status.id === "Fortify").map(status => status.targetId))
      .toEqual(allies.slice(0, 1 + tier).map(unit => unit.id));
  }
});

test("Dino repeats a physical dash only below its tier chance", () => {
  const id = "Hero5_Dino";
  for (const tier of tiers) for (const succeeds of [true, false]) {
    const chance = firstAndMax(tier, .25, .75);
    let roll = chance + (succeeds ? -1e-6 : 1e-6);
    const f = battle(id, tier, () => { const result = roll; roll = .99; return result; });
    const dino = f.spawn(id), target = f.enemy(100 + .8 * BPH_WORLD_TO_PX);
    f.attack(dino, target);
    for (let i = 0; i < 30; i++) f.step(.05);
    expect(f.events.filter(event => event.kind === "dash-end" && event.unit === dino)).toHaveLength(succeeds ? 2 : 1);
  }
});

test("Rider's native javelin changes course and hits one or three off-axis enemies", () => {
  const id = "Hero5_Rider";
  for (const tier of tiers) {
    const f = battle(id, tier), rider = f.spawn(id);
    const target = f.enemy(140), offAxis = [f.enemy(140, 245), f.enemy(190, 245), f.enemy(190, 295)];
    const attack = f.attack(rider, target);
    martialProjectileAttack(f.ctx, { unit: rider, target, amount: 10, critical: false,
      extraProjectiles: attack.extraProjectiles, bounces: attack.bounces });
    const javelin = f.ctx.state.actors.find(actor => actor.cast?.spellId === "Spell_RiderPiercer");
    expect(javelin?.data.riderBounces).toBe(tier);
    for (let i = 0; i < 40; i++) f.step(.025);
    expect(target.hp).toBe(90);
    expect(offAxis.map(enemy => enemy.hp)).toEqual(tier === 1 ? [95, 100, 100] : [95, 97.5, 98.75]);
  }
});

test("Beastmaster retains its replacement slots and adds tier Rats per parent", () => {
  const id = "Hero5_Beastmaster";
  const replacement = BPH_UPGRADE_NODES.SN_BeastmasterAddBear.effects;
  const profiles = (f: ReturnType<typeof battle>, parent: Unit) =>
    f.units().filter(unit => bphUnitInfo(unit)?.parentId === parent.id).map(unit => bphUnitInfo(unit)?.profileId);
  const plain = battle(id, 0, undefined, replacement), base = profiles(plain, plain.spawn(id));
  expect(base).toContain("Hero_Bear");
  for (const tier of tiers) {
    const f = battle(id, tier, undefined, replacement);
    f.spawn(id, 100, 200, 2);
    const parents = f.units().filter(unit => bphUnitInfo(unit)?.profileId === id);
    expect(parents.map(parent => profiles(f, parent))).toEqual(
      Array.from({ length: 2 }, () => [...base, ...Array<string>(tier).fill("Hero_Rat")]));
  }
});

test("Shotgun launches its normal fan plus one or three native projectiles", () => {
  const id = "Hero6_Shotgun";
  for (const tier of tiers) {
    const f = battle(id, tier), unit = f.spawn(id), target = f.enemy();
    const attack = f.attack(unit, target);
    martialProjectileAttack(f.ctx, { unit, target, amount: 10, critical: false,
      extraProjectiles: attack.extraProjectiles, bounces: attack.bounces });
    expect(f.ctx.state.actors.filter(actor => actor.ownerId === unit.id))
      .toHaveLength(Number(BPH_PROFILES[id].raw.shotgunArrowCount) + tier);
  }
});

test("Blood Mage heals by its tier bonus on actual HP damage, excluding overkill", () => {
  const id = "Hero6_BloodMage";
  const healed = (tier: number) => {
    const f = battle(id, tier), mage = f.spawn(id);
    mage.hp = 1;
    f.ctx.applyDamage({ source: mage, target: f.enemy(125, 200, 3), amount: 10 });
    return mage.hp - 1;
  };
  const base = healed(0);
  for (const tier of tiers) expect(healed(tier) - base).toBeCloseTo(3 * firstAndMax(tier, .2, .6), 8);
});

test("Skelewheel remains in physical wheel mode for four or six seconds", () => {
  const id = "Hero6_Skelewheel";
  for (const tier of tiers) {
    const f = battle(id, tier, () => .5), unit = f.spawn(id);
    f.attack(unit);
    const wheels = () => f.ctx.state.actors.filter(actor => actor.kind === "wheel");
    for (let i = 0; i < (3 + tier) * 20 - 1; i++) f.step(.05);
    expect(wheels()).toHaveLength(1);
    f.step(.1);
    expect(wheels()).toHaveLength(0);
  }
});

test("Warlord reflects tier damage from a real hit and spawns with the spiked body", () => {
  const id = "Hero7_Warlord";
  for (const tier of tiers) {
    const f = battle(id, tier), unit = f.spawn(id), enemy = f.enemy();
    const before = unit.hp;
    f.ctx.applyUnitDamage({ source: enemy, target: unit, amount: 10 });
    expect(unit.hp).toBeLessThan(before);
    expect(enemy.hp).toBeCloseTo(100 - (before - unit.hp) * firstAndMax(tier, .2, .6), 8);
    expect(f.ctx.profileId(unit)).toBe("Hero7_Warlord_Spiked");
  }
});

test("Astral Fisher pulls the hooked enemy faster at each tier", () => {
  const id = "Hero7_AstralFisher";
  const travel = (tier: number) => {
    const f = battle(id, tier), unit = f.spawn(id), target = f.enemy(100 + 2 * BPH_WORLD_TO_PX);
    const start = target.x;
    f.attack(unit, target);
    for (let i = 0; i < 100 && !f.events.some(event => event.kind === "hook-pull" && event.phase === "start"); i++)
      f.step(.01);
    expect(f.events.some(event => event.kind === "hook-pull" && event.phase === "start")).toBe(true);
    const before = target.x;
    for (let i = 0; i < 10; i++) f.step(.01);
    expect(target.x).toBeLessThan(start);
    return before - target.x;
  };
  const base = travel(0);
  expect(base).toBeGreaterThan(0);
  for (const tier of tiers) expect(travel(tier) / base).toBeCloseTo(1 + firstAndMax(tier, .25, .75), 5);
});

test("Icebourne creates two or four orbiting blades that hit on contact", () => {
  const id = "Hero7_Icebourne";
  for (const tier of tiers) {
    const f = battle(id, tier), unit = f.spawn(id);
    const orbit = .6000000238418579 * BPH_WORLD_TO_PX, angle = Math.PI / 10;
    const enemy = f.enemy(unit.x + Math.cos(angle) * orbit, unit.y + Math.sin(angle) * orbit);
    f.attack(unit, enemy);
    f.step(.1);
    expect(f.ctx.state.actors.filter(actor => actor.kind === "blade")).toHaveLength(1 + tier);
    expect(enemy.hp).toBeLessThan(100);
  }
});

test("Bear spawns as a giant only below the tier chance", () => {
  const id = "Hero_Bear";
  for (const tier of tiers) for (const succeeds of [true, false]) {
    const chance = firstAndMax(tier, .25, .75), f = battle(id, tier, () => chance + (succeeds ? -1e-6 : 1e-6));
    expect(bphUnitInfo(f.spawn(id))?.giant).toBe(succeeds);
  }
});

test("Jaguar heals a quarter of max HP only below the tier kill chance", () => {
  const id = "Hero_Jaguar";
  for (const tier of tiers) for (const succeeds of [true, false]) {
    const chance = firstAndMax(tier, .25, .75), f = battle(id, tier, () => chance + (succeeds ? -1e-6 : 1e-6));
    const unit = f.spawn(id);
    unit.hp = unit.maxHp / 2;
    f.send({ kind: "enemy-killed", enemy: f.enemy(125, 200, 0), killer: unit });
    expect(unit.hp).toBeCloseTo(unit.maxHp * (succeeds ? .75 : .5), 8);
  }
});

test("Monkey adds one or three native arrow bounces", () => {
  const id = "Hero_Monkey";
  for (const tier of tiers) {
    const f = battle(id, tier);
    expect(f.attack(f.spawn(id)).bounces).toBe(tier);
    expect(f.attack(f.spawn("Hero1_Archer")).bounces).toBe(0);
  }
});

test("Rat gains ten or thirty percentage points of block chance", () => {
  const id = "Hero_Rat", plain = battle(), base = plain.stats(plain.spawn(id)).blockChance;
  for (const tier of tiers) {
    const f = battle(id, tier);
    expect(f.stats(f.spawn(id)).blockChance - base).toBeCloseTo(firstAndMax(tier, .1, .3), 8);
  }
});

test("Skeleton explodes from either form only below its tier death chance", () => {
  for (const tier of tiers) for (const profile of ["Hero_Skeleton", "Hero_SkeletonUpgraded"]) {
    for (const succeeds of [true, false]) {
      const chance = firstAndMax(tier, .25, .75);
      const f = battle("Hero_Skeleton", tier, () => chance + (succeeds ? -1e-6 : 1e-6));
      const unit = f.spawn(profile), near = f.enemy(101), alsoNear = f.enemy(102), far = f.enemy(600);
      f.ctx.applyUnitDamage({ source: near, target: unit, amount: 10_000 });
      f.step(.05);
      expect(unit.hp).toBeLessThanOrEqual(0);
      expect([near.hp < 100, alsoNear.hp < 100, far.hp < 100]).toEqual([succeeds, succeeds, false]);
    }
  }
});

test("Explicit zero special tiers reproduce the omitted-tier seeded battle", () => {
  function replay(explicitZero: boolean) {
    const meta = freshMeta(), save = meta.bph = freshBphSave(51);
    const ids = ["Hero1_Squire", "Hero1_Barbarian", "Hero1_Archer", "Hero5_Rider", "Hero5_Beastmaster",
      "Hero3_Portal", "Hero7_Icebourne", "Hero_Bear", "Hero_Jaguar", "Hero_Rat", "Hero_Skeleton"];
    if (explicitZero) for (const id of Object.keys(BPH_PROFILES)) save.unitUpgrades[id] = { special: 0 };
    const run = createBphRun(meta, { seed: 1593, general: "권율", upgrades: activeBphEffects(save) });
    const ctx = bphFxContext(run);
    if (!ctx || !run.bph) throw new Error("Expected a production BPH run");
    for (const id of ids) ctx.spawnProfile(id, 1, { packId: "Pack1_Basic", position: { x: 260, y: 280 } });
    const first = run.bph.packs[0];
    if (first) for (let i = first.hp; i > 0; i--) hitBphPack(run, first.id);
    const frames = [];
    for (let i = 0; i < 120; i++) {
      advance(run, .05);
      if (i % 10 === 9) frames.push(structuredClone({
        rng: run.rng, nextId: run.nextId, squads: run.squads, enemies: run.enemies,
        shots: run.shots, fx: run.bph.fx, metrics: run.metrics, gold: run.gold, receipts: run.bph.receipts,
      }));
    }
    expect(run.squads[0].soldiers.length).toBeGreaterThan(ids.length);
    return frames;
  }
  expect(replay(true)).toEqual(replay(false));
});
