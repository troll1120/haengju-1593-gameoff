import { freshMeta } from "./meta";
import { freshBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { activeBphEffects } from "./bph-upgrades";
import { BPH_GENERALS } from "./bph-commanders";
import { BPH_PROFILES, BPH_PACKS } from "./bph-data";
import { addBphProfile, bphArms, bphStats } from "./bph-combat";
import { bphEnemyMapping } from "./bph-waves";
import { bphEnemyStats } from "./bph-enemy-effects";
import { bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { advance, bphEffectCombat, ARMS, STRIKE_ARMS, GENERAL_STRIKE, useSkill, type Run, type Unit, type Enemy } from "./rules";
import { generalReach } from "./general-reach";
import { setSurvivalFixtureLevel } from "./chaos-test-fixture";
import { bphUnlockedPacks } from "./bph-shop";
import { riverLane } from "./river";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";

export const positions = ["23:15", "27:16", "19:14", "18:14", "27:14", "27:17", "27:13", "19:13",
  "27:12", "28:16", "28:17", "28:14", "29:14", "30:16", "18:13", "17:14",
  "16:14", "30:17", "28:12", "29:12", "16:13", "19:16"];
export const conditions = { seed: 1, dt: .05, dpsSeconds: 60, deathCapSeconds: 600,
  target: "Monster1_Caveling", groupSize: 8, separationPx: 2, armorProbeHits: 4096, armorProbeAmount: .001 };
type General = typeof BPH_GENERALS[number];
export type Subject = { kind: "general"; id: General } | { kind: "soldier"; id: string };
export type Account = "typical22" | "raw";
type Fixture = { run: Run; unit: Unit; subject: Subject; level: number; ordinaryOnly: boolean };

export function createFixture(subject: Subject, level: number, account: Account, generalRank = 0, ordinaryOnly = false): Fixture {
  const meta = freshMeta(), save = freshBphSave(conditions.seed);
  save.purchasedPlacements = account === "typical22" ? positions.map(p => `_SkillTreeMain_Demo:${p}`) : [];
  if (subject.kind === "general" && generalRank > 0) save.generalUpgrades = { [subject.id]: { health: generalRank, attack: generalRank } };
  meta.bph = save;
  const general = subject.kind === "general" ? subject.id : BPH_GENERALS[0];
  const run = createBphRun(meta, { seed: conditions.seed, general, upgrades: activeBphEffects(save), startBattle: false });
  // The free cap stays at Lv10 throughout a full 60-second sample. An
  // accelerated Lv10 interval is shorter than the sample and would mix levels.
  if (level === 10) run.time = BPH_SURVIVAL_TABLE.duration;
  else setSurvivalFixtureLevel(run, level);
  const squad = run.squads[0];
  squad.safeUntil = 0; squad.state = "guard"; squad.skillClock = 3;
  run.bph!.survival!.cursor = Number.MAX_SAFE_INTEGER;
  run.bph!.survival!.nextDeparture = Infinity;
  run.bph!.supplyAt = Infinity;
  run.commandClock = run.arrowClock = run.hwachaClock = Infinity;
  run.enemies = []; run.shots = [];
  // Free Lv10 starts at the deadline. A standing final commander keeps this
  // non-endless battle running while the probe fights its isolated target.
  if (run.time >= BPH_SURVIVAL_TABLE.duration)
    run.metrics.bosses.push({ art: null, final: true, appeared: BPH_SURVIVAL_TABLE.duration,
      fallen: null, phase2: null, dealt: 0 });
  // Lv1 HP comes from createBphRun; later HP must come from production tend().
  if (level > 1) advance(run, conditions.dt);
  let unit: Unit = squad;
  if (subject.kind === "soldier") {
    addBphProfile(run, { profileId: subject.id, copies: 1, foil: false, discovered: false },
      { packId: "Pack1_Basic", cause: "pack", position: { x: 185, y: 120 } });
    unit = squad.soldiers.find(u => u.bph?.profileId === subject.id)!;
    if (!unit) throw new Error(`Missing spawned ${subject.id}`);
    // Keep intrinsic companions: they are part of the profile's native ability.
    squad.hp = 0; squad.state = "down"; squad.downUntil = Infinity;
    squad.clock = squad.skillClock = Infinity;
  }
  unit.emerging = false;
  return { run, unit, subject, level, ordinaryOnly };
}

export function standardEnemy(run: Run): Enemy {
  const profileId = conditions.target, data = bphEnemyStats(bphFxContext(run)!, { profileId });
  const enemy: Enemy = { ...bphEnemyMapping(profileId), id: run.nextId++, bphProfileId: profileId,
    direction: "위", x: 185, y: 100, hp: 1e12, maxHp: 1e12, speed: 0, elite: false, boss: false,
    goalX: 185, goalY: 100, clock: 0, strikeAt: 0, prey: null,
    stun: 0, burn: 0, burnClock: 0, skillClock: Infinity, casting: 0, casts: 0, appearedAt: 0 };
  run.enemies.push(enemy);
  run.bph!.survival!.damage[enemy.id] = { unit: 1, castle: 0 };
  dispatchBphEffects(run, { kind: "enemy-spawn", enemy });
  enemy.hp = enemy.maxHp = 1e12;
  if (!(data.damage > 0)) throw new Error(`Invalid ordinary enemy ${profileId}`);
  return enemy;
}

function pin(f: Fixture) {
  const { run, unit } = f, squad = run.squads[0];
  const x = unit.kind === "panokseon" ? 129 : 185;
  const y = unit.kind === "panokseon" ? riverLane() : 120;
  squad.x = squad.targetX = squad.homeX = 185;
  squad.y = squad.targetY = squad.homeY = f.subject.kind === "general" ? 120 : 700;
  squad.safeUntil = 0; squad.perch = undefined;
  unit.x = x; unit.y = y; unit.emerging = false;
  for (const [i, enemy] of run.enemies.entries()) {
    enemy.x = enemy.goalX = x + (i % 3 - 1) * .2;
    enemy.y = enemy.goalY = y - conditions.separationPx - Math.floor(i / 3) * .2;
    enemy.hp = enemy.maxHp = 1e12;
  }
}
export function stepFixture(f: Fixture) {
  const { run } = f;
  run.bph!.survival!.projection = { after: run.time, through: run.time + conditions.dt, tick: run.time + conditions.dt };
  const effects = advance(run, conditions.dt);
  if (f.ordinaryOnly) run.enemies = run.enemies.filter(enemy => !enemy.elite && !enemy.miniboss && !enemy.boss);
  return effects;
}

export function effectiveHp(subject: Subject, level: number, account: Account, generalRank = 0, ordinaryOnly = false) {
  const f = createFixture(subject, level, account, generalRank, ordinaryOnly), enemy = standardEnemy(f.run);
  pin(f);
  const combat = bphEffectCombat(f.run, []);
  let lost = 0;
  for (let i = 0; i < conditions.armorProbeHits; i++) {
    f.unit.hp = f.unit.maxHp;
    combat.applyUnitDamage({ target: f.unit, source: enemy, amount: conditions.armorProbeAmount });
    lost += f.unit.maxHp - f.unit.hp;
  }
  const raw = conditions.armorProbeHits * conditions.armorProbeAmount;
  return { hp: f.unit.maxHp, effectiveHp: lost > 0 ? f.unit.maxHp * raw / lost : null,
    incomingMultiplier: lost / raw, probeRawDamage: raw, probeHpLost: lost,
    stats: bphStats(f.unit, f.run), accountEffects: f.run.bph!.upgrades };
}

export function measureDps(subject: Subject, level: number, account: Account, manual: boolean, generalRank = 0, ordinaryOnly = false) {
  const f = createFixture(subject, level, account, generalRank, ordinaryOnly), enemy = standardEnemy(f.run);
  const start = f.run.time;
  let damage = 0, firstHit: number | null = null;
  for (let i = 0; i < conditions.dpsSeconds / conditions.dt; i++) {
    pin(f);
    enemy.clock = enemy.skillClock = Infinity; enemy.strikeAt = 0;
    const before = enemy.hp;
    if (manual && subject.kind === "general") useSkill(f.run, 0);
    stepFixture(f);
    const dealt = before - enemy.hp;
    damage += dealt;
    if (dealt > 0 && firstHit === null) firstHit = f.run.time - start;
  }
  if (Math.abs(f.run.time - start - conditions.dpsSeconds) > 1e-6)
    throw new Error(`${subject.id} Lv${level}: DPS probe advanced only ${f.run.time - start}s`);
  if (f.run.chaos?.level !== level)
    throw new Error(`${subject.id} Lv${level}: DPS probe finished at Lv${f.run.chaos?.level}`);
  return { damage, dps: damage / conditions.dpsSeconds, firstHit };
}

export function timeToDie(subject: Subject, level: number, account: Account) {
  const f = createFixture(subject, level, account);
  const start = f.run.time;
  for (let i = 0; i < conditions.groupSize; i++) standardEnemy(f.run);
  let firstHit: number | null = null;
  while (f.run.time - start < conditions.deathCapSeconds && f.unit.hp > 0) {
    pin(f);
    // Fixed incoming group: suppress subject attacks, but preserve defensive
    // native effects, armor, dodge, healing and enemy attack cadence.
    f.unit.clock = Infinity; f.unit.strikeAt = 0;
    f.run.squads[0].skillClock = Infinity;
    const before = f.unit.hp;
    stepFixture(f);
    if (f.unit.hp < before && firstHit === null) firstHit = f.run.time - start;
  }
  return { seconds: f.run.time - start, censored: f.unit.hp > 0, hpRemaining: f.unit.hp, firstHit };
}

export function reach(subject: Subject, level: number, account: Account) {
  const f = createFixture(subject, level, account);
  if (subject.kind === "soldier") return { basicPx: bphArms(f.unit, f.run)!.reach, extension: null };
  const extension = generalReach(subject.id, level)!;
  const arms = subject.id === "권율" ? ARMS.hwacha
    : ["곽재우", "송상현", "이순신"].includes(subject.id) ? ARMS.archer
    : GENERAL_STRIKE[subject.id] ? STRIKE_ARMS[GENERAL_STRIKE[subject.id]!] : ARMS.general;
  return { basicPx: ["권율", "곽재우"].includes(subject.id) ? extension.length : arms.reach, extension };
}

export function recruitmentAvailability(account: Account) {
  const f = createFixture({ kind: "general", id: BPH_GENERALS[0] }, 1, account);
  const save = f.run.bph!.save;
  const unlockedPacks = [...bphUnlockedPacks(save, f.run.bph!.upgrades)];
  const shopPacks = unlockedPacks.filter(id => BPH_PACKS[id] && BPH_PACKS[id].price <= save.income)
    .sort((a, b) => BPH_PACKS[b].price - BPH_PACKS[a].price).slice(0, 3);
  return { income: save.income, unlockedPacks, shopPacks, profiles: Object.keys(BPH_PROFILES).map(id => {
    const packs = Object.values(BPH_PACKS).filter(p => p.pool.some(entry => entry.id === id)).map(p => p.id);
    return { id, packs, recruitableInAllPacks: packs.length > 0,
      unlocked: packs.some(p => unlockedPacks.includes(p)), shopEligible: packs.some(p => shopPacks.includes(p)) };
  }) };
}
