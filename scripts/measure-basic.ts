import { advance, createRun, GENERAL_CLASS, GENERALS, soldier } from "../src/rules";
import type { Enemy, General } from "../src/rules";
import { CENTER, guardPoint } from "../src/geometry";

// Controlled single-target probe: actual combat ticks, no skills or upgrades.
// A stationary durable target is returned to melee range after knockback.
function damage(general: General, hero: boolean): number {
  const run = createRun(1593), at = guardPoint(0, "아래", 36), squad = run.squads[0];
  squad.general = general; squad.x = squad.targetX = at.x; squad.y = squad.targetY = at.y;
  squad.soldiers = hero ? [] : [soldier(GENERAL_CLASS[general], 1, at)];
  if (!hero) squad.clock = 1e9;
  run.xp = -1e9; run.spawnBudget = -1e9; run.commandClock = 1e9;
  run.nextElite = run.nextBoss = run.nextWave = 1e9;
  const target: Enemy = {
    id: 500, kind: "yari", direction: "아래", x: at.x, y: at.y + 24,
    hp: 1e9, maxHp: 1e9, speed: 0, elite: false, boss: false,
    goalX: CENTER.x, goalY: at.y, clock: 1e9, strikeAt: 0, prey: null,
    stun: 0, burn: 0, burnClock: 0, skillClock: 1e9, casting: 0, casts: 0,
  };
  run.enemies = [target, ...Array.from({ length: 24 }, (_, i) => ({
    ...target, id: 501 + i, x: -1000 - i * 40, y: -1000,
  }))];
  for (let tick = 0; tick < 1200; tick++) {
    const unit = hero ? squad : squad.soldiers[0];
    target.x = unit.x; target.y = unit.y + 24;
    advance(run, .05);
  }
  return run.metrics.damage.squads[0] / run.time;
}

const rows = GENERALS.map(general => {
  const heroDps = damage(general, true), soldierDps = damage(general, false);
  return { general, soldier: GENERAL_CLASS[general], heroDps, soldierDps, ratio: heroDps / soldierDps };
});
console.log(JSON.stringify({ seconds: 60, target: "single durable target", skills: false, upgrades: false, rows }, null, 2));
if (rows.some(row => row.ratio < 4 || row.ratio > 6)) process.exitCode = 1;
