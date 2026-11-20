import { expect, test } from "bun:test";
import { ALLY_TEXTURES, allyAnimation, allyArt } from "./ally-animation";
import { advance, createRun, useSkill } from "./rules";
import { fortRect, gapToRect, setFieldSize } from "./geometry";
import { RIVER_FIRST_AT, RIVER_SECONDS, riverLane } from "./river";

const moving = { moving: true, attacking: false, hurt: false, down: false, direction: "side" as const };
for (const base of ALLY_TEXTURES) test(`${base} plays walk, attack, hit-flash and death frames`, () => {
  const walk = allyAnimation(base, moving);
  const attack = allyAnimation(base, { ...moving, attacking: true });
  const hit = allyAnimation(base, { ...moving, attacking: true, hurt: true });
  const death = allyAnimation(base, { ...moving, attacking: true, hurt: true, down: true });
  expect(walk.key.endsWith("-walk")).toBe(true);
  expect(attack.key.endsWith(base === "song_sanghyeon" ? "-throw_attack" : "-attack")).toBe(true);
  expect(hit.key.endsWith("-hit")).toBe(true);
  if (!allyArt(base).full) expect(hit.frames.every(frame => frame.key.endsWith("-hurt"))).toBe(true);
  expect(death.key.endsWith("-death")).toBe(true); expect(death.repeat).toBe(0);
  for (const animation of [walk, attack, hit, death])
    expect(new Set(animation.frames.map(frame => `${frame.key}:${frame.frame ?? 0}`)).size).toBeGreaterThan(1);
});
function field(time: number) {
  const run = createRun(42); run.time = time; run.enemies = []; run.xp = -1e9; run.spawnBudget = -1e9;
  run.nextElite = run.nextBoss = run.nextWave = run.nextRiverWave = 1e9;
  for (const squad of run.squads) {
    squad.clock = squad.skillClock = 1e9;
    for (const unit of squad.soldiers) unit.clock = 1e9;
  }
  return run;
}
test("later regular guards and cavalry never warn or cast skills", () => {
  for (const [time, kind] of [[211, "guard"], [151, "cavalry"]] as const) {
    const run = field(time);
    // This contract's original movement threshold is for dry ground; rain has its own speed tests.
    run.weather = "맑음";
    advance(run, .05);
    // The new ladder draw can route this regular spawn onto a southern transport.
    const newType = run.enemies.flatMap(enemy => enemy.cargo ?? [enemy]).find(enemy => enemy.kind === kind && !enemy.ladder);
    expect(newType).toBeDefined();
    if (!newType) throw new Error("The newly unlocked regular enemy must spawn");
    if (kind === "guard") expect(newType.shielded).toBe(true);
    run.enemies = [newType];
    {
      const squad = run.squads[0];
      newType.x = squad.x + 120; newType.y = squad.y + 40; newType.skillClock = 0;
      advance(run, .05);
      expect(run.telegraphs.some(mark => mark.owner === newType.id)).toBe(false);
      const before = { x: newType.x, y: newType.y };
      for (let i = 0; i < 25; i++) advance(run, .05);
      expect(newType.casts).toBe(0);
      expect(Math.hypot(newType.x - before.x, newType.y - before.y)).toBeGreaterThan(20);
    }
  }
});
test("a guard blocks a real arrow and a general skill breaks the shield", () => {
  const run = field(211); advance(run, .05);
  const guard = run.enemies.flatMap(enemy => enemy.cargo ?? [enemy]).find(enemy => enemy.kind === "guard" && !enemy.ladder);
  if (!guard) throw new Error("Guard fixture did not spawn");
  run.enemies = [guard]; guard.x = 40; guard.y = 40;
  const hp = guard.hp;
  run.shots.push({ id: run.nextId++, kind: "arrow", x: 40, y: 40, toX: 40, toY: 40, speed: 1000, target: guard.id,
    prey: null, damage: 100, critical: false, by: "weapon", splash: 0, pierce: 0, from: 0 });
  advance(run, .05);
  expect(guard.hp).toBe(hp);
  run.enemies = [guard]; run.squads[0].skillClock = 0; useSkill(run, 0);
  expect(guard.shielded).toBe(false); expect(guard.hp).toBeLessThan(hp);
});
test("river waves start at three minutes, fire guns from the naval lane and expire after forty-five seconds", () => {
  setFieldSize(370, 800);
  const run = field(RIVER_FIRST_AT - .05); run.nextRiverWave = RIVER_FIRST_AT;
  advance(run, .1);
  // Troop transports can arrive on this tick too; this contract owns warships.
  const ships = run.enemies.filter(enemy => enemy.kind === "ship" && !enemy.cargo);
  expect(ships.map(ship => ship.shipArt)).toEqual(["atakebune", "sekibune"]);
  for (const ship of ships) {
    expect(ship.y).toBe(riverLane());
    expect(ship.speed).toBe(12);
    expect(gapToRect(fortRect(run.fort), ship)).toBeGreaterThan(150);
  }
  expect(run.nextRiverWave).toBe(420);
  for (const ship of ships) ship.skillClock = 0;
  advance(run, .05);
  expect(run.telegraphs.filter(mark => ships.some(ship => ship.id === mark.owner))).toHaveLength(0);
  const wall = run.wall;
  for (const ship of ships) ship.skillClock = 0;
  for (let i = 0; i < 26; i++) advance(run, .05);
  expect(run.wall).toBeLessThan(wall);
  run.time = RIVER_FIRST_AT + RIVER_SECONDS + 1;
  advance(run, .05);
  expect(run.enemies.some(enemy => ships.some(ship => ship.id === enemy.id))).toBe(false);
  setFieldSize(390, 650);
});
test("the opening twenty seconds contain no new late-wave threats", () => {
  const run = createRun(42);
  for (let i = 0; i < 400; i++) advance(run, .05);
  const troops = run.enemies.flatMap(enemy => enemy.cargo ?? [enemy]);
  expect(troops.every(enemy => !["guard", "ship"].includes(enemy.kind))).toBe(true);
});
test("encirclement drafts remain unshielded samurai after guard recruitment unlocks", () => {
  const run = field(419.95); run.nextWave = 420;
  advance(run, .1);
  const wave = run.enemies.flatMap(enemy => enemy.cargo ?? [enemy]).filter(enemy => enemy.wave);
  expect(wave).toHaveLength(48);
  expect(wave.every(enemy => enemy.kind === "samurai" && !enemy.shielded)).toBe(true);
});
