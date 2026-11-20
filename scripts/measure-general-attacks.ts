import { BPH_GENERALS } from "../src/bph-commanders";
import { chaosArena, chaosEnemy } from "../src/chaos-test-fixture";
import { advance } from "../src/rules";

// Saturated, stationary, immortal target: 30 Hz, 30 seconds, one deterministic seed (144).
// Count attack starts rather than projectiles or the second cut of a combo.
const seconds = 30, rows = [];
for (const general of BPH_GENERALS) {
  const run = chaosArena(general, 1), squad = run.squads[0];
  squad.clock = 0;
  // The unit-test fixture parks automatic specials; a real run starts their own clock.
  const specialTimer = Reflect.get(squad, "specialAttack");
  if (specialTimer) specialTimer.clock = .9;
  const target = chaosEnemy(run, squad.x + 26, squad.y);
  target.boss = true;
  let basic = 0, special = 0;
  for (let tick = 0; tick < seconds * 30; tick++) {
    target.hp = target.maxHp = 1e9;
    squad.hp = squad.maxHp;
    squad.x = squad.homeX = squad.targetX = 195;
    squad.y = squad.homeY = squad.targetY = 100;
    target.x = 221; target.y = 100;
    const effects = advance(run, 1 / 30);
    for (const effect of effects) if (effect.kind === "windup" && effect.index === -1) {
      // Hwang's scheduled second cut is part of one special attack, not a new attack.
      if (Math.abs(effect.value - .14) < 1e-9) continue;
      if (Reflect.get(effect, "mechanism") === "special") special++;
      else basic++;
    }
  }
  rows.push({ general, seconds, basicStarts: basic, basicPerSecond: basic / seconds,
    specialStarts: special, specialPerSecond: special / seconds });
}
console.log(JSON.stringify({ unit: "single seed 144; 30 simulated seconds at 30 Hz; starts/second; manual skill not pressed",
  rows }, null, 2));
