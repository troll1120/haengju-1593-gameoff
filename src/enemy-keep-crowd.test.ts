import { expect, test } from "bun:test";
import { createBphRun } from "./bph-session";
import { CENTER, fortRect } from "./geometry";
import { freshMeta } from "./meta";
import { advance, type Enemy } from "./rules";

const STEP = 1 / 30;

/** Owner 1795159408.929199 ("성은 안때리는데"): a crowd that broke in fills the court round the keep. Every enemy is
 *  let in through the fallen top wall and the general is sent off the field, so only the keep is left to strike. */
function crowd(count: number) {
  const run = createBphRun(freshMeta(), { seed: 1593, general: "권율", upgrades: [] });
  for (let frame = 0; frame < 90 && !run.enemies.length; frame++) advance(run, STEP);
  const proto = run.enemies[0];
  if (!proto?.bphProfileId) throw new Error("Chapter 1 must open with a profile enemy");
  run.bph!.survival!.cursor = Number.MAX_SAFE_INTEGER;
  run.walls.위 = 0;
  const court = fortRect(run.fort, -12), columns = 10;
  const rows = Math.ceil(count / columns);
  run.enemies = Array.from({ length: count }, (_, index): Enemy => ({
    ...structuredClone(proto), id: 50_000 + index, hp: 1e9, maxHp: 1e9, breach: "위", clock: 0, strikeAt: 0, prey: null,
    x: court.left + (index % columns + .5) * (court.right - court.left) / columns,
    y: court.top + (Math.floor(index / columns) + .5) * (court.bottom - court.top) / rows,
  }));
  for (const squad of run.squads) Object.assign(squad, { x: 20, y: 40, soldiers: [], strikeAt: 1e9 });
  run.base = run.maxBase = 1e9;
  return run;
}

test("a crowd packed round the keep strikes it from all around, not one body at its centre", () => {
  const run = crowd(40), strikers = new Set<number>();
  for (let frame = 0; frame < 8 / STEP; frame++) {
    for (const squad of run.squads) Object.assign(squad, { x: 20, y: 40, soldiers: [] });
    for (const effect of advance(run, STEP))
      if (effect.kind === "wall" && effect.x === CENTER.x && effect.y === CENTER.y && effect.target !== undefined) strikers.add(effect.target);
  }

  expect(strikers.size).toBeGreaterThanOrEqual(8);
});
