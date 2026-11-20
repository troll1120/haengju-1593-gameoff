import { expect, test } from "bun:test";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { addBphProfile } from "./bph-combat";
import { advance } from "./rules";
import { buildings } from "./fortification";
import { CENTER } from "./geometry";
import type { Enemy, Run, Unit } from "./rules";

function openingCaveling(): { run: Run; foe: Enemy } {
  const run = createBphRun(freshMeta(), { seed: 1, general: "권율", upgrades: [] });
  for (let i = 0; i < 30 * 60 && !run.enemies.some(enemy => enemy.bphProfileId === "Monster1_Caveling"); i++) advance(run, 1 / 30);
  const foe = run.enemies.find(enemy => enemy.bphProfileId === "Monster1_Caveling");
  if (!foe) throw new Error("no opening Caveling");
  expect(run.time).toBeLessThan(60);
  Object.assign(foe, { hp: 1e9, maxHp: 1e9, speed: 0, stun: 0 });
  run.enemies = [foe];
  return { run, foe };
}

function landedHitsUntilDeath(run: Run, foe: Enemy, unit: Unit, index: number): number[] {
  const hpAfterHit: number[] = [];
  for (let i = 0; i < 30 * 600 && unit.hp > 0; i++) {
    Object.assign(foe, { x: unit.x + 10, y: unit.y, goalX: unit.x + 10, goalY: unit.y });
    const effects = advance(run, 1 / 30);
    run.enemies = run.enemies.filter(enemy => enemy.id === foe.id);
    for (const effect of effects) if (effect.kind === "hurt" && effect.target === foe.id && effect.index === index) hpAfterHit.push(unit.hp);
  }
  return hpAfterHit;
}

test("an opening ordinary soldier fells a fresh general on exactly the 50th landed hit", () => {
  const { run, foe } = openingCaveling();
  const general = run.squads[0];
  expect(general.maxHp).toBe(1265);
  general.hp = general.maxHp;
  const hits = landedHitsUntilDeath(run, foe, general, -1);
  expect(hits).toHaveLength(50);
  expect(hits[48]).toBeGreaterThan(0);
  expect(hits[49]).toBe(0);
});

test("an opening spear soldier fells the fresh central tent barracks on exactly the 10th landed hit", () => {
  const { run, foe } = openingCaveling();
  expect(foe.kind).toBe("yari");
  expect(run.base).toBe(run.maxBase);
  run.walls.아래 = 0;
  for (const squad of run.squads) Object.assign(squad, { x: CENTER.x + 400, y: CENTER.y - 400, soldiers: [] });
  const at = { x: CENTER.x, y: buildings().base.y + 1 }, keepAfterHit: number[] = [];
  for (let i = 0; i < 30 * 600 && run.base > 0; i++) {
    Object.assign(foe, at, { breach: "아래", ladder: false, goalX: at.x, goalY: at.y });
    delete foe.pursuit;
    const before = run.base;
    advance(run, 1 / 30);
    run.enemies = run.enemies.filter(enemy => enemy.id === foe.id);
    if (run.base < before) keepAfterHit.push(run.base);
  }
  expect(keepAfterHit).toHaveLength(10);
  expect(keepAfterHit[8]).toBeGreaterThan(0);
  expect(keepAfterHit[9]).toBe(0);
});

test("an opening ordinary soldier fells a fresh spearman on exactly the 10th landed hit", () => {
  const { run, foe } = openingCaveling();
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  const squad = run.squads[0], spearman = squad.soldiers.find(unit => unit.kind === "spearman")!;
  expect(spearman.maxHp).toBe(4);
  Object.assign(spearman, { emerging: false });
  Object.assign(squad, { x: spearman.x + 400, y: spearman.y + 400 });
  const hits = landedHitsUntilDeath(run, foe, spearman, squad.soldiers.indexOf(spearman));
  expect(hits).toHaveLength(10);
  expect(hits[8]).toBeGreaterThan(0);
  expect(hits[9]).toBe(0);
});
