import { bphStats } from "../src/bph-combat";
import type { Run } from "../src/rules";

/** Living profile units only; generals are listed separately. DPS excludes crit,
 * splash, skills and cooldown-zero profiles. EHP uses remaining HP against
 * independent block/reduction; immortal units never become JSON null/Infinity.
 */
export function observeSurvival(run: Run, cumulativeRecruits: number) {
  const units = run.squads.flatMap(squad => squad.soldiers).filter(unit => unit.hp > 0 && unit.bph);
  let baseAttackDps = 0, finiteEhp = 0, finiteMaxEhp = 0, infiniteEhpUnits = 0;
  for (const unit of units) {
    const stats = bphStats(unit, run);
    if (!stats) throw new TypeError("A profile unit must expose BPH stats");
    if (stats.cooldown > 0) baseAttackDps += stats.damage / stats.cooldown;
    const incoming = (1 - Math.min(1, Math.max(0, stats.blockChance)))
      * (1 - Math.min(1, Math.max(0, stats.damageReduction)));
    if (incoming === 0) infiniteEhpUnits++;
    else { finiteEhp += unit.hp / incoming; finiteMaxEhp += stats.hp / incoming; }
  }
  return {
    time: run.time, unitCount: units.length, baseAttackDps, finiteEhp, finiteMaxEhp, infiniteEhpUnits,
    generals: run.squads.map(squad => ({
      general: squad.general, hp: squad.hp, maxHp: squad.maxHp, down: squad.state === "down",
    })),
    coins: run.gold, cumulativeRecruits,
    pendingKillMastery: run.bph?.pendingMastery ?? 0,
    immediateMastery: run.bph?.save.resources.mastery ?? 0,
  };
}
