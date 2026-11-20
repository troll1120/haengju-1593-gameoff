import { expect, test } from "bun:test";
import { ALLY_TEXTURES, allyAnimation, allyArt, allyAttackFrame, isTabletHit, THROW_ATTACK_ART } from "./ally-animation";
import { chaosArena, chaosEnemy, chaosTicks } from "./chaos-test-fixture";
import { MOTION } from "./motion";
import type { Effect, Shot } from "./rules";

const attacking = { moving: false, attacking: true, bow: true, hurt: false, down: false };
for (const [row, direction] of (["front", "back", "side"] as const).entries()) {
  test(`Song Sanghyeon's ${direction} throw waits for release and then recovers`, () => {
    const animation = allyAnimation("song_sanghyeon", { ...attacking, direction });
    expect(THROW_ATTACK_ART).toEqual(["song_sanghyeon"]);
    expect(animation.key).toBe(`ally-full-song_sanghyeon-${direction}-throw_attack`);
    for (const bow of [undefined, false, true])
      expect(allyAnimation("song_sanghyeon", { ...attacking, direction, bow }).key).toBe(animation.key);
    expect(animation.frames).toEqual(Array.from({ length: 4 }, (_, frame) => ({
      key: "ally-throw-song_sanghyeon", frame: row * 4 + frame,
    })));
    expect(animation.repeat).toBe(0);
    for (const [progress, index] of [[0, 0], [.49, 0], [.5, 1], [.999, 1], [1, 1]])
      expect(allyAttackFrame(animation, { windupProgress: progress, sinceReleaseMs: -1 })).toBe(animation.frames[index]);
    for (const [elapsed, index] of [[0, 2], [MOTION.lungeMs / 2 - .001, 2], [MOTION.lungeMs / 2, 3], [MOTION.lungeMs, 3]])
      expect(allyAttackFrame(animation, { windupProgress: -1, sinceReleaseMs: elapsed })).toBe(animation.frames[index]);
  });
}

test("the throw contact frame follows the real general shot event", () => {
  const run = chaosArena("송상현", 0), squad = run.squads[0];
  chaosEnemy(run, squad.x + 100, squad.y);
  squad.clock = 0;
  let prepared = false, released = false;
  for (let tick = 0; tick < 60 && !released; tick++) {
    const effects = chaosTicks(run, 1);
    prepared ||= effects.some(effect => effect.kind === "windup" && effect.squad === 0 && effect.index === -1);
    released = effects.some(effect => effect.kind === "shot" && effect.squad === 0 && effect.index === -1);
    if (!prepared) continue;
    const animation = allyAnimation("song_sanghyeon", { ...attacking, direction: "side", bow: squad.basicAttack === "arrow" });
    expect(animation.key).toBe("ally-full-song_sanghyeon-side-throw_attack");
    const phase = { windupProgress: 1, sinceReleaseMs: released ? 0 : -1 };
    expect(allyAttackFrame(animation, phase)).toBe(animation.frames[released ? 2 : 1]);
    if (released) {
      expect(squad.basicAttack).toBeUndefined();
      expect(run.shots.some(shot => shot.source === "general" && shot.by === squad.id)).toBe(true);
    }
  }
  expect(prepared).toBe(true);
  expect(released).toBe(true);
});

test("throw selection preserves every other allied body and nonattack pose", () => {
  for (const base of ALLY_TEXTURES) for (const direction of ["front", "back", "side"] as const) {
    const animation = allyAnimation(base, { ...attacking, direction });
    if (base !== "song_sanghyeon") expect(animation.key).not.toContain("throw_attack");
    const art = allyArt(base);
    for (const pose of ["idle", "walk", "hit", "death"] as const) {
      expect(allyAnimation(base, { ...attacking, direction, attacking: false,
        moving: pose === "walk", hurt: pose === "hit", down: pose === "death" }).key)
        .toBe(art.full ? `ally-full-${art.actor}-${pose === "idle" ? "front" : direction}-${pose}` : `ally-${base}-${pose}`);
    }
  }
  for (const [base, actor] of [["yi_sunsin", "yi_sunsin"], ["hero", "kwak_jaeu"]])
    expect(allyAnimation(base, { ...attacking, direction: "side" }).key).toBe(`ally-full-${actor}-side-bow_attack`);
  expect(allyAnimation("song_sanghyeon", { ...attacking, bow: false, direction: "side" }).key)
    .toBe("ally-full-song_sanghyeon-side-throw_attack");
});

test("the throw sheet and all source frames have the declared dimensions", async () => {
  const art = `${import.meta.dir}/../public/art`;
  const sheet = await Bun.file(`${art}/generals/song_sanghyeon_throw_attack.webp`).image().png().bytes();
  const header = new DataView(sheet.buffer, sheet.byteOffset, sheet.byteLength);
  expect([header.getUint32(16), header.getUint32(20)]).toEqual([224, 192]);
  for (const direction of ["front", "back", "side"]) for (let frame = 0; frame < 4; frame++) {
    const bytes = await Bun.file(`${art}/generals/song_sanghyeon/${direction}_throw_attack_${frame}.png`).bytes();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([56, 64]);
  }
});

test("the tablet contact sheet contains four horizontal 32-pixel frames", async () => {
  const bytes = await Bun.file(`${import.meta.dir}/../public/art/fx/tablet-hit.png`).bytes();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect([view.getUint32(16), view.getUint32(20)]).toEqual([128, 32]);
});

test("the approved four tablet flight frames are loaded and played by the renderer", async () => {
  const bytes = await Bun.file(`${import.meta.dir}/../public/art/fx/tablet-toss.png`).bytes();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect([view.getUint32(16), view.getUint32(20)]).toEqual([128, 32]);
  const main = await Bun.file(`${import.meta.dir}/main.ts`).text();
  expect(main).toContain('["tablet-toss", "fx/tablet-toss", 32, 32]');
  expect(main).toContain('strip("tablet-toss", "tablet-toss", 3, 14, -1)');
  expect(main).toContain('if (tablet) sprite.play("tablet-toss")');
});

test("tablet contact identification requires the exact projectile kind, source and owning general", () => {
  const squads = [{ id: 7, general: "송상현" }, { id: 3, general: "이순신" }] as const;
  const hit: Effect = { kind: "hit", x: 20, y: 30, value: 12, target: 99,
    projectile: { kind: "arrow", source: "general", by: 7 } };
  expect(isTabletHit(hit, squads)).toBe(true);
  for (const projectile of [
    undefined,
    { kind: "arrow", source: "archer", by: 7 },
    { kind: "arrow", by: 7 },
    { kind: "rocket", source: "general", by: 7 },
    { kind: "shell", source: "general", by: 7 },
    { kind: "bullet", source: "general", by: 7 },
    { kind: "arrow", source: "general", by: 3 },
    { kind: "arrow", source: "general", by: 0 },
    { kind: "arrow", source: "general", by: "weapon" },
    { kind: "arrow", source: "general", by: "skill" },
  ] satisfies Array<Effect["projectile"]>)
    expect(isTabletHit({ ...hit, projectile }, squads)).toBe(false);
  for (const kind of ["shot", "skill", "swing", "block", "kill"] as const)
    expect(isTabletHit({ ...hit, kind }, squads)).toBe(false);
});

test("every tablet bounce carries its own immutable projectile identity", () => {
  const run = chaosArena("송상현", 0), squad = run.squads[0];
  squad.skillClock = 1e9; squad.soldiers = [];
  const enemies = [40, 70, 100].map(dx => chaosEnemy(run, squad.x + dx, squad.y));
  const shot: Shot = { id: run.nextId++, kind: "arrow", source: "general", by: squad.id, unitIndex: -1,
    x: enemies[0].x, y: enemies[0].y, toX: enemies[0].x, toY: enemies[0].y,
    target: enemies[0].id, prey: null, speed: 340, damage: 17, critical: false,
    splash: 0, pierce: 0, from: 0, bounces: 2, bounceRange: 100, hitIds: [] };
  run.shots.push(shot);
  const contacts = chaosTicks(run, 60).filter(effect => isTabletHit(effect, run.squads));
  expect(contacts.map(effect => effect.target)).toEqual(enemies.map(enemy => enemy.id));
  expect(contacts.map(effect => effect.projectile)).toEqual(Array(3).fill({ kind: "arrow", source: "general", by: squad.id }));
  expect(contacts.every(effect => effect.value > 0)).toBe(true);
  expect(enemies.every(enemy => enemy.hp < enemy.maxHp)).toBe(true);
  expect(shot.bounces).toBe(0);
  expect(run.shots).not.toContain(shot);
  shot.source = "archer";
  expect(contacts.every(effect => isTabletHit(effect, run.squads))).toBe(true);
});

test("coincident soldier and other-general arrows never become tablet contacts", () => {
  for (const [general, source, expected] of [
    ["송상현", "archer", false], ["이순신", "general", false], ["송상현", "general", true],
  ] as const) {
    const run = chaosArena(general, 0), squad = run.squads[0];
    squad.skillClock = 1e9; squad.soldiers = [];
    const enemy = chaosEnemy(run, squad.x + 100, squad.y);
    run.shots.push({ id: run.nextId++, kind: "arrow", source, by: squad.id,
      x: enemy.x, y: enemy.y, toX: enemy.x, toY: enemy.y, target: enemy.id,
      prey: null, speed: 340, damage: 17, critical: false, splash: 0, pierce: 0, from: 0 });
    const contacts = chaosTicks(run, 1).filter(effect => effect.kind === "hit" && effect.projectile);
    expect(contacts).toHaveLength(1);
    expect(isTabletHit(contacts[0], run.squads)).toBe(expected);
  }
});

test("tablet contact playback runs once at 20 fps before optional decoration filtering", async () => {
  const main = await Bun.file(`${import.meta.dir}/main.ts`).text();
  expect(main).toContain('["tablet-hit", "fx/tablet-hit", 32, 32]');
  expect(main).toContain('strip("tablet-hit", "tablet-hit", 3, 20)');
  const start = main.indexOf('if (isTabletHit(effect, run.squads))');
  const end = main.indexOf('feedback.sparks += emitContactParticles', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const playback = main.slice(start, end);
  expect(playback).toContain('this.add.sprite(effect.x, effect.y - 6, "tablet-hit")');
  expect(playback).toContain('.play("tablet-hit")');
  expect(playback).toContain('contact.once("animationcomplete", () => contact.destroy())');
  expect(playback).not.toContain('this.once(');
  expect(start).toBeLessThan(main.indexOf('if (!this.decoration.effect(effect, this.time.now)) continue;'));
});
