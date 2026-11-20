import { expect, test } from "bun:test";
import { chaosState } from "../chaos-state";
import { chaosArena } from "../chaos-test-fixture";
import { fortRect } from "../geometry";
import type { Area } from "../skill-show";
import { chaosAreas } from "./areas";

const rows = (area: Area | undefined): number[] => area ? [Math.min(area.y, area.from?.y ?? area.y) - area.radius, Math.max(area.y, area.from?.y ?? area.y) + area.radius] : [];

test("a live army picture is reported as ground on the field, and one that has cleared is not", () => {
  const run = chaosArena("신립", 20), state = chaosState(run), wall = fortRect(run.fort);
  if (!state) throw new Error("No army state at N20");
  const grounds = (): number[][] => chaosAreas(state, wall).map(rows);
  expect(grounds()).not.toContainEqual([110, 190]);
  state.trails.push({ id: 1, from: { x: 40, y: 150 }, to: { x: 300, y: 150 }, startedTick: state.tick, untilTick: state.tick + 36, width: 80, power: 1, source: 0, hits: [] });
  expect(grounds()).toContainEqual([110, 190]);
  state.trails[0].untilTick = state.tick;
  expect(grounds()).not.toContainEqual([110, 190]);
  state.pools.push({ id: 2, x: 200, y: 200, radius: 96, startedTick: state.tick, untilTick: state.tick + 10, nextTick: state.tick + 5, healRatio: .1 });
  expect(grounds()).toContainEqual([104, 296]);
});

test("김시민's belt covers the fort's rows grown by the protection range, and a fleet band its own real width", () => {
  const kim = chaosArena("김시민", 20), belt = chaosState(kim), wall = fortRect(kim.fort);
  if (belt?.mods.general !== "김시민") throw new Error("No 김시민 army state");
  expect(rows(chaosAreas(belt, wall).at(-1))).toEqual([wall.top - belt.mods.width, wall.bottom + belt.mods.width]);
  const yi = chaosArena("이순신", 20), state = chaosState(yi);
  if (state?.mods.general !== "이순신") throw new Error("No 이순신 army state");
  state.fleet.push({ id: 3, lane: 120, dueTick: state.tick + 5, untilTick: state.tick + 40, landIds: [], shipIds: [], landPower: 1, shipPower: 1, push: 0, resolved: false });
  expect(rows(chaosAreas(state, fortRect(yi.fort)).at(-1))).toEqual([120 - state.mods.width / 2, 120 + state.mods.width / 2]);
});
