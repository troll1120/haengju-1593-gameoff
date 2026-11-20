import { expect, test } from "bun:test";
import { createBphRun } from "./bph-session";
import { moveEnemy } from "./enemy-wall";
import { CENTER, fortRect } from "./geometry";
import type { Point, Rect } from "./geometry";
import { freshMeta } from "./meta";
import { advance } from "./rules";

const STEP = .05;

/** Chapter 1's first enemy let in through a fallen top wall, with the general alone in the court (owner DM
 *  1795145756.429339: the keep was never attacked). He is held mid-windup, so he neither walks nor strikes and the
 *  scene tests only which target the enemy picks. */
function breach(place: (wall: Rect) => { enemy: Point; general: Point }, gunner = false) {
  const run = createBphRun(freshMeta(), { seed: 1593, general: "권율", upgrades: [] });
  for (let frame = 0; frame < 60 && !run.enemies.length; frame++) advance(run, STEP);
  const enemy = run.enemies[0], [general] = run.squads;
  if (!enemy?.bphProfileId) throw new Error("Chapter 1 must open with a profile enemy");
  run.bph!.survival!.cursor = Number.MAX_SAFE_INTEGER;
  run.walls.위 = 0;
  const at = place(fortRect(run.fort));
  enemy.hp = enemy.maxHp = 1e9;
  if (gunner) Object.assign(enemy, { kind: "teppo", elite: false, boss: false, ladder: false });
  enemy.x = CENTER.x; enemy.y = 1;
  moveEnemy(run, enemy, at.enemy);
  if (enemy.breach !== "위") throw new Error("The enemy must enter through the fallen top wall");
  Object.assign(general, { ...at.general, soldiers: [], strikeAt: 1e9 });
  run.enemies = [enemy];
  return { run, enemy, general };
}

function watch({ run, enemy, general }: ReturnType<typeof breach>, seconds: number) {
  const keep = run.base, hp = general.hp, lunges: Point[] = [];
  let lowest = hp;
  for (let frame = 0; frame < Math.round(seconds / STEP); frame++) {
    run.enemies = [enemy];
    for (const effect of advance(run, STEP))
      if (effect.kind === "lunge" && effect.target === enemy.id) lunges.push({ x: effect.x, y: effect.y });
    lowest = Math.min(lowest, general.hp);
  }
  return { keepLost: keep - run.base, generalLost: hp - lowest, lunges };
}

const besideKeep = (general: Point) => () => ({ enemy: { x: CENTER.x, y: CENTER.y - 20 }, general });
const insideGate = (asideOfPath: number) => (wall: Rect) =>
  ({ enemy: { x: CENTER.x, y: wall.top + 10 }, general: { x: CENTER.x + asideOfPath, y: wall.top + 10 + 44 } });

test("a breached enemy beside the keep strikes it while a general stands 60 px away", () => {
  const seen = watch(breach(besideKeep({ x: CENTER.x + 60, y: CENTER.y })), 10);

  expect(seen.keepLost).toBeGreaterThan(0);
});

test("a breached gunner with the keep in range walks to it instead of shooting a general 60 px away", () => {
  const seen = watch(breach(besideKeep({ x: CENTER.x + 60, y: CENTER.y }), true), 10);

  expect(seen.generalLost).toBe(0);
  expect(seen.keepLost).toBeGreaterThan(0);
});

test("a breached enemy still fights a general standing 20 px from the keep", () => {
  const seen = watch(breach(besideKeep({ x: CENTER.x + 20, y: CENTER.y })), 10);

  expect(seen.generalLost).toBeGreaterThan(0);
});

test("a breached enemy lunges first at a general standing on its path to the keep", () => {
  const scene = breach(insideGate(0));

  const seen = watch(scene, 10);

  expect(seen.lunges[0]).toEqual({ x: scene.general.x, y: scene.general.y });
});

test("a breached enemy passes a general standing 60 px beside its path and strikes the keep", () => {
  const seen = watch(breach(insideGate(60)), 10);

  expect(seen.lunges).toEqual([]);
  expect(seen.keepLost).toBeGreaterThan(0);
});
