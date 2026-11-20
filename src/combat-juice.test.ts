import { expect, test } from "bun:test";
import type Phaser from "phaser";
import { emitContactParticles, ParticleCap } from "./fxdensity";
import { DecorationBudget, LAYER } from "./presentation";
import { ImpactBudget } from "./impact";
import { DamageNumbers, damageNumberStyle, holdHit, playEnemyDeath } from "./hit-feedback";
import { damageNumberShown, damageNumbersMode, setDamageNumbersOn } from "./display-scale";
import { skillButtonCast } from "./skill-button";
import { useSkill } from "./rules";
import type { Effect } from "./rules";
import { chaosArena, chaosEnemy } from "./chaos-test-fixture";
import { ENEMY_ANIMATIONS, enemyAnimation } from "./enemy-animation";
import type { EnemyArt } from "./enemy-animation";

function contacts() {
  const sprites: Shape[] = [], chips: Shape[] = [], tweens: { duration: number; x: number; y: number; targets: Shape; onComplete(): void }[] = [];
  class Shape {
    depth = 0; scale = 1; rotation = 0; texture = ""; animation: string | { key: string; frameRate: number } = ""; alpha = 1;
    callbacks = new Map<string, () => void>();
    constructor(public x: number, public y: number, public width = 0, public height = 0) {}
    setDepth(value: number) { this.depth = value; return this; }
    setScale(value: number) { this.scale = value; return this; }
    setAlpha(value: number) { this.alpha = value; return this; }
    setRotation(value: number) { this.rotation = value; return this; }
    play(value: string | { key: string; frameRate: number }) { this.animation = value; return this; }
    once(event: string, callback: () => void) { this.callbacks.set(event, callback); return this; }
    destroy() { this.callbacks.get("destroy")?.(); }
  }
  const clock = { now: 0 }, particles = new ParticleCap(), decoration = new DecorationBudget();
  const scene = {
    time: clock,
    add: {
      sprite(x: number, y: number, texture: string) { const s = new Shape(x, y); s.texture = texture; sprites.push(s); return s; },
      rectangle(x: number, y: number, w: number, h: number) { const s = new Shape(x, y, w, h); chips.push(s); return s; },
    },
    tweens: { add(tween: typeof tweens[number]) { tweens.push(tween); }, killTweensOf() {} },
  } as unknown as Phaser.Scene;
  return { scene, clock, particles, decoration, sprites, chips, tweens,
    channels: { motion: true, flash: true }, cssPixel: 2, heavy: true };
}
const hit: Effect = { kind: "hit", value: 10, x: 100, y: 100, fromX: 50, fromY: 100, target: 1 };

test("only critical and skill contacts reuse white artwork above bodies and below warnings", () => {
  for (const [critical, skillHit, expected] of [[false, false, 0], [true, false, 1], [false, true, 1]] as const) {
    const c = contacts();
    emitContactParticles({ ...c, skillHit }, { ...hit, critical });
    expect(c.sprites).toHaveLength(expected);
    for (const s of c.sprites) {
      expect(s.texture).toBe("melee"); expect(s.animation).toEqual(critical ? { key: "melee", frameRate: 15 } : "melee");
      expect(s.depth).toBeGreaterThan(900); expect(s.depth).toBeLessThan(LAYER.bars);
      expect(s.scale).toBe(critical ? 4 : 2);
      const live = c.particles.live;
      s.callbacks.get("animationcomplete")!();
      expect(c.particles.live).toBe(live - 1);
    }
  }
});

test("contact light and chips share twelve admissions per rolling second and release both pools", () => {
  const c = contacts();
  for (let i = 0; i < 13; i++) {
    c.clock.now = i * 60;
    emitContactParticles(c, { ...hit, critical: true });
    c.tweens.splice(0).forEach(t => t.onComplete());
    c.sprites.at(-1)?.callbacks.get("animationcomplete")?.();
    // A rejected call adds no object, so do not destroy its previous contact twice.
    if (c.sprites.at(-1)) c.sprites.at(-1)!.callbacks.clear();
  }
  expect(c.sprites).toHaveLength(12);
  expect(c.chips).toHaveLength(120);
  expect(c.particles.live).toBe(0);
  c.clock.now = 1000;
  expect(emitContactParticles(c, { ...hit, critical: true })).toBe(10);
  expect(c.sprites).toHaveLength(13);
});

test("critical splinters keep ten particles and 260 to 420ms life while pointing along the attack", () => {
  for (const fromX of [50, 150]) {
    const c = contacts();
    expect(emitContactParticles(c, { ...hit, fromX, critical: true })).toBe(10);
    expect(c.tweens.map(t => t.duration)).toEqual(Array.from({ length: 10 }, (_, i) => 260 + i * 160 / 9));
    c.chips.slice(2).forEach((chip, index) => {
      expect(chip.width).toBe((11 + (index + 2) % 3) * 2);
      expect(chip.height).toBe(8);
      const t = c.tweens[index + 2];
      expect(Math.sign(t.x - chip.x)).toBe(fromX < hit.x ? 1 : -1);
    });
  }
  const c = contacts();
  expect(emitContactParticles(c, hit)).toBe(6);
  expect(c.tweens.map(t => t.duration)).toEqual([120, 140, 160, 180, 200, 220]);
});

test("contact extras never exceed either particle cap or sprite cap", () => {
  for (const slow of [false, true]) {
    const c = contacts();
    if (slow) for (let i = 0; i < 300; i++) c.particles.sample(33);
    const cap = slow ? 48 : 60;
    c.particles.live = cap - 1;
    expect(emitContactParticles(c, { ...hit, critical: true })).toBe(0);
    expect(c.particles.live).toBe(cap);
    expect(c.sprites).toHaveLength(1);
    c.clock.now = 1000;
    expect(emitContactParticles(c, { ...hit, critical: true })).toBe(0);
    expect(c.sprites).toHaveLength(1);
  }
  const c = contacts();
  for (let i = 0; i < 48; i++) expect(c.decoration.acquire("sprite")).toBe(true);
  expect(emitContactParticles(c, { ...hit, critical: true })).toBe(10);
  expect(c.sprites).toHaveLength(0);
});

test("flashes off removes contact light and white chips; motion off removes particle movement", () => {
  const c = contacts();
  c.channels.flash = false;
  expect(emitContactParticles(c, { ...hit, critical: true })).toBe(8);
  expect(c.sprites).toHaveLength(0);
  const still = contacts();
  still.channels.motion = false;
  expect(emitContactParticles(still, { ...hit, critical: true })).toBe(0);
  expect(still.sprites).toHaveLength(0);
  expect(still.tweens).toHaveLength(0);
  const off = contacts();
  off.channels = { flash: false, motion: false };
  expect(emitContactParticles(off, { ...hit, critical: true })).toBe(0);
  expect(off.sprites).toHaveLength(0);
});

test("shake arguments select 3px skill and 4px large-event tiers with bounded durations", () => {
  const skill = new ImpactBudget(), kill = new ImpactBudget(), small = new ImpactBudget();
  skill.request(0, true, false, .01, 200);
  kill.request(0, true, false, .014, 420);
  small.request(0, false, false, .004, 180);
  expect(skill.sample(10, false).x).toBeCloseTo(Math.sin(1.2) * 3 * .95 ** 2);
  expect(kill.sample(10, false).x).toBeCloseTo(Math.sin(1.2) * 4 * (1 - 10 / 240) ** 2);
  expect(small.sample(10, false)).toEqual({ x: 0, y: 0 });
  expect(skill.sample(200, false)).toEqual({ x: 0, y: 0 });
  expect(kill.sample(240, false)).toEqual({ x: 0, y: 0 });
  expect(kill.sample(10, true)).toEqual({ x: 0, y: 0 });
  expect(kill.request(1999, true, false, .018, 420).allowed).toBe(false);
  for (const at of [2000, 4000, 6000]) expect(kill.request(at, true, false, .014, 420).stop).toBe(90);
  expect(kill.request(8000, true, false, .014, 420).stop).toBe(0);
  expect(kill.request(10000, true, true, .014, 420).allowed).toBe(false);
  for (const strength of [.006, .012, .018]) {
    const minor = new ImpactBudget();
    expect(minor.request(0, false, false, strength).stop).toBe(0);
    expect(minor.sample(25, false)).toEqual({ x: 0, y: 0 });
  }
  const early = new ImpactBudget();
  for (const at of [0, 2000, 4000, 6000]) expect(early.request(at, true, false, 0).stop).toBe(90);
  expect(early.sample(6025, false)).toEqual({ x: 0, y: 0 });
  expect(early.request(8000, true, false, 0).stop).toBe(0);
});

test("merged skill numbers keep prominence and reset on slot reuse without growing the pool", () => {
  const numbers = new DamageNumbers(), slots = [...numbers.slots];
  numbers.beginFrame(0);
  expect(numbers.add(0, 0, 10, false, 0, "foe:1", true)).toBe(0);
  expect(numbers.add(0, 0, 1, false, 100, "foe:1")).toBe(0);
  expect(numbers.slots[0].big).toBe(true);
  expect(damageNumberStyle(numbers.slots[0].critical, numbers.slots[0].big)).toEqual({ size: 14, color: "#ffffff", alpha: 1 });
  numbers.beginFrame(650);
  expect(numbers.add(0, 0, 1, false, 650, "foe:2")).toBe(0);
  expect(numbers.slots[0].big).toBe(false);
  expect(damageNumberStyle(numbers.slots[0].critical, numbers.slots[0].big)).toEqual({ size: 10, color: "#aab7cc", alpha: .7 });
  numbers.add(0, 0, 2, true, 650, "foe:2");
  expect(damageNumberStyle(numbers.slots[0].critical, numbers.slots[0].big)).toEqual({ size: 18, color: "#ffdf53", alpha: 1 });
  expect(numbers.slots).toHaveLength(24);
  expect(numbers.slots[0]).toBe(slots[0]);
});

test("number policy still defaults off and preserves big-only fallback", () => {
  setDamageNumbersOn(false);
  expect(damageNumbersMode()).toBe("off");
  expect(damageNumberShown(true)).toBe(false);
  expect(damageNumberShown(false, "big")).toBe(false);
  expect(damageNumberShown(true, "big")).toBe(true);
});

test("successful skill button response lasts 120ms and repeated casts cancel only that response", () => {
  const calls: { frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
  let cancelled = 0;
  const button = {
    style: { outline: "" },
    getAnimations: () => [{ id: "skill-cast", cancel() { cancelled++; } }, { id: "ready", cancel() { throw Error("Ready animation must survive"); } }],
    animate(frames: Keyframe[], options: KeyframeAnimationOptions) { calls.push({ frames, options }); },
  } as unknown as HTMLElement;
  const run = chaosArena("권율", 1);
  chaosEnemy(run, 195, 100);
  const cast = useSkill(run, 0);
  expect(cast.length).toBeGreaterThan(0);
  skillButtonCast(button, cast, { motion: true, flash: true });
  expect(calls[0]).toEqual({ frames: [{ transform: "scale(.92)" }, { transform: "scale(1)" }],
    options: { id: "skill-cast", duration: 120, easing: "ease-out" } });
  skillButtonCast(button, cast, { motion: false, flash: true });
  expect(calls).toHaveLength(1);
  expect(button.style.outline).toBe("2px solid var(--gold-light)");
  skillButtonCast(button, cast, { motion: false, flash: false });
  expect(calls).toHaveLength(1);
  expect(button.style.outline).toBe("2px solid currentColor");
  const rejected = useSkill(run, 0);
  expect(rejected).toEqual([]);
  skillButtonCast(button, rejected, { motion: true, flash: true });
  expect(calls).toHaveLength(1);
  expect(button.style.outline).toBe("2px solid currentColor");
  expect(cancelled).toBe(3);
  run.squads[0].skillClock = 0;
  const nextCast = useSkill(run, 0);
  expect(nextCast.length).toBeGreaterThan(0);
  skillButtonCast(button, nextCast, { motion: true, flash: true });
  expect(button.style.outline).toBe("");
  expect(calls).toHaveLength(2);
});

function dying() {
  const data = new Map<string, unknown>([["nativeScale", 2]]), handlers = new Map<string, () => void>();
  const timers: { at: number; callback: () => void }[] = [];
  type Tween = { duration: number; alpha?: number; scaleX?: number; scaleY?: number; yoyo?: boolean; onComplete?: () => void };
  const tweens: Tween[] = [], played: string[] = [], frames: number[] = [];
  const clock = { now: 0, delayedCall(ms: number, callback: () => void) { timers.push({ at: clock.now + ms, callback }); } };
  let completed = false;
  const body = {
    active: true, x: 100, y: 200, scaleX: 2, scaleY: 2, flipX: false, texture: "", frame: 0,
    anims: { currentFrame: { index: 1 } },
    clearTint() { return this; },
    play(key: string) { played.push(key); return this; },
    setTexture(key: string, frame = 0) { this.texture = key; this.frame = frame; return this; },
    setData(key: string, value: unknown) { data.set(key, value); return this; },
    getData(key: string) { return data.get(key); },
    on(event: string, callback: () => void) { handlers.set(event, callback); return this; },
    off(event: string) { handlers.delete(event); return this; },
    once(event: string, callback: () => void) { handlers.set(event, () => { handlers.delete(event); callback(); }); return this; },
    destroy() { this.active = false; },
  };
  const scene = { time: clock, tweens: { add(config: Tween) {
    tweens.push(config);
    if (config.onComplete) timers.push({ at: clock.now + config.duration, callback: config.onComplete });
  } } } as unknown as Phaser.Scene;
  const advance = (now: number) => {
    clock.now = now;
    const animation = ENEMY_ANIMATIONS[played[0]];
    if (animation && !completed) {
      const index = Math.min(animation.frames.length, Math.floor(now * animation.frameRate / 1000) + 1);
      body.anims.currentFrame.index = index;
      const frame = animation.frames[index - 1];
      body.setTexture(frame.key, frame.frame); frames.push(index);
      handlers.get("animationupdate")?.();
      if (now >= animation.frames.length * 1000 / animation.frameRate) {
        completed = true; handlers.get("animationcomplete")?.();
      }
    }
    for (const timer of [...timers]) if (timer.at <= now) { timers.splice(timers.indexOf(timer), 1); timer.callback(); }
  };
  return { body, sprite: body as unknown as Phaser.GameObjects.Sprite, scene, tweens, played, frames, advance };
}

test("ordinary, full-art and ship deaths finish every animation frame before the fade, without restarting for the white flash", () => {
  const arts: EnemyArt[] = [{ base: "yari", full: false }, { base: "konishi", full: true }, { base: "atakebune", full: false, ship: true }];
  for (const art of arts) for (const flash of [false, true]) {
    const d = dying(), animation = enemyAnimation(art, { moving: false, attacking: false, hurt: false, flashing: false, direction: "side", dead: true });
    const duration = animation.frames.length * 1000 / animation.frameRate;
    playEnemyDeath(d.scene, d.sprite, art, "side", { motion: true, flash }, new DecorationBudget());
    const pop = d.tweens.find(tween => tween.yoyo);
    expect(pop?.scaleX).toBeGreaterThanOrEqual(2);
    expect(pop?.scaleY).toBe(2);
    expect(d.body.texture.includes("-white")).toBe(flash);
    d.advance(67);
    expect(d.body.texture.includes("-white")).toBe(false);
    for (let frame = 0; frame < animation.frames.length; frame++) {
      d.advance(Math.max(67, frame * 1000 / animation.frameRate));
      expect(d.body.active).toBe(true);
      expect(d.tweens.some(tween => tween.alpha === 0)).toBe(false);
    }
    d.advance(duration - .01);
    expect(d.tweens.some(tween => tween.alpha === 0)).toBe(false);
    d.advance(duration);
    expect(d.frames).toContain(animation.frames.length);
    expect(d.played).toEqual([animation.key]);
    expect(d.tweens.filter(tween => tween.alpha === 0)).toHaveLength(1);
    expect(d.tweens.at(-1)?.duration).toBe(160);
    d.advance(duration + 159); expect(d.body.active).toBe(true);
    d.advance(duration + 160); expect(d.body.active).toBe(false);
  }
});

test("kill pops admit twelve bodies per second without shortening rejected deaths and motion off destroys without animation", () => {
  const budget = new DecorationBudget(), art = { base: "yari", full: false };
  for (let i = 0; i < 13; i++) {
    const d = dying();
    playEnemyDeath(d.scene, d.sprite, art, "side", { motion: true, flash: true }, budget);
    expect(d.tweens.filter(tween => tween.yoyo)).toHaveLength(i < 12 ? 1 : 0);
    expect(d.tweens.some(tween => tween.alpha === 0)).toBe(false);
    d.advance(1000 / 6);
    expect(d.tweens.some(tween => tween.alpha === 0)).toBe(true);
  }
  const d = dying();
  playEnemyDeath(d.scene, d.sprite, art, "side", { motion: false, flash: true }, budget);
  expect(d.body.active).toBe(false); expect(d.played).toEqual([]); expect(d.tweens).toEqual([]);
});

test("victim holds share twelve admissions but keep individual 250ms recovery and never touch other bodies", () => {
  const budget = new DecorationBudget(), victims = Array.from({ length: 13 }, dying);
  for (const d of victims) holdHit(d.sprite, 0, true, true, budget);
  expect(victims.filter(d => d.body.getData("hitHoldUntil") === 48)).toHaveLength(12);
  expect(victims[12].body.getData("hitHoldUntil")).toBeUndefined();
  const first = victims[0], isolated = new DecorationBudget();
  first.body.x = 140;
  holdHit(first.sprite, 249, true, true, isolated);
  expect(first.body.getData("holdX")).toBe(100);
  holdHit(first.sprite, 250, true, true, isolated);
  expect(first.body.getData("hitHoldUntil")).toBe(298);
  expect(first.body.getData("holdX")).toBe(140);
  const still = dying();
  holdHit(still.sprite, 1000, true, false, isolated);
  holdHit(still.sprite, 1000, false, true, isolated);
  expect(still.body.getData("hitHoldUntil")).toBeUndefined();
});
