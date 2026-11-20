import type { BphEffect } from "./bph-contract";
import type { BphGeneral } from "./bph-commanders";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { bphSurvivalPlan } from "./bph-survival";
import { advance } from "./rules";
import { chaosState } from "./chaos-state";
import { advanceSurvivalGeneralLevel } from "./chaos-growth";
import { CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import type { Effect, Enemy, Run } from "./rules";

/** Enter an interval with time left to play, including Lv10, which the free clock reaches at victory. */
export function setSurvivalFixtureLevel(run: Run, level: number): void {
  if (!run.bph?.survival) throw new Error("Expected survival fixture");
  if (level >= 10) run.bph.save.generalGrowthSpeed = 5;
  const ranked = run.bph.save.generalGrowthSpeed === 5;
  run.time = (Math.max(level, 1) - 1) * (ranked ? 600 / 19 : 100);
  chaosState(run);
  advanceSurvivalGeneralLevel(run);
}

export function chaosArena(general: BphGeneral, level: number): Run {
  const upgrades: BphEffect[] = Array.from({ length: level }, (_, index) => ({
    nodeId: `fixture:${index}`, type: "HeroAttackPower", value: .02,
    effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
    targets: { placementId: `fixture:${index}`, nodeType: "0", targetClass: "0" },
  }));
  const run = createBphRun(freshMeta(), { seed: 144, general, upgrades, startBattle: false });
  // These arenas supply their own targets. Boss escorts have a separate cursor.
  pauseArenaWaves(run);
  // Survival generals grow in the run; the fixture stands the general at the asked level (Lv1 when zero).
  setSurvivalFixtureLevel(run, level);
  const state = run.chaos;
  if (state && level > 1) {
    // Standing there from the start, his first passive periods are this level's, as chaosState allocates them at Lv1.
    if (state.mods.general === "이순신") state.nextFleetTick = state.mods.every;
    if (state.general === "김시민") state.nextBeltTick = CHAOS_RULES.skills.cannon.passiveEvery[chaosSkillBand(state.level)];
  }
  if (level <= 1) run.time = 84;
  run.weather = "맑음";
  run.commandClock = run.arrowClock = run.hwachaClock = 1e9;
  const squad = run.squads[0];
  squad.x = squad.homeX = squad.targetX = 195;
  squad.y = squad.homeY = squad.targetY = 100;
  squad.clock = 1e9; squad.skillClock = 0; squad.hurtAt = run.time;
  // These fixtures drive one mechanism at a time. Integration tests explicitly arm the automatic special.
  squad.specialAttack = { clock: 1e9, strikeAt: 0, aim: 0 };
  return run;
}

export function pauseArenaWaves(run: Run): void {
  if (!run.bph?.survival) throw new Error("Expected survival fixture");
  run.bph.survival.cursor = bphSurvivalPlan(run.bph.waveId).length;
  run.bph.fx.counters.commanderEscortCursor = Number.MAX_SAFE_INTEGER;
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

export function chaosBasic(run: Run, target: Enemy): Effect[] {
  const squad = run.squads[0];
  // Force a new attack's release, not the previous Hwang attack's pending second cut.
  squad.combo = undefined;
  squad.aim = target.id; squad.strikeAt = run.time;
  const effects = advance(run, 1 / 30);
  squad.clock = 1e9;
  return effects;
}

/** The authored attack that drives army hooks now belongs to the independent special slot. */
export function chaosFire(run: Run, target: Enemy): Effect[] {
  return chaosSpecial(run, target);
}

export function chaosSpecial(run: Run, target: Enemy): Effect[] {
  const squad = run.squads[0];
  squad.specialAttack = { clock: 1e9, strikeAt: run.time, aim: target.id };
  return advance(run, 1 / 30);
}

/** Expected design rows expanded to every purchase, independent of production lookup. */
export const CHAOS_TEST_LEVELS = Array.from({ length: 20 }, (_, index) => index + 1);
