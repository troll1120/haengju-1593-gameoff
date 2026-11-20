import type { BphEffectConsumer, BphFxContext, BphMonster } from "./bph-contract";
import { BPH_SCALE } from "./bph-combat";
import { BPH_MONSTERS } from "./bph-data";
import { BPH_PLACEMENTS, bphPlacementIsUpgrade } from "./bph-upgrades";
import type { BphSpawn, BphWaveInterval } from "./bph-waves";

/** Original Rift_Chaos links WaveRiftChaos to sharedassets1.assets:3218. */
function riftUpgradeCount(context: BphFxContext): number {
  if (context.run.bph?.waveId !== "WaveRiftChaos") return 0;
  return [...new Set(context.save.purchasedPlacements)].filter(id =>
    BPH_PLACEMENTS.get(id)?.gridId === "_SkillTreeChaos" && bphPlacementIsUpgrade(id)).length;
}

/** Passive projections never spend RNG or mutate the imported monster table. */
export function bphEnemyStats(context: BphFxContext, spawn: Pick<BphSpawn, "profileId">): BphMonster {
  const base = BPH_MONSTERS[spawn.profileId];
  let hpBonus = 0, attackBonus = 0, attackActive = false;
  for (const effect of context.effects) {
    if (effect.type === "MonsterMaxHP") hpBonus += effect.value;
    if (effect.type === "MonsterAttackPower") { attackBonus += effect.value; attackActive = true; }
  }
  const damage = base.damage * Math.max(0.01, 1 + attackBonus);
  return { ...base, hp: base.hp * Math.max(0.01, 1 + hpBonus), damage,
    // Original ResolveTowerDamage preserves a positive authored override.
    // Without an active attack effect, keep even legacy zero overrides byte-identical to W0.
    towerDamage: attackActive && base.towerDamage <= 0 ? damage : base.towerDamage };
}

/** advance increments run.time first. Survival owns its optional projected phase;
 * original rift waves retain their existing effects cursor.
 */
export function effectiveWaveInterval(context: BphFxContext, dt: number): BphWaveInterval {
  let speedBonus = 0, countMultiplier = 1;
  for (const effect of context.effects) {
    if (effect.type === "MonsterSpawnSpeed") speedBonus += effect.value;
    if (effect.type === "MonsterSpawnCountMultiplier") countMultiplier *= Math.max(0, effect.value);
    if (effect.type === "WaveSpeedPerRiftUpgrades")
      speedBonus += Math.floor(riftUpgradeCount(context) / Math.max(1, Math.round(effect.effectPower))) * effect.value;
  }
  const counters = context.state.counters;
  const director = context.run.bph?.survival;
  const projection = director?.projection;
  const previousThrough = director ? projection?.through : counters["enemies:through"];
  const speed = Math.max(0.1, 1 + speedBonus);
  if (speed === 1 && countMultiplier === 1 && previousThrough === undefined)
    return { after: context.run.time - dt, through: context.run.time };
  if (projection?.tick === context.run.time)
    return { after: projection.after, through: projection.through, countMultiplier: projection.countMultiplier };
  if (!director && counters["enemies:tick"] === context.run.time)
    return { after: counters["enemies:after"], through: counters["enemies:through"],
      countMultiplier: counters["enemies:count"] };
  const after = previousThrough ?? context.run.time - dt;
  const through = after + dt * speed;
  if (director) director.projection = { after, through, countMultiplier, tick: context.run.time };
  else {
    counters["enemies:after"] = after;
    counters["enemies:through"] = through;
    counters["enemies:tick"] = context.run.time;
    counters["enemies:count"] = countMultiplier;
  }
  return { after, through, countMultiplier };
}

/** Wave kinds project on step; HP projects once from the immutable authored profile. */
export const ENEMY_CONSUMERS: readonly BphEffectConsumer[] = [{
  id: "enemies",
  kinds: ["MonsterSpawnSpeed", "MonsterSpawnCountMultiplier", "MonsterMaxHP",
    "MonsterAttackPower", "WaveSpeedPerRiftUpgrades"],
  consume(context, event, effect) {
    if (event.kind === "step" && !context.run.bph?.survival) effectiveWaveInterval(context, event.dt);
    if (event.kind === "enemy-spawn" && effect.type === "MonsterMaxHP" && event.enemy.bphProfileId) {
      const receipt = `enemies:hp:${event.enemy.id}`;
      if (context.state.counters[receipt]) return;
      const stats = bphEnemyStats(context, { profileId: event.enemy.bphProfileId });
      event.enemy.hp = event.enemy.maxHp = stats.hp * BPH_SCALE.hp;
      context.state.counters[receipt] = 1;
    }
  },
}];
