import { expect, test } from "bun:test";
import { ALLY_TEXTURES, allyAnimation, allyArt, allyAttackFrame } from "./ally-animation";
import { ARMS, advance, cardPools, choose, createRun, drawCards, SOLDIERS, soldier } from "./rules";
import type { Effect, General, Run } from "./rules";
import { ARMY_KINDS, generalUnit, GENERALS } from "./roster";
import { BPH_GENERALS } from "./bph-commanders";
import { CENTER, fortRect, wallPosts } from "./geometry";
import { FRIENDLY_ATTACK, friendlyStrikeOffset, MOTION } from "./motion";

const attack = { moving: true, attacking: true, hurt: false, down: false, direction: "side" as const };
test("spear anticipation stays inside the last 100ms of an existing windup", () => {
  const offset = (progress: number) => friendlyStrikeOffset("spearman", { windupProgress: progress, windupMs: 400, sinceReleaseMs: -1 });
  expect(friendlyStrikeOffset("spearman", { windupProgress: -1, windupMs: 1, sinceReleaseMs: -1 })).toBe(0);
  expect(offset(0)).toBe(0);
  expect(offset(.75)).toBe(0);
  expect(offset(.875)).toBe(-2);
  expect(offset(1)).toBe(-4);
});
test("spear contact holds for 67ms and settles continuously over the following 133ms", () => {
  const phase = { windupProgress: -1, sinceReleaseMs: 0, contactMs: 67, recoveryMs: 133 };
  const animation = { key: "contact", frames: [0, 1, 2, 3].map(frame => ({ key: "spearman", frame })), frameRate: 12, repeat: 0 };
  expect(friendlyStrikeOffset("spearman", phase)).toBe(14);
  expect(friendlyStrikeOffset("spearman", { ...phase, sinceReleaseMs: 67 })).toBe(14);
  expect(friendlyStrikeOffset("spearman", { ...phase, sinceReleaseMs: 133.5 })).toBeCloseTo(3.5);
  expect(friendlyStrikeOffset("spearman", { ...phase, sinceReleaseMs: 200 })).toBe(0);
  expect(allyAttackFrame(animation, { ...phase, sinceReleaseMs: 66 }).frame).toBe(2);
  expect(allyAttackFrame(animation, { ...phase, sinceReleaseMs: 199 }).frame).toBe(3);
});
/** Generals whose personal full-body set is supplied; the folder is the set's original name. */
const FULL_BODIES = [["신립", "sin_rip"], ["송상현", "song_sanghyeon"], ["사명대사", "samyeong"], ["정발", "jeong_bal"], ["이여송", "li_rusong"],
  ["황진", "hwang_jin"], ["김시민", "kim_simin"], ["곽재우", "kwak_jaeu"], ["이순신", "yi_sunsin"], ["권율", "gwon_yul"], ["처영", "cheo_yeong"],
  ["조헌", "jo_heon"], ["정담", "jeong_dam"], ["영규", "yeonggyu"]] as const;
for (const [general, actor] of FULL_BODIES) for (const direction of ["front", "back", "side"] as const)
  for (const [pose, count] of [["idle", 4], ["walk", 4], ["attack", 4], ["hit", 3], ["death", 3]] as const)
    test(`${general} selects all supplied ${direction} ${pose} frames`, async () => {
      const base = generalUnit(general);
      const animation = allyAnimation(base, { direction, moving: pose === "walk", attacking: pose === "attack",
        hurt: pose === "hit", down: pose === "death" });
      const selected = actor === "song_sanghyeon" && pose === "attack" ? "throw_attack" : pose;
      expect(allyArt(base)).toEqual({ actor, full: true });
      expect(animation.key).toBe(`ally-full-${actor}-${pose === "idle" ? "front" : direction}-${selected}`);
      expect(animation.frames.map(frame => frame.key)).toEqual(
        Array(count).fill(`ally-${selected === "throw_attack" ? "throw" : "sheet"}-${actor}`));
      expect(animation.repeat).toBe(pose === "idle" || pose === "walk" ? -1 : 0);
      expect(animation.frameRate).toBe(pose === "hit" ? 20 : 8);
      for (let i = 0; i < count; i++) {
        const file = Bun.file(`${import.meta.dir}/../public/art/generals/${actor}/${direction}_${selected}_${i}.png`);
        const bytes = await file.bytes(), header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        expect([header.getUint32(16), header.getUint32(20)]).toEqual([56, 64]);
      }
    });
for (const base of ALLY_TEXTURES) test(`${base} holds preparation frames until the actual shot or swing`, () => {
  const animation = allyAnimation(base, attack), contact = allyArt(base).full ? 2 : 1;
  for (const windupProgress of [0, .5, .999, 1]) {
    const frame = allyAttackFrame(animation, { windupProgress, sinceReleaseMs: -1 });
    expect(animation.frames.indexOf(frame)).toBeLessThan(contact);
  }
  expect(allyAttackFrame(animation, { windupProgress: 1, sinceReleaseMs: 0 })).toEqual(animation.frames[contact]);
  expect(allyAttackFrame(animation, { windupProgress: -1, sinceReleaseMs: MOTION.lungeMs - 1 })).toEqual(animation.frames[animation.frames.length - 1]);
});
test("bows and artillery recoil on fire while spears, monks and cavalry follow through", () => {
  const release = { windupProgress: -1, sinceReleaseMs: 0 };
  expect(friendlyStrikeOffset("archer", release)).toBeLessThan(0);
  expect(friendlyStrikeOffset("hwacha", release)).toBeLessThan(friendlyStrikeOffset("archer", release));
  for (const kind of ["spearman", "monk", "ming_cavalry"] as const) expect(friendlyStrikeOffset(kind, release)).toBeGreaterThan(0);
  expect(FRIENDLY_ATTACK.archer.swing).toBe(0); expect(FRIENDLY_ATTACK.hwacha.swing).toBe(0);
  expect(FRIENDLY_ATTACK.monk.swing).toBeGreaterThan(FRIENDLY_ATTACK.spearman.swing);
});
function field(general: General = "권율"): Run {
  const run = createRun(42, general), at = { x: fortRect(run.fort).left - 50, y: CENTER.y };
  run.xp = -1e9; run.spawnBudget = -1e9; run.nextElite = run.nextBoss = run.nextWave = run.nextRiverWave = 1e9;
  run.commandClock = 1e9;
  const squad = run.squads[0];
  squad.x = squad.targetX = at.x; squad.y = squad.targetY = at.y; squad.clock = squad.skillClock = 1e9;
  squad.soldiers = [];
  const template = createRun(2).enemies[0];
  run.enemies = [{ ...template, id: 9000, x: at.x - 20, y: at.y, hp: 1e9, maxHp: 1e9, speed: 0, clock: 1e9, skillClock: 1e9 }];
  return run;
}
function observe(run: Run, spec: { base: string; by: (effect: Effect) => boolean; releaseKind: "shot" | "swing"; windup: number }): void {
  const { base, by, releaseKind, windup } = spec;
  let began: number | null = null, released: number | null = null;
  const animation = allyAnimation(base, attack), contact = allyArt(base).full ? 2 : 1;
  for (let i = 0; i < 60 && released === null; i++) {
    const effects = advance(run, .05);
    if (effects.some(effect => by(effect) && effect.kind === "windup")) began = run.time;
    if (effects.some(effect => by(effect) && effect.kind === releaseKind)) {
      released = run.time;
      expect(allyAttackFrame(animation, { windupProgress: 1, sinceReleaseMs: 0 })).toEqual(animation.frames[contact]);
    } else if (began !== null)
      expect(animation.frames.indexOf(allyAttackFrame(animation, { windupProgress: (run.time - began) / windup, sinceReleaseMs: -1 }))).toBeLessThan(contact);
  }
  expect(began).not.toBeNull(); expect(released).not.toBeNull();
  if (began === null || released === null) throw new Error("The real weapon never completed its windup and release");
  expect(released - began).toBeGreaterThanOrEqual(windup - .001);
  expect(released - began).toBeLessThanOrEqual(windup + .051);
}
for (const kind of SOLDIERS) test(`${kind} contact frame follows its real weapon event`, () => {
  const run = field(), squad = run.squads[0], unit = soldier(kind, 1, squad);
  if (kind === "archer" || kind === "hwacha") {
    const posts = wallPosts(run.fort);
    const index = posts.findIndex(post => post.x === Math.min(...posts.map(point => point.x)));
    unit.perch = index; unit.x = posts[index].x; unit.y = posts[index].y;
    run.enemies[0].x = unit.x - 40; run.enemies[0].y = unit.y;
  }
  squad.soldiers = [unit];
  observe(run, { base: kind, by: effect => effect.squad === 0 && effect.index === 0,
    releaseKind: kind === "archer" || kind === "hwacha" ? "shot" : "swing", windup: ARMS[kind].windup });
});
for (const general of new Set<General>([...GENERALS, ...BPH_GENERALS])) test(`${general} contact frame follows the general's actual swing`, () => {
  const run = field(general); run.squads[0].clock = 0;
  observe(run, { base: generalUnit(general), by: effect => effect.squad === 0 && effect.index === -1,
    releaseKind: "swing", windup: ARMS.general.windup });
});
test("a stale general lock beyond weapon reach cannot steal an adjacent enemy's automatic attack", () => {
  const run = field(), squad = run.squads[0], close = run.enemies[0];
  squad.clock = 0;
  const distant = { ...close, id: 9001, x: squad.x + ARMS.general.reach + 20 };
  run.enemies.push(distant); squad.aim = distant.id;
  const hp = close.hp, farHp = distant.hp;
  for (let i = 0; i < 7; i++) advance(run, .05);
  expect(close.hp).toBeLessThan(hp);
  expect(distant.hp).toBe(farHp);
  expect(squad.aim).toBe(close.id);
});
for (const kind of ["spearman", "monk", "ming_cavalry"] as const)
  test(`${kind} displaced into the courtyard walks out without an instantaneous wall projection`, () => {
    const run = field(), unit = soldier(kind, 1, CENTER);
    unit.emerging = false; unit.clock = 1e9; unit.hp = unit.maxHp = 1e9;
    run.squads[0].soldiers = [unit]; run.enemies = [];
    for (let tick = 0; tick < 160; tick++) {
      const before = { x: unit.x, y: unit.y };
      advance(run, .05);
      expect(Math.hypot(unit.x - before.x, unit.y - before.y)).toBeLessThanOrEqual(170 * .05 + 1e-7);
    }
    expect(unit.y).toBeGreaterThan(fortRect(run.fort).bottom);
  });
test("owned and unowned classes have equal target weight even when a class has two legend variants", () => {
  const run = createRun(731);
  run.level = 5; run.time = 300;
  const owned = ["spearman", "archer", "hwacha"] as const;
  run.squads[0].soldiers = owned.map(kind => soldier(kind));
  for (const kind of owned) run.drill[kind] = 2;
  const counts = new Map(ARMY_KINDS.map(kind => [kind, 0]));
  for (let draw = 0; draw < 6000; draw++) {
    const card = drawCards(run)[1], kind = ARMY_KINDS.find(kind => card.endsWith(`-${kind}`) || card.includes(`-${kind}-`));
    if (!kind) throw new Error(`The unit slot has no class: ${card}`);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (owned.some(member => member === kind)) expect(card.startsWith("upgrade-") || card.startsWith("legend-")).toBe(true);
    else expect(card.startsWith("recruit-")).toBe(true);
  }
  for (const count of counts.values()) expect(Math.abs(count - 1000)).toBeLessThan(120);
});
test("an owned class remains an upgrade at the first level and capped training becomes real reinforcement", () => {
  const run = createRun(19);
  expect(cardPools(run)[1]).toContain("upgrade-archer");
  run.drill.archer = 2; run.phase = "choice"; run.offers = ["upgrade-archer"];
  const before = run.squads.flatMap(squad => squad.soldiers).length;
  choose(run, "upgrade-archer");
  expect(run.drill.archer).toBe(2);
  expect(run.squads.flatMap(squad => squad.soldiers)).toHaveLength(before + 2);
});
test.each([1, 4, 5, 9, 10])("level %i owned rewards reinforce until the next star is unlocked", level => {
  for (const drill of [0, 1, 2]) {
    const run = createRun(87); run.level = level; run.drill.archer = drill;
    run.phase = "choice"; run.offers = ["upgrade-archer"];
    const count = run.squads[0].soldiers.length;
    choose(run, "upgrade-archer");
    const training = drill === 0 ? level >= 5 : drill === 1 ? level >= 10 : false;
    expect(run.drill.archer).toBe(drill + Number(training));
    expect(run.squads.flatMap(squad => squad.soldiers)).toHaveLength(count + (training ? 0 : 2));
  }
});
