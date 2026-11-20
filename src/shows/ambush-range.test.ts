import { expect, test } from "bun:test";
import { chaosArena, chaosEnemy } from "../chaos-test-fixture";
import { PALETTE, rangeCells } from "../presentation";
import type { SkillStage } from "../skill-stage";
import { militiaAmbush } from "../skills-unique";
import { show } from "./ambush-show";

for (const motion of [true, false]) test(`ambush keeps its trigger and rules without a range marker (motion ${motion})`, () => {
  const run = chaosArena("곽재우", 1), squad = run.squads[0];
  const enemy = chaosEnemy(run, 190, 240);
  const effects = militiaAmbush({ run, squad, aim: enemy });
  const skill = effects.find(effect => effect.kind === "skill");
  if (!skill || !run.uniqueSkills?.some(entry => entry.kind === "ambush")) throw new Error("Expected a base ambush cast");
  const channels = { motion, flash: true };
  let marks = 0, groundCells = 0, fieldCells = 0;
  let now = 0, groundPaint = 0, fieldPaint = 0;
  const shockCells: number[] = [], bladeTails: number[] = [];
  const ground = {
    fillStyle: (color: number) => { groundPaint = color; return ground; },
    fillRect: () => {
      if (groundPaint === PALETTE.gold) shockCells.push(now);
      groundCells++;
      return ground;
    },
  };
  const field = {
    fillStyle: (color: number) => { fieldPaint = color; return field; },
    fillRect: (_x: number, _y: number, width: number, height: number) => {
      if (now === 400 && fieldPaint === PALETTE.leaf && width === 2 && height === 2) bladeTails.push(now);
      fieldCells++;
      return field;
    },
  };
  const stage = {
    now: 0, random: () => .5, ground, field, trails: field,
    mark: () => { marks++; }, veil() {}, puff() {}, mote() {}, shake() {}, shout() {}, free() {},
    image: () => undefined,
    reach(x: number, y: number, radius: number) {
      const cells = rangeCells(x, y, radius).map(point => ({ ...point, far: Math.hypot(point.x - x, point.y - y) }));
      return { x, y, radius, cells, rim: cells.filter(point => point.far > radius - 4) };
    },
  } as unknown as SkillStage;
  const before = JSON.stringify(run);
  show.clear(stage);
  show.cast(stage, { skill, results: effects.filter(effect => effect.kind !== "skill"), run, squad,
    from: squad, tier: 1, channels, density: 1 });
  for (const ms of [0, 100, 200, 240, 300, 400, 800, 1600]) {
    now = ms;
    show.update(stage, { now, cssPixel: 1, run, at: point => point, foe: () => undefined, channels });
  }
  show.clear(stage);
  expect(marks).toBe(0);
  expect(shockCells).toEqual([]);
  expect(bladeTails).toEqual([]);
  if (motion) {
    expect(groundCells).toBeGreaterThan(0);
    expect(fieldCells).toBeGreaterThan(0);
  }
  expect(JSON.stringify(run)).toBe(before);
});
