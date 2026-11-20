import { expect, test } from "bun:test";
import type Phaser from "phaser";
import { chaosSkillBand, CHAOS_RULES } from "../chaos-contract";
import { chaosArena, chaosEnemy, chaosTicks } from "../chaos-test-fixture";
import { createBphRun } from "../bph-session";
import { freshMeta } from "../meta";
import { bphEffectCombat, useSkill } from "../rules";
import type { Effect } from "../rules";
import { castYisunsin } from "../skills-yisunsin";
import type { FrameContext, SkillStage } from "../skill-stage";
import { bowAt, bowTime, planRam, show, TURTLE_SHOW } from "./turtle-ship-show";

const PASS = CHAOS_RULES.fleet.passSeconds * 1000, from = { x: 24, y: 300 }, to = { x: 422, y: 300 }, half = CHAOS_RULES.fleet.manualWidth / 2;
const hit = (target: number, x: number, y = 300, value = 10) => ({ kind: "hit" as const, x, y, value, target });
const after = (kind: "kill" | "coin", x: number, target?: number) => ({ kind, x, y: 300, value: 1, ...(target === undefined ? {} : { target }) });
/** Two passes as the rules resolve them on the cast tick: each living foe is struck once per pass, 30 px further right the second time; foe 2 falls in the first. */
const results = [hit(1, 124), hit(2, 223, 318), after("kill", 223, 2), after("coin", 223), hit(3, 40, 280), hit(1, 154, 300, 5), hit(3, 70, 280, 5)];
const cast = { seed: 7, pass: 0, from, to, half, density: 1, still: false, results };
const fromSpine = (point: { readonly x: number; readonly y: number }) => Math.hypot(point.x - Math.max(from.x, Math.min(to.x, point.x)), point.y - from.y);

test("a hit lands as its pass's bow reaches the foe, the k-th hit on a foe in pass k, and its fall and coin wait with it", () => {
  const plan = planRam(cast), crossing = (x: number) => (x - from.x) / (to.x - from.x) * PASS;
  const expected = [crossing(124), crossing(223), crossing(223), crossing(223), crossing(40), PASS + crossing(154), PASS + crossing(70)];
  expect(plan.times).toHaveLength(expected.length);
  plan.times.forEach((time, index) => expect(time).toBeCloseTo(expected[index], 6));
  expect(plan.rams.map(ram => ram.pass)).toEqual([0, 0, 0, 1, 1]);
  for (const ram of plan.rams) expect(bowAt(ram.at - ram.pass * PASS, from.x, to.x)).toBeCloseTo(ram.x, 6);
  expect(plan.rams.filter(ram => ram.first).map(ram => [ram.pass, ram.x])).toEqual([[0, 40], [1, 70]]);
  expect([plan.passes, plan.total]).toEqual([2, 40]);
  expect(bowTime(0, -40, from.x, to.x)).toBe(0);
  expect(bowAt(bowTime(1, 999, from.x, to.x) - PASS, from.x, to.x)).toBeCloseTo(999, 9);
});

test("bow timing follows the contract when its pass duration changes at runtime", () => {
  const seconds = CHAOS_RULES.fleet.passSeconds;
  Object.defineProperty(CHAOS_RULES.fleet, "passSeconds", { value: seconds * 2 });
  try {
    const duration = CHAOS_RULES.fleet.passSeconds * 1000;
    expect(bowTime(1, to.x, from.x, to.x)).toBe(2 * duration);
    expect(bowAt(duration / 2, from.x, to.x)).toBe((from.x + to.x) / 2);
    expect(planRam(cast).times[5]).toBeCloseTo(duration + (154 - from.x) / (to.x - from.x) * duration, 6);
  } finally { Object.defineProperty(CHAOS_RULES.fleet, "passSeconds", { value: seconds }); }
});

test("the manual show marks the exact lane carried by the rules effect", () => {
  const run = createBphRun(freshMeta(), { seed: 42, general: "이순신", upgrades: [], startBattle: true });
  const squad = run.squads[0], stage: SkillStage = Object.create(null);
  // A survival run now stands 이순신 at Lv1, whose tap casts the runtime fleet; the manual lane comes from the rules' own BPH cast.
  const effects: Effect[] = [], combat = bphEffectCombat(run, effects);
  castYisunsin(run, squad, effects, { damage: (enemy, amount) => combat.damage(enemy, amount, squad), knock: (enemy, _from, pixels) => { enemy.x += pixels; } });
  const emitted = effects.find(effect => effect.kind === "skill" && effect.shape === "lane");
  if (!emitted) throw new Error("manual fleet cast did not emit a lane");
  expect(emitted.value).toBe(CHAOS_RULES.fleet.manualWidth / 2);
  const skill = { ...emitted, fromX: 40, fromY: 210, x: 390, y: 210, value: emitted.value + 8 };
  const reaches: unknown[] = [];
  Object.defineProperty(stage, "now", { value: 0 });
  stage.random = () => .5;
  stage.reach = (x, y, radius, origin) => {
    const reach = { x, y, radius, from: origin, cells: [], rim: [] };
    reaches.push(reach);
    return reach;
  };
  try {
    show.cast(stage, { skill, run, squad, results: [], from: squad, tier: squad.tier, channels: { motion: false, flash: false }, density: 0 });
    expect(reaches).toEqual([{ x: skill.x, y: skill.y, radius: skill.value,
      from: { x: skill.fromX, y: skill.fromY }, cells: [], rim: [] }]);
  } finally { show.clear(stage); }
});

test("debris and gun ports stay inside the real lane, and a ship outside it is shot at instead of rammed", () => {
  const edge = [hit(1, 2, 323), hit(2, 440, 277), hit(3, 200, 324), hit(4, 300, 700)];
  for (const seed of [1, 7, 1593]) for (const pass of [0, 1]) {
    const plan = planRam({ ...cast, seed, pass, results: edge });
    expect(plan.rams.map(ram => ram.rammed)).toEqual([true, true, true, false]);
    expect(plan.chips).toHaveLength(3 * TURTLE_SHOW.chips);
    expect(plan.guns).toHaveLength(TURTLE_SHOW.volleys.length * TURTLE_SHOW.guns.length * 2);
    for (const point of [...plan.chips, ...plan.guns]) expect(fromSpine(point)).toBeLessThanOrEqual(half);
    for (const gun of plan.guns) {
      expect(gun.at).toBeGreaterThanOrEqual(pass * PASS);
      expect(gun.at).toBeLessThan((pass + 1) * PASS);
    }
  }
});

test("the plan repeats for a seed and never draws from Math.random", () => {
  const global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    expect(planRam(cast)).toEqual(planRam(cast));
    expect(planRam({ ...cast, seed: 8 }).chips).not.toEqual(planRam(cast).chips);
    expect(planRam({ ...cast, seed: 8 }).times).toEqual(planRam(cast).times);
  } finally { Math.random = global; }
});

test("with motion off every result shows at once and nothing is planned to move, and a slow device gets less debris", () => {
  const still = planRam({ ...cast, still: true });
  expect(still.times.every(time => time === 0)).toBe(true);
  expect([still.chips, still.guns]).toEqual([[], []]);
  expect(still.total).toBe(40);
  expect(planRam({ ...cast, density: .6 }).chips).toHaveLength(5 * Math.round(TURTLE_SHOW.chips * .6));
});

/** Record the public stage boundary, leaving casts, routes, hits and clocks to the real simulation. */
function fleetStage() {
  const stage: SkillStage = Object.create(null), hulls: { x: number; y: number; row: number; flip: boolean; visible: boolean }[] = [];
  const drops: unknown[][] = [], fire: unknown[][] = [];
  let shakes = 0;
  const trails: Phaser.GameObjects.Graphics = Object.create(null);
  trails.fillStyle = () => trails;
  trails.fillRect = (...rect) => { fire.push(rect); return trails; };
  Object.assign(stage, { trails });
  stage.random = () => { throw new Error("fleet used stage random"); };
  stage.veil = () => undefined;
  stage.navalImpact = () => { shakes++; };
  stage.shake = () => { throw new Error("Naval hits must not use the simulation stop"); };
  stage.mote = (...args) => { drops.push(args); };
  stage.free = image => { image.setVisible(false); };
  stage.image = () => {
    const image: Phaser.GameObjects.Image = Object.create(null);
    const hull = { x: 0, y: 0, row: 0, flip: false, visible: false };
    hulls.push(hull);
    image.setOrigin = image.setScale = image.setDepth = image.setAlpha = () => image;
    image.setFrame = frame => { hull.row = Number(frame); return image; };
    image.setFlipX = flip => { hull.flip = flip; return image; };
    image.setPosition = (x = 0, y = x) => { hull.x = x; hull.y = y; return image; };
    image.setVisible = visible => { hull.visible = visible; return image; };
    return image;
  };
  return { stage, hulls, drops, fire, shakes: () => shakes };
}

function fleetFrame(run: ReturnType<typeof chaosArena>, motion = true): FrameContext {
  return { run, now: 0, cssPixel: 1, at: unit => unit, foe: () => undefined, channels: { motion, flash: true } };
}

test("runtime ships render every crossing position and facing, with contract counts at every growth band", () => {
  for (const level of [1, 5, 10, 15, 20]) {
    const run = chaosArena("이순신", level), record = fleetStage(), band = chaosSkillBand(level);
    useSkill(run, 0);
    let peak = 0;
    const headings = new Set<string>(), rules = CHAOS_RULES.skills.ships;
    const end = rules.interval * rules.waves[band] + rules.travel + CHAOS_RULES.skills.afterTicks;
    try {
      for (let tick = 0; tick <= end; tick++) {
        const before = JSON.stringify(run);
        show.update(record.stage, fleetFrame(run));
        expect(JSON.stringify(run)).toBe(before);
        const live = run.chaosSkills?.events.filter(event => event.kind === "ships" && event.startedTick <= tick && tick < event.impactTick) ?? [];
        const expected = live.map(event => {
          const dx = event.to.x - event.from.x, dy = event.to.y - event.from.y;
          const row = dy ? dy > 0 ? 0 : 14 : 28;
          headings.add(dy ? dy > 0 ? "south" : "north" : dx > 0 ? "east" : "west");
          return [Math.round(event.x), Math.round(event.y), row, dx < 0];
        });
        const shown = record.hulls.filter(hull => hull.visible).map(hull => [hull.x, hull.y, Math.floor(hull.row / 14) * 14, hull.flip]);
        expect(shown).toEqual(expected);
        peak = Math.max(peak, shown.length);
        chaosTicks(run, 1);
      }
      expect(record.hulls.length).toBe(rules.count[band] * rules.waves[band]);
      expect(peak).toBe(rules.count[band] * Math.min(rules.waves[band], Math.ceil(rules.travel / rules.interval)));
      if (level === 20) expect([...headings].sort()).toEqual(["east", "north", "south", "west"]);
    } finally { show.clear(record.stage); }
    expect(record.hulls.every(hull => !hull.visible)).toBe(true);
  }
});

test("reduced motion keeps the same entry hulls and no fire, spray or shake as runtime ships move", () => {
  const run = chaosArena("이순신", 20), record = fleetStage();
  useSkill(run, 0); chaosTicks(run, 3);
  try {
    show.update(record.stage, fleetFrame(run, false));
    const before = record.hulls.map(hull => ({ ...hull }));
    chaosTicks(run, 8);
    show.update(record.stage, fleetFrame(run, false));
    expect(record.hulls).toEqual(before);
    expect(before.length).toBe(CHAOS_RULES.skills.ships.count[chaosSkillBand(20)]);
    for (const hull of before) {
      expect(hull.x >= 0 && hull.x <= 390 && hull.y >= 0 && hull.y <= 650).toBe(true);
    }
    expect([record.drops, record.fire, record.shakes()]).toEqual([[], [], 0]);
  } finally { show.clear(record.stage); }
});

test("runtime hit splashes and one shake per struck wave replay deterministically without stage RNG", () => {
  function battle(visible: boolean) {
    const run = chaosArena("이순신", 20), record = fleetStage();
    useSkill(run, 0);
    const event = run.chaosSkills?.events.find(event => event.kind === "ships");
    if (!event) throw new Error("missing runtime ship");
    const enemy = chaosEnemy(run, 100, event.from.y);
    const body: Phaser.GameObjects.Sprite = Object.create(null);
    Object.assign(body, { x: enemy.x, y: enemy.y, visible });
    const waves = new Set<number>();
    let hits = 0;
    const seen = new Map<number, Set<number>>();
    try {
      for (let tick = 0; tick < 170; tick++) {
        for (const ship of run.chaosSkills?.events ?? []) {
          const previous = seen.get(ship.id) ?? new Set<number>();
          for (const id of ship.hits) if (!previous.has(id)) { hits++; previous.add(id); waves.add(ship.wave); }
          seen.set(ship.id, previous);
        }
        show.update(record.stage, { ...fleetFrame(run), foe: () => body });
        chaosTicks(run, 1);
      }
      return { drops: record.drops, shakes: record.shakes(), hits, waves: waves.size };
    } finally { show.clear(record.stage); }
  }
  const first = battle(true), hidden = battle(false);
  expect(first).toEqual(battle(true));
  expect(first.hits).toBeGreaterThan(0);
  expect(first.shakes).toBe(first.waves);
  expect(first.drops.length - hidden.drops.length).toBe(first.hits * TURTLE_SHOW.chips);
});

test("a frame arriving at the end of a crossing still shows its newly observed runtime hits", () => {
  // Lv5: two waves, so the second wave is still sailing when the first crossing ends (Lv1 sails a single wave).
  const run = chaosArena("이순신", 5), record = fleetStage();
  useSkill(run, 0);
  const ship = run.chaosSkills?.events.find(event => event.kind === "ships");
  if (!ship) throw new Error("missing runtime ship");
  const enemy = chaosEnemy(run, 100, ship.from.y);
  chaosTicks(run, CHAOS_RULES.skills.ships.travel);
  const body: Phaser.GameObjects.Sprite = Object.create(null);
  Object.assign(body, { x: enemy.x, y: enemy.y, visible: true });
  try {
    const hits = (run.chaosSkills?.events ?? []).reduce((count, event) => count + event.hits.length, 0);
    expect(hits).toBeGreaterThan(0);
    show.update(record.stage, { ...fleetFrame(run), foe: () => body });
    expect(record.drops.filter(drop => drop[4] === 300).length).toBe(hits * TURTLE_SHOW.chips);
    expect(record.shakes()).toBe(1);
    expect(record.hulls.filter(hull => hull.visible).length).toBe(CHAOS_RULES.skills.ships.count[chaosSkillBand(5)]);
  } finally { show.clear(record.stage); }
});
