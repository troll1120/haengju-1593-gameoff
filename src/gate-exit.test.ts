import { expect, test } from "bun:test";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { addBphProfile } from "./bph-combat";
import { advance, createRun } from "./rules";
import { CENTER, fortRect, setFieldSize } from "./geometry";

for (const side of ["north", "west", "east", "south"] as const) {
  test(`all eight recruits clear the south doorway within four seconds from ${side}`, () => {
    setFieldSize(370, 800);
    try {
      const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] });
      const court = fortRect(0, -32), wall = fortRect(0);
      const positions = {
        north: { x: CENTER.x, y: court.top + 1 },
        west: { x: court.left + 1, y: CENTER.y },
        east: { x: court.right - 1, y: CENTER.y },
        south: { x: CENTER.x, y: court.bottom - 1 },
      };
      addBphProfile(run, { profileId: "Hero1_Squire", copies: 8, foil: false, discovered: false },
        { packId: "Pack1_Basic", position: positions[side] });
      const enemy = { ...createRun(4).enemies[0], id: 999, x: CENTER.x, y: wall.bottom + 50,
        hp: 1e9, maxHp: 1e9, speed: 0, clock: 1e9, skillClock: 1e9 };
      for (let tick = 0; tick < 120; tick++) {
        run.enemies = [enemy];
        advance(run, 1 / 30);
      }
      expect(run.squads[0].soldiers).toHaveLength(8);
      for (const unit of run.squads[0].soldiers) {
        expect(unit.y).toBeGreaterThanOrEqual(wall.bottom + 24);
        expect(unit.emerging).toBe(false);
      }
    } finally { setFieldSize(390, 650); }
  });
}

for (const side of ["west", "east"] as const) {
  test(`recruits in the courtyard leave through the ${side} gate toward an enemy on that side, never by the south gate`, () => {
    setFieldSize(370, 800);
    try {
      const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] });
      const court = fortRect(0, -32), wall = fortRect(0), sign = side === "east" ? 1 : -1;
      addBphProfile(run, { profileId: "Hero1_Squire", copies: 8, foil: false, discovered: false },
        { packId: "Pack1_Basic", position: { x: CENTER.x, y: CENTER.y } });
      const enemy = { ...createRun(4).enemies[0], id: 999, x: CENTER.x + sign * (wall.right - CENTER.x + 50), y: CENTER.y,
        hp: 1e9, maxHp: 1e9, speed: 0, clock: 1e9, skillClock: 1e9 };
      let southward = 0;
      for (let tick = 0; tick < 120; tick++) {
        run.enemies = [enemy];
        advance(run, 1 / 30);
        southward += run.squads[0].soldiers.filter(unit => unit.y > court.bottom).length;
      }
      expect(southward).toBe(0);
      for (const unit of run.squads[0].soldiers) expect(sign * (unit.x - CENTER.x)).toBeGreaterThan(wall.right - CENTER.x);
    } finally { setFieldSize(390, 650); }
  });
}
