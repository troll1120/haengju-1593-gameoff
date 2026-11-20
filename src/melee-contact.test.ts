import { describe, expect, test } from "bun:test";
import { freshMeta } from "./meta";
import { freshBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { activeBphEffects } from "./bph-upgrades";
import { bphConsumers, bphFxContext, bindBphConsumers, dispatchBphEffects } from "./bph-fx-dispatch";
import { advance, soldier, unitAt } from "./rules";
import { CENTER, setFieldSize } from "./geometry";
import type { Enemy, Run, Unit } from "./rules";

/** Owner DM 1794922680: melee troops hit only once their sprites visibly touch. */
function battle(): { run: Run; unit: Unit; enemy: Enemy } {
  setFieldSize(370, 800);
  const meta = freshMeta(), save = freshBphSave(7);
  meta.bph = save;
  const run = createBphRun(meta, { seed: 7, general: "권율", upgrades: activeBphEffects(save), startBattle: false });
  const context = bphFxContext(run);
  if (!run.bph || !context) throw new Error("expected a bph run");
  bindBphConsumers(context, bphConsumers(), false);
  dispatchBphEffects(run, { kind: "run-start" });
  run.squads[0].hp = run.squads[0].maxHp = 1e9;
  run.squads[0].clock = run.squads[0].skillClock = 1e9;
  const unit = { ...soldier("spearman", 1, { x: 150, y: 260 }), hp: 1e9, maxHp: 1e9,
    bph: { profileId: "Hero1_Squire", birthProfileId: "Hero1_Squire", packId: "Pack1_Basic",
      foil: false, giant: false, kills: 0, stage: 0, resultId: null, parentId: null, lifeId: 1, cause: "pack" as const } };
  run.squads[0].soldiers = [unit];
  const template = run.enemies[0];
  const enemy: Enemy = { ...template, id: run.nextId++, kind: "yari", x: 250, y: 260, hp: 1e9, maxHp: 1e9,
    speed: 0, elite: false, boss: false, wave: false, ladder: false, breach: undefined,
    goalX: 250, goalY: 260, clock: 0, strikeAt: 0, prey: [0, 0], stun: 0, burn: 0, burnClock: 0,
    skillClock: 1e6, casting: 0, casts: 0, bphProfileId: undefined, shielded: false,
    cargo: undefined, shipArt: undefined, bossArt: undefined, pattern: undefined };
  run.enemies.splice(0, run.enemies.length, enemy);
  run.shots.splice(0);
  advance(run, .05);
  for (const foe of [...run.enemies]) if (foe.id !== enemy.id) run.enemies.splice(run.enemies.indexOf(foe), 1);
  unit.hp = unit.maxHp;
  enemy.hp = enemy.maxHp = 1e9;
  enemy.strikeAt = 0;
  // The settling step above sees the unit 100px away and opens a chase; each test places both bodies afresh.
  delete enemy.pursuit;
  return { run, unit, enemy };
}

describe("melee contact (owner DM 1794922680)", () => {
  test("an enemy footman no longer wounds a ground soldier from wall-reach distance", () => {
    const { run, enemy } = battle();
    enemy.prey = [0, 0];
    enemy.strikeAt = run.time + .01;
    const before = unitAt(run, [0, 0])!.hp;
    advance(run, .05);
    expect(unitAt(run, [0, 0])!.hp).toBe(before);
  });

  test("an enemy footman walks to the soldier and wounds them at body contact", () => {
    const { run, unit, enemy } = battle();
    enemy.speed = 60;
    let struck = false;
    for (let step = 0; step < 400 && !struck; step++) {
      const before = unit.hp;
      advance(run, .05);
      for (const foe of [...run.enemies]) if (foe.id !== enemy.id) run.enemies.splice(run.enemies.indexOf(foe), 1);
      struck = unit.hp < before;
      if (struck) expect(Math.hypot(unit.x - enemy.x, unit.y - enemy.y)).toBeLessThanOrEqual(32);
    }
    expect(struck).toBe(true);
  });

  test("a perched wall archer is still struck from the foot of the wall", () => {
    const { run, unit, enemy } = battle();
    unit.kind = "archer"; unit.bph = undefined;
    unit.perch = 0;
    unit.x = CENTER.x; unit.y = 460;
    enemy.x = CENTER.x; enemy.y = 526;
    enemy.prey = [0, 0];
    enemy.strikeAt = run.time + .01;
    const before = unit.hp;
    advance(run, .05);
    expect(unit.hp).toBeLessThan(before);
  });

  test("a melee strike misses a target beyond reach and fires no shot", () => {
    const { run, unit, enemy } = battle();
    enemy.x = 150 + 29.6 + 6;
    unit.strikeAt = run.time + .01;
    unit.aim = enemy.id;
    unit.clock = 100;
    const before = enemy.hp;
    advance(run, .05);
    expect(enemy.hp).toBe(before);
    expect(run.shots).toHaveLength(0);
  });
});
