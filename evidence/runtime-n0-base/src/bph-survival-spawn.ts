import { BPH_MONSTERS, BPH_WAVES } from "./bph-data";
import { BPH_SCALE } from "./bph-combat";
import { bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { bphSpawnsBetween } from "./bph-waves";
import type { BphWaveInterval } from "./bph-waves";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { bphSurvivalPlan } from "./bph-survival";
import type { BphSurvivalSpawn } from "./bph-survival";
import type { Effect, Enemy, Run } from "./rules";
import { effectiveWaveInterval } from "./bph-enemy-effects";
import { bphSurvivalRegularBetween } from "./bph-survival-interval";
import { takeBphWitchRespawns, trackBphWitchPhase } from "./bph-witch-phase";

/** Native geometry/RNG still constructs enemies; this adapter owns BPH spawn stats. */
export function spawnBphSurvival(run: Run, step: { readonly dt: number; readonly effects: Effect[] },
  makeEnemy: (entry: BphSurvivalSpawn) => Enemy): void {
  const battle = run.bph;
  if (!battle) return;
  const context = bphFxContext(run);
  const interval: BphWaveInterval = context ? effectiveWaveInterval(context, step.dt)
    : { after: run.time - step.dt, through: run.time };
  const projected = interval.countMultiplier !== undefined;
  const state = battle.survival;
  const due: BphSurvivalSpawn[] = [];
  if (state) {
    const plan = bphSurvivalPlan(battle.waveId);
    const epsilon = projected ? 1e-9 : 0;
    while (state.cursor < plan.length && plan[state.cursor].at <= run.time + epsilon) {
      const entry = plan[state.cursor++];
      if (!projected || entry.boss) due.push(entry);
    }
    if (projected) due.push(...bphSurvivalRegularBetween(battle.waveId, { through: run.time, dt: step.dt }, interval));
  } else {
    for (const entry of bphSpawnsBetween(battle.waveId, interval)) {
      due.push({ ...entry, boss: Boolean(entry.bossId), final: entry.profileId === "Boss9_Final", hp: 1, unitDamage: 1, castleDamage: 1 });
    }
  }
  const respawns = takeBphWitchRespawns(run);
  for (const { entry, phase } of [
    ...due.map(entry => ({ entry, phase: undefined })),
    ...respawns.map(phase => ({ entry: phase.entry, phase })),
  ]) {
    const data = BPH_MONSTERS[entry.profileId], enemy = makeEnemy(entry), previousHp = enemy.maxHp;
    if (phase) Object.assign(enemy, phase.parent);
    enemy.bphProfileId = entry.profileId; enemy.kind = entry.kind;
    enemy.hp = enemy.maxHp = data.hp * BPH_SCALE.hp * entry.hp;
    enemy.speed = data.moveSpeed * BPH_SCALE.movement;
    enemy.shielded = false; enemy.ladder = false;
    // Native transports initially include the native passenger HP. Replace that
    // contribution with authored BPH HP before combat can observe the carrier.
    const carrier = run.enemies.find(ship => ship.cargo?.includes(enemy));
    if (carrier) {
      const change = (enemy.maxHp - previousHp) / 2;
      carrier.hp += change; carrier.maxHp += change; carrier.ladder = false;
    }
    if (state) state.damage[enemy.id] = { unit: entry.unitDamage, castle: entry.castleDamage };
    if (entry.boss) {
      if (entry.bossId) enemy.bossArt = entry.bossId;
      enemy.appearedAt = state ? entry.at : run.time;
      if (!phase) run.metrics.bosses.push({ art: entry.bossId, final: entry.final,
        appeared: enemy.appearedAt, fallen: null, phase2: null, dealt: 0 });
      step.effects.push({ kind: "boss-enter", x: enemy.x, y: enemy.y, value: entry.final ? 3 : 2, target: enemy.id });
    }
    const beforeEffectsHp = enemy.maxHp;
    dispatchBphEffects(run, { kind: "enemy-spawn", enemy });
    // E1 projects authored HP once during enemy-spawn; survival scaling is last.
    if (context?.state.counters[`enemies:hp:${enemy.id}`] && entry.hp !== 1) {
      enemy.hp *= entry.hp; enemy.maxHp *= entry.hp;
    }
    if (phase) enemy.hp = enemy.maxHp = data.hp * BPH_SCALE.hp * entry.hp * phase.hpEffect;
    if (entry.profileId === "Boss3_Witch" || phase) {
      const encounter = phase?.encounter ?? run.metrics.bosses.at(-1);
      if (encounter) trackBphWitchPhase(run, enemy, entry, encounter);
    }
    if (carrier && enemy.maxHp !== beforeEffectsHp) {
      const change = (enemy.maxHp - beforeEffectsHp) / 2;
      carrier.hp += change; carrier.maxHp += change;
    }
  }
  const completedAt = state ? BPH_SURVIVAL_TABLE.duration
    : Math.max(0, ...BPH_WAVES[battle.waveId].map(burst => burst.at + burst.duration));
  const clock = state ? run.time : interval.through;
  const departure = state ? run.time >= state.nextDeparture : !battle.fx.counters.waveSpawnComplete && clock >= completedAt;
  if (departure) {
    for (const ship of run.enemies) if (ship.cargo?.length && !ship.sailing) ship.sailing = true;
    if (state) state.nextDeparture = (Math.floor(run.time / BPH_SURVIVAL_TABLE.batchSeconds) + 1) * BPH_SURVIVAL_TABLE.batchSeconds;
  }
  if (!battle.fx.counters.waveSpawnComplete && clock >= completedAt) {
    battle.fx.counters.waveSpawnComplete = 1;
    dispatchBphEffects(run, { kind: "wave-spawn-complete", waveId: battle.waveId });
  }
}
