import type { BphEffect } from "./bph-contract";
import type { BphGeneral } from "./bph-commanders";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { bphSurvivalPlan } from "./bph-survival";
import { advance } from "./rules";
import type { Effect, Enemy, Run } from "./rules";

export function chaosArena(general: BphGeneral, level: number): Run {
  const upgrades: BphEffect[] = Array.from({ length: level }, (_, index) => ({
    nodeId: `fixture:${index}`, type: "HeroAttackPower", value: .02,
    effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
    targets: { placementId: `fixture:${index}`, nodeType: "0", targetClass: "0" },
  }));
  const run = createBphRun(freshMeta(), { seed: 144, general, upgrades, startBattle: false });
  // This fixture supplies its own targets; continuous-wave integration has separate tests.
  if (run.bph?.survival) run.bph.survival.cursor = bphSurvivalPlan(run.bph.waveId).length;
  run.time = 100; run.weather = "맑음";
  run.commandClock = run.arrowClock = run.hwachaClock = 1e9;
  const squad = run.squads[0];
  squad.x = squad.homeX = squad.targetX = 195;
  squad.y = squad.homeY = squad.targetY = 100;
  squad.clock = 1e9; squad.skillClock = 0; squad.hurtAt = run.time;
  return run;
}

export function chaosEnemy(run: Run, x: number, y: number): Enemy {
  const enemy: Enemy = { id: run.nextId++, kind: "yari", direction: "위", x, y,
    hp: 10000, maxHp: 10000, speed: 0, elite: false, boss: false, goalX: x, goalY: y,
    clock: 1e9, strikeAt: 0, prey: null, stun: 0, burn: 0, burnClock: 0, skillClock: 1e9, casting: 0, casts: 0 };
  run.enemies.push(enemy);
  return enemy;
}

export function chaosTicks(run: Run, count: number): Effect[] {
  const effects: Effect[] = [];
  for (let tick = 0; tick < count; tick++) effects.push(...advance(run, 1 / 30));
  return effects;
}

export function chaosFire(run: Run, target: Enemy): Effect[] {
  const squad = run.squads[0];
  squad.aim = target.id; squad.strikeAt = run.time;
  const effects = advance(run, 1 / 30);
  squad.clock = 1e9;
  return effects;
}

/** Expected design rows expanded to every purchase, independent of production lookup. */
export const CHAOS_TEST_LEVELS = Array.from({ length: 20 }, (_, index) => index + 1);
