import { marchFixture } from "./ally-march-fixture";
import { CENTER, fortRect } from "../src/geometry";
import { advance } from "../src/rules";

/** North engagement plus a south castle attacker; no spawning or random reinforcements. */
export function defendFixture(kind: "gate" | "wall" | "keep" = "gate") {
  const { run, soldiers } = marchFixture("idle", 390);
  const wall = fortRect(run.fort);
  soldiers.forEach((unit, i) => Object.assign(unit, {
    x: i % 2 ? wall.right + 32 : wall.left - 32,
    y: wall.top - 70 - Math.floor(i / 2) * 3,
  }));
  const base = marchFixture("far", 390).enemy;
  const north = { ...base, id: run.nextId++, x: CENTER.x, y: wall.top - 85,
    goalX: CENTER.x, goalY: wall.top - 85 };
  const south = { ...base, id: run.nextId++, x: kind === "wall" ? wall.right - 30 : CENTER.x,
    y: kind === "keep" ? CENTER.y : wall.bottom + 8,
    goalX: kind === "wall" ? wall.right - 30 : CENTER.x,
    goalY: kind === "keep" ? CENTER.y : wall.bottom,
    stun: 0, clock: 0, breach: kind === "keep" ? "아래" as const : undefined };
  run.enemies = [north];
  for (let i = 0; i < 30; i++) advance(run, 1 / 30);
  run.enemies.push(south);
  return { run, soldiers, north, south };
}

export function measureDefense(seconds = 18) {
  const { run, soldiers, south } = defendFixture();
  const initial = structuredClone(run);
  const frames = [];
  for (let tick = 0; tick < seconds * 30; tick++) {
    advance(run, 1 / 30);
    if (tick % 30 === 29) frames.push(structuredClone(run));
  }
  return { initial, frames, south: south.id,
    responders: soldiers.filter(unit => unit.quarry === south.id).map(unit => unit.id) };
}
