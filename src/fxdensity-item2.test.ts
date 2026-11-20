import { expect, test } from "bun:test";
import type Phaser from "phaser";
import { CAP, emitContactParticles, ParticleCap } from "./fxdensity";
import { DecorationBudget, PALETTE } from "./presentation";
import type { Effect } from "./rules";

function contact(heavy = false, cssPixel = 1) {
  class Chip {
    rotation = 0;
    callbacks = new Map<string, () => void>();
    constructor(public x: number, public y: number, public width = 0, public height = 0, public color = 0) {}
    setRotation(value: number) { this.rotation = value; return this; }
    setDepth() { return this; }
    setScale() { return this; }
    setAlpha() { return this; }
    play() { return this; }
    once(event: string, callback: () => void) { this.callbacks.set(event, callback); return this; }
    destroy() { this.callbacks.get("destroy")?.(); this.callbacks.clear(); }
  }
  const chips: Chip[] = [], sprites: Chip[] = [];
  const tweens: { targets: Chip; x: number; y: number; duration: number; onComplete(): void }[] = [];
  const particles = new ParticleCap(), decoration = new DecorationBudget(), clock = { now: 0 };
  const scene = {
    time: clock,
    add: {
      rectangle(x: number, y: number, width: number, height: number, color: number) {
        const chip = new Chip(x, y, width, height, color); chips.push(chip); return chip;
      },
      sprite(x: number, y: number) { const sprite = new Chip(x, y); sprites.push(sprite); return sprite; },
    },
    tweens: { add(tween: typeof tweens[number]) { tweens.push(tween); }, killTweensOf() {} },
  } as unknown as Phaser.Scene;
  return { scene, particles, decoration, clock, chips, sprites, tweens, heavy, cssPixel, channels: { motion: true, flash: true } };
}

const hit: Effect = { kind: "hit", value: 10, x: 100, y: 100, fromX: 50, fromY: 100, target: 1 };

test("Lv1 critical chips retain grown critical geometry in CSS pixels across incoming headings", () => {
  for (const cssPixel of [1, 2]) for (const [fromX, fromY] of [[50, 100], [150, 100], [100, 50], [100, 150]]) {
    const early = contact(false, cssPixel), grown = contact(true, cssPixel);
    const effect = { ...hit, fromX, fromY, critical: true };
    expect(emitContactParticles(early, effect)).toBe(10);
    expect(emitContactParticles(grown, effect)).toBe(10);
    expect(early.chips.map(c => [c.width, c.height, c.rotation, c.color]))
      .toEqual(grown.chips.map(c => [c.width, c.height, c.rotation, c.color]));
    expect(early.tweens.map(t => [t.x, t.y, t.duration])).toEqual(grown.tweens.map(t => [t.x, t.y, t.duration]));
  }
});

test("ordinary skill chips stay modest at both growth states with their original six lifetimes", () => {
  for (const heavy of [false, true]) {
    const c = contact(heavy, 2);
    expect(emitContactParticles({ ...c, skillHit: true }, hit)).toBe(6);
    expect(c.tweens.map(t => t.duration)).toEqual([120, 140, 160, 180, 200, 220]);
    c.chips.forEach((chip, part) => {
      expect(chip.width).toBe(1 + part % 2);
      expect(chip.height).toBe(chip.width);
      expect(chip.rotation).toBe(0);
      expect(Math.hypot(c.tweens[part].x - chip.x, c.tweens[part].y - chip.y))
        .toBeCloseTo((40 + part * 10) * c.tweens[part].duration / 1000);
    });
  }
});

test("Lv1 critical chips preserve the shared adaptive cap and twelve admissions per second", () => {
  for (const slow of [false, true]) {
    const c = contact();
    if (slow) for (let i = 0; i < 300; i++) c.particles.sample(33);
    const cap = slow ? CAP.min : CAP.max;
    c.particles.live = cap - 3;
    expect(emitContactParticles(c, { ...hit, critical: true })).toBe(2);
    expect(c.sprites).toHaveLength(1);
    expect(c.particles.live).toBe(cap);
    expect(emitContactParticles(c, { ...hit, critical: true })).toBe(0);
  }
  const c = contact();
  for (let i = 0; i < 13; i++) {
    c.clock.now = i * 60;
    expect(emitContactParticles(c, { ...hit, critical: true })).toBe(i < 12 ? 10 : 0);
    c.tweens.splice(0).forEach(t => t.onComplete());
    c.sprites.at(-1)?.callbacks.get("animationcomplete")?.();
    expect(c.particles.live).toBe(0);
  }
  expect(c.chips).toHaveLength(120);
  c.clock.now = 1000;
  expect(emitContactParticles(c, { ...hit, critical: true })).toBe(10);
});

test("Lv1 critical geometry still respects flash and motion preferences", () => {
  const c = contact();
  c.channels.flash = false;
  expect(emitContactParticles(c, { ...hit, critical: true })).toBe(8);
  expect(c.chips.every(chip => chip.color === PALETTE.gold && chip.width > chip.height)).toBe(true);
  expect(c.tweens.map(t => t.duration)).toEqual(Array.from({ length: 8 }, (_, i) => 260 + (i + 2) * 160 / 9));
  const still = contact();
  still.channels.motion = false;
  expect(emitContactParticles(still, { ...hit, critical: true })).toBe(0);
  expect(still.chips).toHaveLength(0);
});
