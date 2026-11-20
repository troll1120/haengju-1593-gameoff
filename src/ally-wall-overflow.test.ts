import { expect, test } from "bun:test";
import { marchFixture } from "../scripts/ally-march-fixture";
import { addBphProfile } from "./bph-combat";
import { CENTER, contains, fortRect, HEIGHT, setFieldSize, TILE, WIDTH } from "./geometry";
import { advance } from "./rules";

test("surplus ranged soldiers fight from the wall and leave the courtyard empty", () => {
  const width = WIDTH, height = HEIGHT;
  try {
    const { run, soldiers, enemy } = marchFixture("crowd", 370);
    for (let i = 0; i < 6; i++) addBphProfile(run, {
      profileId: "Hero1_Archer", copies: 8, foil: false, discovered: false,
    }, { packId: "Pack1_Basic" });
    const wall = fortRect(run.fort), courtyard = fortRect(run.fort, -TILE);
    Object.assign(enemy, { x: CENTER.x, y: wall.top - 28, goalX: CENTER.x, goalY: wall.top - 28 });
    for (const unit of soldiers) Object.assign(unit, { x: CENTER.x, y: CENTER.y, emerging: true });
    for (let step = 0; step < 300; step++) advance(run, 1 / 30);
    const alive = soldiers.filter(unit => unit.hp > 0);
    const ranged = alive.filter(unit => unit.kind === "archer");
    expect(ranged.length).toBe(48);
    expect(alive.filter(unit => contains(courtyard, unit))).toHaveLength(0);
    expect(ranged.every(unit => unit.perch !== undefined && contains(wall, unit))).toBe(true);
    expect(new Set(ranged.map(unit => unit.perch)).size).toBeLessThan(ranged.length);
    const shared = ranged.find(unit => unit.y < CENTER.y - TILE &&
      ranged.some(other => other !== unit && other.perch === unit.perch));
    if (!shared) throw new Error("Expected a shared north wall post");
    Object.assign(enemy, { x: shared.x, y: wall.top - 10, goalX: shared.x, goalY: wall.top - 10, hp: 1000 });
    const hp = enemy.hp;
    for (const unit of soldiers) Object.assign(unit, { clock: 1e9, strikeAt: 0 });
    shared.clock = 0;
    for (let step = 0; step < 90; step++) advance(run, 1 / 30);
    expect(enemy.hp).toBeLessThan(hp);
  } finally { setFieldSize(width, height); }
});
