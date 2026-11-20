import { expect, test } from "bun:test";
import type Phaser from "phaser";
import { hitVfx, skillVfx } from "./skill-vfx";
import { bphEffectCombat, choose, createRun, NO_META } from "./rules";
import type { Effect } from "./rules";
import { chaosArena, chaosEnemy } from "./chaos-test-fixture";
import { ImpactBudget } from "./impact";
import { POOL, SkillStage } from "./skill-stage";
import type { SkillShow } from "./skill-stage";
import { PALETTE } from "./presentation";
import { emitContactParticles, ParticleCap } from "./fxdensity";
import { DecorationBudget } from "./presentation";

test("a real awakening advances the look once, while the general's own level grows it monotonically", () => {
  const run = createRun(1593), squad = run.squads[0];
  const low = skillVfx(run, squad);
  expect(low.heavy).toBe(false);
  run.level = 10;
  const mid = skillVfx(run, squad);
  expect(mid.alpha).toBeGreaterThan(low.alpha);
  expect(mid.density).toBeGreaterThan(low.density);
  run.phase = "choice"; run.offers = ["awaken-권율"];
  choose(run, "awaken-권율");
  expect([squad.tier, squad.awakened]).toEqual([2, 1]);
  expect(skillVfx(run, squad).tier).toBe(mid.tier + 1);
  const awakenedStart = createRun(1593, "권율", { ...NO_META, generalAwaken: ["권율"] });
  expect(skillVfx(awakenedStart, awakenedStart.squads[0]).heavy).toBe(false);
  const before = JSON.stringify(run);
  for (let level = 1; level <= 20; level++) {
    const look = skillVfx({ ...run, level }, squad), next = skillVfx({ ...run, level: level + 1 }, squad);
    expect(next.alpha).toBeGreaterThanOrEqual(look.alpha);
    expect(next.density).toBeGreaterThanOrEqual(look.density);
    expect(next.density).toBeLessThanOrEqual(1);
  }
  expect(JSON.stringify(run)).toBe(before);
  const own = chaosArena("이순신", 1), ownLow = skillVfx(own, own.squads[0]);
  own.level = 20;
  expect(skillVfx(own, own.squads[0])).toEqual(ownLow);
});

test("damage records its commander id and a moved or unknown source cannot borrow another general's heavy look", () => {
  const run = chaosArena("이순신", 20), squad = run.squads[0], target = chaosEnemy(run, 220, 110);
  const effects: Effect[] = [];
  bphEffectCombat(run, effects).applyDamage({ source: squad, target, amount: 10, critical: true });
  const hit = effects.find(effect => effect.kind === "hit");
  expect(hit?.squad).toBe(squad.id);
  if (!hit) throw Error("Missing hit receipt");
  const look = hitVfx(run, hit);
  expect(look.heavy).toBe(true);
  squad.x += 30; squad.y += 20;
  expect(hitVfx(run, hit)).toEqual(look);
  expect(hitVfx(run, { squad: undefined }).heavy).toBe(false);
  expect(hitVfx(run, { squad: -1 }).heavy).toBe(false);
  const second = createRun(1593, "권율").squads[0];
  second.id = 1;
  run.squads.push(second);
  // Round10 gives a joining general the same combat level; promotion still belongs to its caster.
  expect(hitVfx(run, { squad: second.id }).heavy).toBe(true);
  run.chaos!.level = 1;
  squad.tier = 3; squad.awakened = 2;
  expect(hitVfx(run, { squad: squad.id }).heavy).toBe(true);
  expect(hitVfx(run, { squad: second.id }).heavy).toBe(false);
});

test("early noncritical skills keep the old small chips and cannot create the new contact light", () => {
  const chips: { w: number; h: number }[] = [];
  const chain = { x: 100, y: 100, setDepth() { return this; }, setRotation() { return this; }, once() { return this; } };
  const scene = { time: { now: 0 }, add: {
    rectangle(_x: number, _y: number, w: number, h: number) { chips.push({ w, h }); return chain; },
    sprite() { throw Error("Early contact must not allocate a bright sprite"); },
  }, tweens: { add() {} } } as unknown as Phaser.Scene;
  expect(emitContactParticles({ scene, particles: new ParticleCap(), decoration: new DecorationBudget(), cssPixel: 2,
    channels: { motion: true, flash: true }, skillHit: true, heavy: false },
  { kind: "hit", x: 100, y: 100, value: 10, critical: false })).toBe(6);
  expect(chips.every(c => c.w <= 2 && c.h <= 2)).toBe(true);
});

test("staged low-level skills thin decorations but retain the budgeted stop independently of camera motion", () => {
  const measure = (level: number, awakened: number) => {
    const run = createRun(1593), squad = run.squads[0];
    run.level = level; squad.tier = awakened + 1; squad.awakened = awakened;
    const before = JSON.stringify(run), counts = { rectangles: 0, sprites: 0, strength: -1, stop: 0, offset: 0, puffScales: [] as number[] };
    const impact = new ImpactBudget();
    const node = { alpha: 1, setDepth() { return this; }, setVisible() { return this; }, setPosition() { return this; },
      setSize() { return this; }, setAlpha(a: number) { this.alpha = a; return this; }, setFillStyle() { return this; },
      setScale(scale: number) { counts.puffScales.push(scale); return this; }, clear() { return this; }, play() { return this; }, setY() { return this; }, anims: { isPlaying: true } };
    const scene = { add: {
      rectangle() { counts.rectangles++; return { ...node }; }, graphics() { return { ...node }; },
      sprite() { counts.sprites++; return { ...node }; },
    } } as unknown as Phaser.Scene;
    const show: SkillShow = { general: squad.general, accent: PALETTE.gold, clear() {}, update() {},
      cast(stage) {
        stage.shake(.014, 90);
        for (let i = 0; i < 100; i++) stage.mote({ x: 0, y: 0 }, 0, 0, 0, 200, PALETTE.gold);
        for (let i = 0; i < 10; i++) stage.puff(0, 0, 0, .5);
      } };
    const stage = new SkillStage(scene, {} as never, [show]);
    stage.shaker = (strength, stop) => {
      counts.strength = strength;
      counts.stop = impact.request(0, stop >= 70, false, strength, 200).stop;
      counts.offset = impact.sample(10, false).x;
    };
    stage.cast(squad.general, { skill: { kind: "skill", x: 0, y: 0, value: 10 }, results: [], run, squad,
      from: squad, tier: 1, channels: { motion: true, flash: true }, density: 1 }, () => undefined);
    expect(JSON.stringify(run)).toBe(before);
    return counts;
  };
  const low = measure(1, 0), mid = measure(10, 0), high = measure(20, 2);
  expect([low.stop, mid.stop, high.stop]).toEqual([90, 90, 90]);
  expect([low.strength, mid.strength, low.offset, mid.offset]).toEqual([0, 0, 0, 0]);
  expect(high.strength).toBe(.012); expect(high.offset).toBeGreaterThan(0);
  expect(low.rectangles).toBeLessThan(mid.rectangles);
  expect(mid.rectangles).toBeLessThan(high.rectangles);
  expect(high.rectangles).toBe(101);
  expect(low.sprites).toBeLessThan(mid.sprites);
  expect(mid.sprites).toBeLessThan(high.sprites);
  for (const result of [low, mid, high]) {
    expect(result.puffScales.length).toBeGreaterThan(0);
    expect(result.puffScales.every(scale => scale === .5)).toBe(true);
  }
  expect(POOL).toEqual({ images: 224, sprites: 32, motes: 288, puffs: 12, shouts: 6 });
});
