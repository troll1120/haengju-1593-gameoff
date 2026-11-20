import type { BphBattle } from "./bph-combat";
import { BPH_MONSTERS } from "./bph-data";
import type { BphSurvivalSpawn } from "./bph-survival";
import { bphEnemyMapping } from "./bph-waves";
import type { Enemy, Run } from "./rules";

/** Original MonsterDefinition respawnAs resources.assets:1437 and binderPhases. */
export const BPH_SURVIVAL_PHASES: Readonly<Record<string, string>> = {
  Boss3_Witch: "Boss3_Witch2",
};

type Encounter = Run["metrics"]["bosses"][number];
type Phase = {
  readonly entry: BphSurvivalSpawn;
  readonly encounter: Encounter;
  readonly hpEffect: number;
  dead: boolean;
};
export type BphWitchRespawn = {
  readonly entry: BphSurvivalSpawn;
  readonly parent: Pick<Enemy, "x" | "y" | "direction" | "goalX" | "goalY" | "breach">;
  readonly encounter: Encounter;
  readonly hpEffect: number;
};
// Phase state is battle-local and allocated only for a real Witch encounter.
// No fields or RNG changes are introduced into ordinary serialized runs.
const phases = new WeakMap<BphBattle, {
  readonly enemies: Map<number, Phase>;
  readonly pending: BphWitchRespawn[];
}>();

export function trackBphWitchPhase(run: Run, enemy: Enemy, entry: BphSurvivalSpawn,
  encounter: Encounter): void {
  const battle = run.bph;
  if (!battle?.survival || (entry.profileId !== "Boss3_Witch"
    && entry.profileId !== BPH_SURVIVAL_PHASES.Boss3_Witch)) return;
  let state = phases.get(battle);
  if (!state) {
    state = { enemies: new Map(), pending: [] };
    phases.set(battle, state);
  }
  state.enemies.set(enemy.id, { entry, encounter, dead: false,
    hpEffect: enemy.maxHp / (BPH_MONSTERS[entry.profileId].hp * entry.hp) });
}

/** Called by damage only after a living enemy crosses zero HP.
 * Returns true when this module owns the encounter's phase/fallen bookkeeping.
 * The caller still awards this form's normal kill/reward and dispatches provenance.
 */
export function recordBphWitchDeath(run: Run, enemy: Enemy): boolean {
  const state = run.bph && phases.get(run.bph);
  const phase = state?.enemies.get(enemy.id);
  if (!phase || !state || enemy.hp > 0) return false;
  if (phase.dead) return true;
  phase.dead = true;
  const next = BPH_SURVIVAL_PHASES[phase.entry.profileId];
  if (next) {
    phase.encounter.phase2 = run.time;
    state.pending.push({
      entry: { ...phase.entry, ...bphEnemyMapping(next), profileId: next },
      parent: { x: enemy.x, y: enemy.y, direction: enemy.direction,
        goalX: enemy.goalX, goalY: enemy.goalY, breach: enemy.breach },
      encounter: phase.encounter, hpEffect: phase.hpEffect,
    });
  } else phase.encounter.fallen = run.time;
  return true;
}

export function takeBphWitchRespawns(run: Run): BphWitchRespawn[] {
  const state = run.bph && phases.get(run.bph);
  return state ? state.pending.splice(0) : [];
}
