import { addBphProfile } from "../src/bph-combat";
import { deferFixtureBarracks } from "../src/bph-barracks-fixture";
import { createBphRun } from "../src/bph-session";
import { CENTER, distance, fortRect, setFieldSize } from "../src/geometry";
import { freshMeta } from "../src/meta";
import { advance, createRun } from "../src/rules";
import type { Enemy } from "../src/rules";

export type MarchCase = "far" | "crowd" | "idle" | "center";

/** Fixed seed, no reinforcements, immortal stationary foe: only walking/spacing changes. */
export function marchFixture(kind: MarchCase, width = 780) {
  setFieldSize(width, 844);
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] });
  deferFixtureBarracks(run);
  run.enemies = [];
  run.spawnBudget = run.xp = -1e9;
  run.nextElite = run.nextBoss = run.nextWave = run.nextRiverWave = 1e9;
  if (run.bph?.survival) {
    run.bph.survival.cursor = 1e9;
    run.bph.survival.nextDeparture = 1e9;
  }
  run.shieldUntil = 1e9;
  run.reflect = false;
  const squad = run.squads[0];
  squad.clock = squad.skillClock = 1e9;
  squad.x = CENTER.x; squad.y = CENTER.y;
  squad.state = "down"; squad.downUntil = 1e9;
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 8, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  addBphProfile(run, { profileId: "Hero1_Barbarian", copies: 8, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  const wall = fortRect(run.fort);
  const soldiers = squad.soldiers;
  soldiers.forEach((unit, i) => Object.assign(unit, {
    x: kind === "crowd" ? wall.right + 35 + i % 4 * 8 : wall.right + 32 + i % 4 * 18,
    y: CENTER.y - 45 + Math.floor(i / 4) * 24,
    emerging: false, clock: 1e9, strikeAt: 0,
  }));
  const at = { x: kind === "center" ? CENTER.x : kind === "far" ? Math.min(width - 42, wall.right + 190) : wall.right + 100,
    y: kind === "center" ? wall.top - 80 : CENTER.y };
  const enemy: Enemy = { ...createRun(144).enemies[0], ...at, id: run.nextId++, kind: "yari",
    hp: 1e9, maxHp: 1e9, speed: 0, elite: false, boss: false, wave: false,
    goalX: at.x, goalY: at.y, clock: 1e9, strikeAt: 0, prey: null, stun: 1e9, skillClock: 1e9 };
  run.enemies = kind === "idle" ? [] : kind === "center"
    ? [enemy, { ...enemy, id: run.nextId++, x: Math.max(42, wall.left - 190), y: CENTER.y, goalX: Math.max(42, wall.left - 190), goalY: CENTER.y }] : [enemy];
  return { run, soldiers, enemy };
}

export function measureMarch(kind: MarchCase, width = 780, seconds = 60, fps = 60) {
  const { run, soldiers, enemy } = marchFixture(kind, width);
  const previous = new Map(soldiers.map(unit => [unit.id, { x: unit.x, y: unit.y, sign: 0 }]));
  const rows = soldiers.map(unit => ({ id: unit.id, profile: unit.bph!.profileId,
    startX: unit.x, startY: unit.y, endX: unit.x, endY: unit.y,
    reversals: 0, backwardSteps: 0, traveled: 0, minEnemyGap: distance(unit, enemy), targetChanges: 0, quarry: unit.quarry, flank: unit.flank }));
  const initial = structuredClone(run);
  const frames: { time: number; soldiers: { id: number; x: number; y: number; quarry?: number }[] }[] = [];
  for (let step = 0; step < seconds * fps; step++) {
    advance(run, 1 / fps);
    soldiers.forEach((unit, index) => {
      const prev = previous.get(unit.id)!, row = rows[index], dx = unit.x - prev.x, dy = unit.y - prev.y;
      const sign = Math.abs(dx) >= .05 ? Math.sign(dx) : 0;
      if (sign && prev.sign && sign !== prev.sign) row.reversals++;
      if (sign) prev.sign = sign;
      if (dx < -.05) row.backwardSteps++;
      row.traveled += Math.hypot(dx, dy);
      row.minEnemyGap = Math.min(row.minEnemyGap, distance(unit, enemy));
      if (unit.quarry !== row.quarry) row.targetChanges++;
      row.quarry = unit.quarry; row.flank = unit.flank; row.endX = unit.x; row.endY = unit.y;
      prev.x = unit.x; prev.y = unit.y;
    });
    if (step % (fps / 10) === 0) frames.push({ time: run.time, soldiers: soldiers.map(unit => ({
      id: unit.id, x: unit.x, y: unit.y, quarry: unit.quarry,
    })) });
  }
  return { kind, width, seed: 144, seconds, dt: 1 / fps, thresholdPx: .05, rows, initial, frames,
    summary: { reversals: rows.reduce((sum, row) => sum + row.reversals, 0),
      backwardSteps: rows.reduce((sum, row) => sum + row.backwardSteps, 0),
      reachedEnemy: rows.filter(row => row.minEnemyGap <= 32).length,
      meanTravel: rows.reduce((sum, row) => sum + row.traveled, 0) / rows.length } };
}

if (import.meta.main) {
  const [label = "before", folder = "evidence", fps = "60"] = Bun.argv.slice(2);
  await import("node:fs/promises").then(fs => fs.mkdir(folder, { recursive: true }));
  for (const kind of ["far", "crowd", "idle"] as const) {
    const measurement = measureMarch(kind, 780, 60, Number(fps));
    await Bun.write(`${folder}/${label}-${kind}.json`, JSON.stringify(measurement));
    console.log(JSON.stringify({ label, kind, ...measurement.summary }));
  }
}
