import { expect, test } from "bun:test";
import type Phaser from "phaser";
import type { Effect } from "./rules";
import { createRun } from "./rules";
import { emitContactParticles, ParticleCap } from "./fxdensity";
import { DecorationBudget, LAYER } from "./presentation";
import { hitVfx } from "./skill-vfx";

function contact() {
  class Shape {
    scale = 1; depth = 0; animation: string | { key: string; frameRate: number } = "";
    callbacks = new Map<string, () => void>();
    constructor(public x: number, public y: number, public width = 0, public height = 0) {}
    setScale(value: number) { this.scale = value; return this; }
    setDepth(value: number) { this.depth = value; return this; }
    setAlpha() { return this; }
    setRotation() { return this; }
    play(value: string | { key: string; frameRate: number }) { this.animation = value; return this; }
    once(event: string, callback: () => void) { this.callbacks.set(event, callback); return this; }
    destroy() { this.callbacks.get("destroy")?.(); this.callbacks.clear(); }
  }
  const sprites: Shape[] = [], chips: Shape[] = [], textures: string[] = [];
  const tweens: { onComplete(): void }[] = [];
  const clock = { now: 0 }, particles = new ParticleCap(), decoration = new DecorationBudget();
  const scene = {
    time: clock,
    add: {
      sprite(x: number, y: number, texture: string) {
        const sprite = new Shape(x, y); sprites.push(sprite); textures.push(texture); return sprite;
      },
      rectangle(x: number, y: number, width: number, height: number) {
        const chip = new Shape(x, y, width, height); chips.push(chip); return chip;
      },
    },
    tweens: { add(tween: typeof tweens[number]) { tweens.push(tween); }, killTweensOf() {} },
  } as unknown as Phaser.Scene;
  return { scene, particles, decoration, clock, sprites, chips, textures, tweens,
    channels: { motion: true, flash: true }, heavy: false, cssPixel: 1 };
}
const hit: Effect = { kind: "hit", x: 100, y: 100, fromX: 50, fromY: 100, value: 10, critical: true };

test("Lv1 critical contacts reuse the bounded artwork with ten admitted chips", () => {
  const run = createRun(1593), effect = { ...hit, squad: run.squads[0].id };
  const before = JSON.stringify(run), heavy = hitVfx(run, effect).heavy;
  expect(run.level).toBe(1);
  expect(heavy).toBe(false);
  for (const skillHit of [false, true]) for (const cssPixel of [.5, 1, 2]) {
    const c = contact();
    expect(emitContactParticles({ ...c, heavy, skillHit, cssPixel }, effect)).toBe(10);
    expect(c.textures).toEqual(["melee"]);
    expect(c.sprites[0].animation).toEqual({ key: "melee", frameRate: 15 });
    expect(c.sprites[0].scale).toBe(Math.max(3, Math.round(2 * cssPixel)));
    expect(c.sprites[0].depth).toBeGreaterThan(900);
    expect(c.sprites[0].depth).toBeLessThan(LAYER.bars);
    expect(c.chips).toHaveLength(10);
    c.sprites[0].callbacks.get("animationcomplete")!();
    c.tweens.forEach(tween => tween.onComplete());
    expect(c.particles.live).toBe(0);
    for (let i = 0; i < 48; i++) expect(c.decoration.acquire("sprite")).toBe(true);
    expect(c.decoration.acquire("sprite")).toBe(false);
  }
  expect(JSON.stringify(run)).toBe(before);
});

test("noncritical skill contact still requires heavy growth and ordinary hits never gain it", () => {
  for (const heavy of [false, true]) for (const skillHit of [false, true]) {
    const c = contact();
    emitContactParticles({ ...c, heavy, skillHit }, { ...hit, critical: false });
    expect(c.sprites).toHaveLength(heavy && skillHit ? 1 : 0);
  }
});

test("Lv1 contact respects motion and flash switches and never lights death debris", () => {
  for (const channels of [{ motion: false, flash: true }, { motion: true, flash: false }]) {
    const c = contact();
    expect(emitContactParticles({ ...c, channels }, hit)).toBe(channels.motion ? 8 : 0);
    expect(c.sprites).toHaveLength(0);
  }
  const c = contact();
  expect(emitContactParticles(c, { ...hit, kind: "kill" })).toBe(4);
  expect(c.sprites).toHaveLength(0);
});

test("Lv1 contact preserves the shared live caps and twelve admissions per rolling second", () => {
  for (const slow of [false, true]) {
    const c = contact();
    if (slow) for (let i = 0; i < 300; i++) c.particles.sample(33);
    const cap = slow ? 48 : 60;
    c.particles.live = cap - 1;
    expect(emitContactParticles(c, hit)).toBe(0);
    expect(c.sprites).toHaveLength(1);
    expect(c.particles.live).toBe(cap);
    emitContactParticles(c, hit);
    expect(c.sprites).toHaveLength(1);
  }
  const full = contact();
  for (let i = 0; i < 48; i++) full.decoration.acquire("sprite");
  expect(emitContactParticles(full, hit)).toBe(10);
  expect(full.sprites).toHaveLength(0);
  const c = contact();
  for (let i = 0; i < 13; i++) {
    c.clock.now = i * 60;
    emitContactParticles(c, hit);
    c.sprites.at(-1)?.callbacks.get("animationcomplete")?.();
    c.tweens.splice(0).forEach(tween => tween.onComplete());
  }
  expect(c.sprites).toHaveLength(12);
  expect(c.chips).toHaveLength(120);
  expect(c.particles.live).toBe(0);
  c.clock.now = 1000;
  emitContactParticles(c, hit);
  expect(c.sprites).toHaveLength(13);
});
