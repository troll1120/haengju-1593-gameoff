import { expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import { ARROW_ART, bodyDepth, bodyScale, DecorationBudget, feedbackChannels, LAYER, PALETTE, rangeCells, shotArt, skillCharge, skillFace } from "./presentation";
import { GENERAL_ART, GENERALS, generalUnit } from "./roster";
import { advance, createRun } from "./rules";

test("ground, bodies, impacts and bars remain ordered at every battlefield y", () => {
  for (let y = 0; y <= 800; y++) {
    expect(bodyDepth(y)).toBeGreaterThan(LAYER.ground);
    expect(bodyDepth(y)).toBeLessThan(LAYER.impact);
  }
  expect(LAYER.impact + 99).toBeLessThan(LAYER.bars);
});
test("all body art categories use whole pixel multiples", () => {
  expect([bodyScale(false, false, false), bodyScale(false, false, true), bodyScale(false, true, true),
    bodyScale(true, false, true), bodyScale(true, true, true)]).toEqual([1, 2, 3, 1, 2]);
});
test("forty deaths within a second draw twelve smokes and recover only after the rolling window", () => {
  const budget = new DecorationBudget();
  const kill = { kind: "kill", x: 0, y: 0, value: 0 } as const;
  expect(Array.from({ length: 40 }, (_, i) => budget.effect(kill, i * 20)).filter(Boolean)).toHaveLength(12);
  expect(budget.effect(kill, 999)).toBe(false);
  expect(budget.effect(kill, 1000)).toBe(true);
});
test("decoration saturation never consumes telegraphs or ordinary coin pickups", () => {
  const budget = new DecorationBudget();
  for (let i = 0; i < 48; i++) expect(budget.acquire("sprite")).toBe(true);
  expect(budget.acquire("sprite")).toBe(false);
  for (const kind of ["hit", "hurt", "devastate", "swing", "kill", "blast"] as const)
    for (let i = 0; i < 40; i++) budget.effect({ kind, x: 20, y: 30, value: 1 }, 0);
  expect(budget.effect({ kind: "telegraph", x: 20, y: 30, value: 1 }, 0)).toBe(true);
  expect(budget.effect({ kind: "coin", x: 20, y: 30, value: 1, minor: true }, 0)).toBe(true);
  for (const kind of ["rout", "expand", "skill", "boss-enter", "rage"] as const)
    expect(budget.effect({ kind, x: 20, y: 30, value: 1 }, 0)).toBe(true);
  budget.release("sprite"); expect(budget.acquire("sprite")).toBe(true);
});
test("scorch marks and skill ranges keep independent ceilings", () => {
  const budget = new DecorationBudget();
  expect(Array.from({ length: 8 }, () => budget.acquire("scorch")).filter(Boolean)).toHaveLength(6);
  expect(Array.from({ length: 5 }, () => budget.allow("range", 0, 3)).filter(Boolean)).toHaveLength(3);
});
test("three large contacts can coexist and a released contact restores one slot", () => {
  const budget = new DecorationBudget();
  expect(Array.from({ length: 4 }, () => budget.acquire("burst"))).toEqual([true, true, true, false]);
  budget.release("burst");
  expect(budget.acquire("burst")).toBe(true);
  expect(budget.acquire("burst")).toBe(false);
  expect(budget.acquire("scorch")).toBe(true);
});
test("ordinary, incoming and critical hit sparks share one twelve-per-second budget", () => {
  const budget = new DecorationBudget();
  for (let i = 0; i < 12; i++) expect(budget.effect({ kind: "hit", x: 0, y: 0, value: 1 }, 0)).toBe(true);
  expect(budget.effect({ kind: "hurt", x: 0, y: 0, value: 1 }, 0)).toBe(false);
  expect(budget.effect({ kind: "devastate", x: 0, y: 0, value: 1 }, 0)).toBe(false);
  expect(budget.allow("blast", 0, 4)).toBe(true);
});
test("danger circles and diagonal lanes contain only four pixel cells around their actual targets", () => {
  const circle = rangeCells(20, 20, 12), lane = rangeCells(40, 40, 8, { x: 0, y: 0 });
  for (const cells of [circle, lane]) {
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every(cell => cell.x % 4 === 0 && cell.y % 4 === 0)).toBe(true);
  }
  expect(circle.some(cell => cell.x === 16 && cell.y === 16)).toBe(true);
  expect(circle.some(cell => cell.x === 0 && cell.y === 0)).toBe(false);
  expect(lane.some(cell => cell.x === 20 && cell.y === 20)).toBe(true);
  expect(lane.some(cell => cell.x === 0 && cell.y === 40)).toBe(false);
});
test("skill charge rises in twelve bottom-to-top steps and clamps at both ends", () => {
  expect([13, 12, 6, 1, 0, -1].map(clock => skillCharge(clock, 12))).toEqual([0, 0, 6, 11, 12, 12]);
});
test("motion and flash switches independently suppress only their feedback channel", () => {
  expect(feedbackChannels(true, false, false)).toEqual({ motion: false, flash: true });
  expect(feedbackChannels(false, true, false)).toEqual({ motion: true, flash: false });
  expect(feedbackChannels(false, false, true)).toEqual({ motion: false, flash: false });
  expect(feedbackChannels(false, false, false)).toEqual({ motion: true, flash: true });
});
test("each general keeps personal art while skill pictures represent the actual skill family", () => {
  expect(new Set(GENERALS.map(generalUnit)).size).toBe(20);
  for (const general of GENERALS) expect(generalUnit(general)).toBe(GENERAL_ART[general]);
  expect(["권율", "김시민", "곽재우", "황진", "처영", "조헌", "신립"].map(general => {
    const member = GENERALS.find(value => value === general);
    if (!member) throw new Error("missing skill fixture");
    return skillFace(member).file;
  })).toEqual(["volley_arc", "guard", "slash", "slash", "heal", "blast_big", "charge"]);
});
test("an arrow hitting an enemy shield reports its visible block without dealing damage", () => {
  const run = createRun(42), foe = run.enemies[0], squad = run.squads[0];
  run.enemies = [foe]; run.spawnBudget = -1e9; run.xp = -1e9;
  run.nextBoss = run.nextElite = run.nextWave = run.nextRiverWave = 1e9;
  squad.state = "down"; squad.downUntil = 1e9; squad.soldiers = [];
  Object.assign(foe, { x: 100, y: 100, speed: 0, clock: 1e9, skillClock: 1e9, shielded: true, hp: 1000, maxHp: 1000 });
  run.shots.push({ id: 9000, kind: "arrow", x: 100, y: 100, toX: 100, toY: 100, speed: 200, target: foe.id,
    prey: null, damage: 100, critical: false, by: "weapon", splash: 0, pierce: 0, from: 0 });
  const effects = advance(run, .01);
  expect(foe.hp).toBe(1000);
  expect(effects.filter(effect => effect.kind === "block" && effect.target === foe.id)).toEqual([
    { kind: "block", x: 100, y: 100, value: 0, target: foe.id },
  ]);
});
test("arrow shots fly on the drawn arrow sheet, one frame per sixteenth of a turn, and never on the volley effect", () => {
  for (let turn = -16; turn < 32; turn++) for (const drift of [-.19, 0, .19])
    expect(shotArt("arrow", turn * Math.PI / 8 + drift)).toEqual({ key: "arrow", frame: (turn % 16 + 16) % 16, rotation: 0, tint: 0xffffff });
  expect(shotArt("arrow", Math.PI / 2, true)).toEqual({ key: ARROW_ART.key, frame: 4, rotation: 0, tint: PALETTE.flame });
});
test("hwacha rockets keep their own turning sheet", () => {
  expect(shotArt("rocket", .5, true)).toEqual({ key: "rocket", frame: 2, rotation: .5 + Math.PI / 2, tint: 0xffffff });
});
test("the shipped arrow sheet is sixteen opaque palette frames, each pointing along its heading", async () => {
  const bytes = await Bun.file(`${import.meta.dir}/../public/art/${ARROW_ART.file}.png`).bytes();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), width = view.getUint32(16), height = view.getUint32(20);
  expect([width, height, bytes[24], bytes[25], new TextDecoder().decode(bytes.subarray(37, 41))])
    .toEqual([ARROW_ART.size * ARROW_ART.directions, ARROW_ART.size, 8, 6, "IDAT"]);
  const rows = inflateSync(bytes.subarray(41, 41 + view.getUint32(33))), stride = 1 + width * 4;
  const paints = new Set<number>(Object.values(PALETTE)), stray: string[] = [];
  const ends = Array.from({ length: ARROW_ART.directions }, () => ({ tip: [0, 0, 0], tail: [0, 0, 0] }));
  for (let y = 0; y < height; y++) {
    expect(rows[y * stride]).toBe(0);
    for (let x = 0; x < width; x++) {
      const at = y * stride + 1 + x * 4, alpha = rows[at + 3], paint = rows[at] << 16 | rows[at + 1] << 8 | rows[at + 2];
      if (alpha === 0) continue;
      if (alpha !== 255 || !paints.has(paint)) stray.push(`${x},${y}`);
      const frame = ends[Math.floor(x / ARROW_ART.size)], end = paint === PALETTE.silverLight ? frame.tip : paint === PALETTE.white ? frame.tail : undefined;
      if (end) { end[0] += x % ARROW_ART.size; end[1] += y; end[2]++; }
    }
  }
  expect(stray).toEqual([]);
  ends.forEach(({ tip, tail }, frame) =>
    expect(shotArt("arrow", Math.atan2(tip[1] / tip[2] - tail[1] / tail[2], tip[0] / tip[2] - tail[0] / tail[2])).frame).toBe(frame));
});
