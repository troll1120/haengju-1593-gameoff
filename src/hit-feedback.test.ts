import { expect, test } from "bun:test";
import { DamageNumbers, DAMAGE_MERGE_GAP_MS, DAMAGE_MERGE_SPAN_MS, DAMAGE_NUMBER_CAP, DAMAGE_NUMBER_MS, CRITICAL_NUMBER_MS, mergedNumberScale, DAMAGE_NUMBERS_PER_FRAME, damageNumberFrame, hitFlash, hitHold, hitRecoil, hitSquash } from "./hit-feedback";
import { advance, bphEffectCombat, createRun } from "./rules";

test("hit recoil eases back in CSS pixels with a stronger critical response", () => {
  expect(hitRecoil(0)).toBe(3);
  expect(hitRecoil(70)).toBe(.75);
  expect(hitRecoil(139)).toBeGreaterThan(0);
  expect(hitRecoil(140)).toBe(0);
  expect(hitRecoil(-1)).toBe(0);
  expect(hitRecoil(0, true)).toBe(5);
  expect(hitRecoil(90, true)).toBe(1.25);
  expect(hitRecoil(180, true)).toBe(0);
});

test("heavy victim hold lasts 48ms, cannot chain within 250ms, and disappears with motion off", () => {
  expect(hitHold(0, -1e9, true, true)).toBe(48);
  expect(hitHold(249, 0, true, true)).toBe(0);
  expect(hitHold(250, 0, true, true)).toBe(48);
  expect(hitHold(250, 0, false, true)).toBe(0);
  expect(hitHold(250, 0, true, false)).toBe(0);
});

test("every basic hit compresses and releases only its body, with no motion-off transform", () => {
  expect(hitSquash(0, false, true)).toEqual({ x: 1.12, y: .88 });
  expect(hitSquash(0, true, true).x).toBeCloseTo(1.18, 12);
  expect(hitSquash(0, true, true).y).toBeCloseTo(.82, 12);
  expect(hitSquash(55, false, true)).toEqual({ x: 1.03, y: .97 });
  expect(hitSquash(110, true, true)).toEqual({ x: 1, y: 1 });
  expect(hitSquash(-1, true, true)).toEqual({ x: 1, y: 1 });
  expect(hitSquash(0, true, false)).toEqual({ x: 1, y: 1 });
});

test("dense hits admit four numbers per frame and reuse expired slots", () => {
  const pool = new DamageNumbers(), slots = [...pool.slots];
  pool.beginFrame(0);
  for (let i = 0; i < DAMAGE_NUMBERS_PER_FRAME; i++) expect(pool.add(12, 24, i + 1, i === 0, 0)).toBe(i);
  expect(pool.add(12, 24, 99, false, 0)).toBe(-1);
  expect(pool.slots[0]).toMatchObject({ x: 12, y: 24, value: 1, critical: true, active: true });
  for (let frame = 1; frame < 6; frame++) {
    pool.beginFrame(frame);
    for (let i = 0; i < DAMAGE_NUMBERS_PER_FRAME; i++) expect(pool.add(0, 0, 1, false, frame)).toBeGreaterThanOrEqual(0);
  }
  expect(pool.slots.filter(slot => slot.active)).toHaveLength(DAMAGE_NUMBER_CAP);
  pool.beginFrame(6);
  expect(pool.add(0, 0, 1, false, 6)).toBe(-1);
  pool.beginFrame(CRITICAL_NUMBER_MS);
  expect(pool.add(7, 9, 100, true, CRITICAL_NUMBER_MS)).toBe(0);
  expect(pool.slots[0]).toBe(slots[0]);
  expect(pool.slots[0].value).toBe(100);
  pool.clear();
  expect(pool.slots.every(slot => !slot.active)).toBe(true);
});

test("repeated hits cap the white burst and require a visible recovery", () => {
  let flash = hitFlash(0, -1e9, -1e9, false);
  expect(flash.until).toBe(67);
  for (const at of [30, 60, 90, 120, 150, 180]) flash = hitFlash(at, flash.startedAt, flash.until, true);
  expect(flash.until).toBe(133);
  expect(hitFlash(200, flash.startedAt, flash.until, true)).toEqual({ startedAt: 200, until: 300 });
});

test("numbers pop then settle, fade only at the end, and remain still with motion off", () => {
  expect(damageNumberFrame(0, false, true)).toEqual({ scale: 1.25, rise: 0, alpha: 1 });
  expect(damageNumberFrame(83, false, true).scale).toBe(1);
  expect(damageNumberFrame(0, true, true).scale).toBe(1.45);
  expect(damageNumberFrame(117, true, true).scale).toBe(1);
  expect(damageNumberFrame(400, false, true)).toEqual({ scale: 1, rise: 14.4, alpha: .5 });
  expect(damageNumberFrame(550, true, true)).toEqual({ scale: 1, rise: 18, alpha: .5 });
  expect(damageNumberFrame(250, true, false)).toEqual({ scale: 1, rise: 0, alpha: 1 });
});

test("normal number expires while critical number remains readable", () => {
  const pool = new DamageNumbers();
  pool.add(0, 0, 1, false, 0); pool.add(0, 0, 2, true, 0);
  pool.beginFrame(500);
  expect(pool.slots[0].active).toBe(false);
  expect(pool.slots[1].active).toBe(true);
  pool.beginFrame(650);
  expect(pool.slots[1].active).toBe(false);
});

test("zero damage creates no number and consumes no frame slot", () => {
  const pool = new DamageNumbers();
  pool.beginFrame(0);
  expect(pool.add(0, 0, 0, false, 0)).toBe(-1);
  expect(pool.add(0, 0, 1, false, 0)).toBe(0);
});

test("native damage reports attacker coordinates and final critical status", () => {
  const run = createRun(42);
  advance(run, .1);
  const target = run.enemies[0];
  if (!target) throw new Error("Expected the first spawned enemy");
  target.shielded = false;
  target.hp = target.maxHp = 100;
  const source = run.squads[0];
  source.x = target.x - 30; source.y = target.y + 20;
  const effects: Parameters<typeof bphEffectCombat>[1] = [];
  bphEffectCombat(run, effects).applyDamage({ source, target, amount: .2, critical: true });
  expect(effects.find(effect => effect.kind === "hit")).toMatchObject({
    target: target.id, fromX: source.x, fromY: source.y, value: 1, critical: true,
  });
});

test("rapid hits on one target join a single growing number that stays alive while hits keep landing", () => {
  const pool = new DamageNumbers();
  pool.beginFrame(0);
  expect(pool.add(0, 0, 3, false, 0, "foe:7")).toBe(0);
  for (let at = 100; at <= 600; at += 100) expect(pool.add(0, 0, 2, at === 300, at, "foe:7")).toBe(0);
  expect(pool.slots[0]).toMatchObject({ value: 15, hits: 7, critical: true, startedAt: 0, bumpedAt: 600 });
  expect(pool.slots.filter(slot => slot.active)).toHaveLength(1);
  expect(mergedNumberScale(7)).toBe(1.5);
  expect(pool.add(0, 0, 1, false, 600, "foe:8")).toBe(1);
  pool.beginFrame(600 + DAMAGE_MERGE_GAP_MS);
  expect(pool.add(0, 0, 1, false, 600 + DAMAGE_MERGE_GAP_MS, "foe:7")).toBe(2);
  pool.beginFrame(1600 + DAMAGE_NUMBER_MS);
  expect(pool.slots[0].active).toBe(false);
});

test("a joined number stops joining once it is old, so a long stream starts a fresh number", () => {
  const pool = new DamageNumbers();
  for (let at = 0; at < DAMAGE_MERGE_SPAN_MS; at += 200) { pool.beginFrame(at); expect(pool.add(0, 0, 1, false, at, "foe:1")).toBe(0); }
  pool.beginFrame(DAMAGE_MERGE_SPAN_MS);
  expect(pool.add(0, 0, 1, false, DAMAGE_MERGE_SPAN_MS, "foe:1")).toBe(1);
});
