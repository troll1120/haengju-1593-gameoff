import { expect, test } from "bun:test";
import type { BphEffect } from "./bph-contract";
import { createBphRun } from "./bph-session";
import { BPH_SMITHY, BPH_WALL_TIER_PLACEMENTS, bphSpearWallHit, bphWallTier, buyBphSmithyWall } from "./bph-smithy";
import { bphSurvivalPlan } from "./bph-survival";
import { infantryMultiplierAt } from "./bph-survival-data";
import { freshMeta } from "./meta";
import { advance } from "./rules";
import { HEIGHT, SIDES, WIDTH } from "./geometry";

const owned = (placementId: string): BphEffect => ({ nodeId: "SN_TowerHP", type: "BonfireMaxHP", value: 0,
  effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: { placementId } });
// A regular spearman fielded after files split three ways (3:00): the hit the tiers are counted in.
const late = bphSurvivalPlan("WaveChapter1").find(entry => entry.profileId === "Monster1_Caveling" && entry.at >= 180
  && !entry.boss && !entry.elite && !entry.rush && !entry.ladder)!;

function spearmanAtWall(tier: number) {
  const run = createBphRun(freshMeta(), { seed: 1593, general: "권율", upgrades: BPH_WALL_TIER_PLACEMENTS.map(owned) });
  run.gold = 1000;
  while (bphWallTier(run) < tier) if (!buyBphSmithyWall(run)) throw new Error(`Cannot reach wall tier ${tier}`);
  for (let frame = 0; frame < 60 && !run.enemies.length; frame++) advance(run, .05);
  const enemy = run.enemies[0], survival = run.bph!.survival!;
  if (enemy?.bphProfileId !== "Monster1_Caveling") throw new Error("Chapter 1 must open with a regular spearman");
  survival.damage[enemy.id] = { unit: late.unitDamage, castle: late.castleDamage / infantryMultiplierAt(late.at) };
  survival.cursor = bphSurvivalPlan(run.bph!.waveId).length;
  enemy.hp = enemy.maxHp = 1e9; enemy.x = enemy.goalX; enemy.y = enemy.goalY;
  return { run, enemy };
}

test.each(BPH_SMITHY.walls.map((wall, tier) => [tier, wall.hits] as const))(
  "one regular spearman breaks a tier-%i wall side on exactly hit %i", (tier, hits) => {
    const { run, enemy } = spearmanAtWall(tier);
    const hitValues: number[] = [];
    let broken: string | undefined;
    for (let frame = 0; frame < hits * 4 && !broken; frame++) {
      enemy.clock = 0; enemy.strikeAt = 0; enemy.skillClock = 1000; enemy.prey = null; enemy.pursuit = undefined;
      enemy.x = enemy.goalX; enemy.y = enemy.goalY; enemy.stun = 0;
      for (const squad of run.squads) { squad.soldiers = []; squad.x = WIDTH / 2; squad.y = HEIGHT - 10; }
      run.enemies = [enemy];
      for (const effect of advance(run, .05)) if (effect.kind === "wall" && effect.target === enemy.id) hitValues.push(effect.value);
      broken = SIDES.find(side => run.walls[side] <= 0);
    }
    expect(hitValues[0]).toBeCloseTo(bphSpearWallHit(), 12);
    expect(broken).toBeDefined();
    expect(hitValues.length).toBe(hits);
  });
