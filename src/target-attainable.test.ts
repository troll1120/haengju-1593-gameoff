import { afterEach, expect, test } from "bun:test";
import { marchFixture } from "../scripts/ally-march-fixture";
import { standFor } from "./ally-reach";
import { distance, fortRect, HEIGHT, setFieldSize, WIDTH } from "./geometry";
import { advance, ARMS, SQUAD_MARGIN, type Enemy } from "./rules";

const field = { width: WIDTH, height: HEIGHT };
afterEach(() => setFieldSize(field.width, field.height));

/** Owner screenshot F0CK17U6FN3 (seed 144, 정발, t=90): a gunner stands on the west wall face. On the line toward the
 *  general the wall margin pushes his approach point back onto himself, 47 px off against a 46 px blade. */
function cornerGeneral() {
  const { run, soldiers, enemy } = marchFixture("idle", 390);
  const wall = fortRect(run.fort);
  for (const unit of soldiers) { unit.hp = 0; unit.downUntil = 1e9; }
  const pinned: Enemy = { ...enemy, kind: "teppo", id: run.nextId++, x: wall.left, y: wall.bottom - 25,
    goalX: wall.left - 60, goalY: wall.bottom - 25 };
  const open: Enemy = { ...enemy, id: run.nextId++, x: wall.left + 65, y: wall.bottom + 50, goalX: wall.left + 65, goalY: wall.bottom + 50 };
  run.enemies = [pinned, open];
  const squad = run.squads[0];
  const at = { x: wall.left, y: wall.bottom + 22 };
  Object.assign(squad, { state: "guard", downUntil: 0, hp: squad.maxHp, clock: 0, strikeAt: 0, aim: 0, stay: true,
    specialAttack: { clock: 1e9, strikeAt: 0, aim: 0 }, x: at.x, y: at.y, targetX: at.x, targetY: at.y, homeX: at.x, homeY: at.y });
  return { run, squad, pinned, open, wall };
}

test("the wall-face gunner has a stand point within the blade on the far side of the corner", () => {
  const { run, squad, pinned, wall } = cornerGeneral();
  const stand = standFor(run.fort, squad, pinned, { stop: ARMS.general.reach * .6, strike: ARMS.general.reach, margin: SQUAD_MARGIN });
  expect(stand).toBeDefined();
  expect(distance(stand!.stand, pinned)).toBeLessThan(ARMS.general.reach);
  expect(stand!.stand.x).toBeLessThan(wall.left);
});

test("no stand point exists for a foe deep in the stone band", () => {
  const { run, squad, wall } = cornerGeneral();
  const buried = { x: wall.left + 30, y: wall.bottom - 40 };
  expect(standFor(run.fort, squad, buried, { stop: 6, strike: 10, margin: SQUAD_MARGIN })).toBeUndefined();
});

test("a general beside the wall-face gunner lands a blow within a second instead of standing still", () => {
  const { run, squad, pinned, open } = cornerGeneral();
  let struck: number | undefined;
  for (let step = 0; step < 30 && struck === undefined; step++)
    if (advance(run, 1 / 30).some(effect => effect.kind === "windup" && effect.index === -1)) struck = squad.aim;
  expect([pinned.id, open.id]).toContain(struck!);
  expect(distance(squad, run.enemies.find(enemy => enemy.id === struck)!)).toBeLessThan(ARMS.general.reach);
});

test("a soldier under the wall corner walks round to hit a gunner on the wall face", () => {
  const { run, soldiers, enemy } = marchFixture("idle", 390);
  const wall = fortRect(run.fort), unit = soldiers[0];
  for (const other of [...soldiers.slice(1), ...run.squads]) { other.hp = 0; other.downUntil = 1e9; }
  const pinned: Enemy = { ...enemy, kind: "teppo", speed: 0, x: wall.left, y: wall.bottom - 25, goalX: wall.left - 60, goalY: wall.bottom - 25 };
  run.enemies = [pinned];
  Object.assign(unit, { x: wall.left, y: wall.bottom + 12, emerging: false, clock: 0, strikeAt: 0, quarry: pinned.id });
  const hp = pinned.hp;
  for (let step = 0; step < 60 && pinned.hp === hp; step++) advance(run, 1 / 30);
  expect(pinned.hp).toBeLessThan(hp);
});
