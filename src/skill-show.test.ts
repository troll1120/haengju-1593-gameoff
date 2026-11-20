import { expect, test } from "bun:test";
import { rangeCells } from "./presentation";
import { advance, createRun, useSkill } from "./rules";
import type { Effect } from "./rules";
import { bannerWindows, castResults, clearOfBand, effectArea, holdBack, noteCast, releases } from "./skill-show";

const at = (kind: Effect["kind"], target?: number, value = 1): Effect => ({ kind, x: 10, y: 20, value, ...(target === undefined ? {} : { target }) });

test("a tapped cast's results are found wherever the rules put them around its skill effect", () => {
  const hit = at("hit", 4), kill = at("kill", 4), coin = at("coin"), skill = at("skill"), lane = at("skill"), tick = at("swing");
  const cast = [hit, kill, coin, skill, lane];
  noteCast(cast);
  const batch = [tick, ...cast, at("hit", 9)];
  expect(castResults(batch, batch.indexOf(skill))).toEqual([hit, kill, coin]);
  expect(castResults(batch, batch.indexOf(lane))).toEqual([hit, kill, coin]);
});

test("a volley the rules fire on their own keeps its results from the skill effect to its total", () => {
  const run = createRun(42);
  advance(run, .1);
  run.squads[0].skillClock = 0;
  const cast = useSkill(run, 0), other: Effect = { kind: "coin", x: 1, y: 2, value: 3 };
  const batch = [other, ...cast, other], index = batch.findIndex(effect => effect.kind === "skill");
  const results = castResults(batch, index);
  expect(results.some(effect => effect.kind === "hit")).toBe(true);
  expect(results.at(-1)?.kind).toBe("total");
  expect(batch.slice(index + 1, index + 1 + results.length)).toEqual(results);
  const { shown, held } = holdBack(batch, new Set(results));
  expect(held).toEqual(results);
  expect(shown).toEqual([other, batch[index], other]);
});

test("a skill effect with no recorded cast and no total holds nothing", () => {
  const skill = at("skill");
  expect(castResults([skill, at("hit", 2)], 0)).toEqual([]);
});

test("a felled foe falls after its last hit and the struck flash, with its coin, while its stun lands with the hit", () => {
  const held = [at("hit", 1), at("stun", 1), at("hit", 2), at("hit", 1), at("kill", 1), at("coin"), at("total")];
  const times = releases(held, (effect, index) => effect.kind === "total" ? 50 : index * 100, 67).map(release => release.at);
  expect(times).toEqual([0, 300, 200, 300, 367, 367, 50]);
  expect(releases(held, () => 120, 0).map(release => release.at)).toEqual([120, 120, 120, 120, 120, 120, 120]);
});

test("a big number that would pop or rise behind the cut-in banner starts just under it, and stays put when clear", () => {
  const band = { top: 40, bottom: 136 };
  expect(clearOfBand(100, 48, undefined, 4, 600)).toBe(100);
  expect(clearOfBand(30, 48, band, 4, 600)).toBe(30);
  expect(clearOfBand(240, 48, band, 4, 600)).toBe(240);
  expect(clearOfBand(100, 48, band, 4, 600)).toBe(188);
  expect(clearOfBand(170, 48, band, 4, 600)).toBe(188);
  expect(clearOfBand(560, 48, { top: 520, bottom: 600 }, 4, 600)).toBe(516);
});

test("an enemy warning opens a window in the name banner a cell wider than its last painted cell, and a warning clear of the banner opens none", () => {
  const box = { left: 0, top: 40, right: 390, bottom: 136 };
  // Every caster stands in the banner's rows: a lane's ground runs from there, a circle's lies only where it lands.
  const circle = { shape: "circle", x: 120, y: 150, radius: 40, fromX: 120, fromY: 60 } as const;
  const lane = { shape: "lane", x: 330, y: 70, fromX: 200, fromY: 200, radius: 14 } as const;
  const below = { shape: "circle", x: 195, y: 260, radius: 95, fromX: 195, fromY: 60 } as const;
  const beside = { shape: "lane", x: 500, y: 90, fromX: 420, fromY: 90, radius: 14 } as const;
  expect(bannerWindows(box, [below, beside])).toEqual([]);
  const [round, strip, ...others] = bannerWindows(box, [circle, below, lane, beside]);
  expect(others).toEqual([]);
  expect([round?.x, round?.y, round?.from]).toEqual([120, 150, undefined]);
  expect([strip?.x, strip?.y, strip?.from]).toEqual([330, 70, { x: 200, y: 200 }]);
  // The painter's 4px cells reach past the radius: the window clears its farthest painted corner by a whole cell of open ground,
  // and stays under two cells wider than the warning.
  const reach = Math.max(...rangeCells(circle.x, circle.y, circle.radius).flatMap(cell =>
    [0, 4].flatMap(dx => [0, 4].map(dy => Math.hypot(cell.x + dx - circle.x, cell.y + dy - circle.y)))));
  expect(reach).toBeGreaterThan(circle.radius);
  expect((round?.radius ?? 0) - reach).toBeGreaterThanOrEqual(4);
  expect(round?.radius).toBeLessThan(circle.radius + 8);
  expect((strip?.radius ?? 0) - lane.radius).toBeCloseTo((round?.radius ?? 0) - circle.radius, 9);
});

test("a skill effect names its ground as a circle, or as a lane when it starts somewhere", () => {
  expect(effectArea({ x: 10, y: 20, value: 30 })).toEqual({ x: 10, y: 20, radius: 30 });
  expect(effectArea({ x: 10, y: 20, value: 30, fromX: 5, fromY: 6 })).toEqual({ x: 10, y: 20, radius: 30, from: { x: 5, y: 6 } });
});

test("a big number keeps clear of a bottom banner by rising over it, never sinking behind the dock", () => {
  expect(clearOfBand(520, 48, { top: 470, bottom: 566 }, 4, 650)).toBe(466);
  expect(clearOfBand(440, 48, { top: 470, bottom: 566 }, 4, 650)).toBe(440);
});
