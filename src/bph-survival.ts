import { BPH_WAVES } from "./bph-data";
import { bphEnemyMapping } from "./bph-waves";
import type { BphSpawn, BphWaveId, BphWaveInterval } from "./bph-waves";
import { BPH_SURVIVAL_TABLE, bphSurvivalChapter, bphSurvivalEnemyScale, bphSurvivalRosterShares } from "./bph-survival-data";
import type { Enemy, Run } from "./rules";
import { BPH_SURVIVAL_PHASES } from "./bph-witch-phase";
import type { Direction } from "./geometry";
import type { MinibossSkill } from "./minibosses";

export type BphSurvivalSpawn = BphSpawn & {
  readonly boss: boolean;
  readonly final: boolean;
  readonly hp: number;
  readonly unitDamage: number;
  readonly castleDamage: number;
  readonly elite?: boolean;
  readonly rush?: boolean;
  readonly ladder?: boolean;
  readonly side?: Direction;
  readonly march?: number;
  readonly miniboss?: MinibossSkill;
  /** Boss group index; the member's commander is resolved per run by `bphSurvivalBossGroup`. */
  readonly group?: number;
  readonly member?: number;
};
/** Mutable cursors belong to the run; immutable spawn plans are shared. */
export type BphSurvivalState = {
  cursor: number;
  /** Fractional extra bodies accrue on the eligible spawn stream only. */
  infantryCarry?: number;
  nextDeparture: number;
  /** Side stream for commander picks; the main run RNG never feeds it. */
  bossRng: number;
  bossBag: string[];
  readonly bossGroups: string[][];
  readonly damage: Record<number, { readonly unit: number; readonly castle: number }>;
  killCoins?: { at: number; tokens: number };
  reinforcements?: BphSurvivalSpawn[];
  spawnQueue?: { bodies: { entry: BphSurvivalSpawn; escort: boolean; fileSize?: number }[]; head: number; totalQueued: number };
  /** Allocated only after E1 changes cadence/count; the director owns this phase. */
  projection?: BphWaveInterval & { readonly tick: number };
};
const plans = new Map<BphWaveId, readonly BphSurvivalSpawn[]>();

type RosterEntry = {
  readonly id: string;
  readonly weight: number;
  credit: number;
  readonly first: number;
  readonly kind: string;
  readonly borrowed?: boolean;
};
/** Scheduled weight of one pool entry under the roster tier in force: the kind's share,
 * split inside the kind by the authored weights, with borrowed profiles carrying their
 * kind alone. Null shares, or a tier no eligible entry can serve, keep the authored weights. */
function rosterTierWeights(eligible: readonly RosterEntry[], shares: ReturnType<typeof bphSurvivalRosterShares>) {
  if (!shares) return (entry: RosterEntry) => entry.weight;
  const sharesByKind = shares as Readonly<Record<string, number>>;
  const authoredByKind = new Map<string, number>();
  for (const entry of eligible) if (!entry.borrowed)
    authoredByKind.set(entry.kind, (authoredByKind.get(entry.kind) ?? 0) + entry.weight);
  const weightOf = new Map<RosterEntry, number>();
  let total = 0;
  for (const entry of eligible) {
    const share = sharesByKind[entry.kind] ?? 0;
    const weight = !share ? 0 : entry.borrowed ? share
      : share * entry.weight / (authoredByKind.get(entry.kind) || 1);
    weightOf.set(entry, weight);
    total += weight;
  }
  return total > 0 ? (entry: RosterEntry) => weightOf.get(entry) ?? 0 : (entry: RosterEntry) => entry.weight;
}

export function bphSurvivalPlan(waveId: BphWaveId): readonly BphSurvivalSpawn[] {
  const previous = plans.get(waveId);
  if (previous) return previous;
  const chapter = bphSurvivalChapter(waveId);
  if (!chapter) throw new RangeError(`No survival chapter: ${waveId}`);
  const weights = new Map<string, number>();
  const introductions = new Map<string, number>();
  for (const burst of BPH_WAVES[waveId]) {
    if (burst.id && !bphEnemyMapping(burst.id).bossId) {
      weights.set(burst.id, (weights.get(burst.id) ?? 0) + burst.count);
      if (waveId === "WaveChapter4")
        introductions.set(burst.id, Math.min(introductions.get(burst.id) ?? burst.at, burst.at));
    }
  }
  const pool: RosterEntry[] = [...weights].map(([id, weight]) =>
    ({ id, weight, credit: 0, first: introductions.get(id) ?? 0, kind: bphEnemyMapping(id).kind }));
  // Spear chapters borrow one profile for each stronger kind their own waves never field,
  // so the roster tiers always have someone to promote (castle 1040).
  const fieldedKinds = new Set(pool.map(entry => entry.kind));
  if (fieldedKinds.has("yari"))
    for (const [kind, id] of Object.entries(BPH_SURVIVAL_TABLE.rosterReinforcements))
      if (!fieldedKinds.has(kind)) pool.push({ id, weight: 0, credit: 0, first: 0, kind, borrowed: true });
  const plan: BphSurvivalSpawn[] = [];
  for (let start = 0; start < BPH_SURVIVAL_TABLE.duration; start += BPH_SURVIVAL_TABLE.batchSeconds) {
    const intensity = bphSurvivalIntensity(start);
    const count = waveId === "WaveChapter4" && start < BPH_SURVIVAL_TABLE.chapter4Opening.until
      ? BPH_SURVIVAL_TABLE.chapter4Opening.count : intensity.count;
    // Replace one infantry slot in each patrol batch without changing the
    // weighted roster, arrival cadence, or total size of either batch.
    const patrol = waveId === "WaveChapter1" && (start === 60 || start === 150)
      ? start === 60
        ? { id: "Monster4_Bandit", hp: .4, castleDamage: 2 / 3 }
        : { id: "Monster4_Sentinel", hp: 1.2, castleDamage: 1 }
      : undefined;
    let patrolPending = patrol;
    const slots = Array.from({ length: count }, (_, index): {
      at: number; introduction: typeof pool[number] | undefined;
    } => ({
      at: start + (index + 1) * BPH_SURVIVAL_TABLE.batchSeconds / (count + 1),
      introduction: undefined,
    }));
    // Introductions replace ordinary slots; they never add to the batch density.
    if (waveId === "WaveChapter4") {
      for (const entry of pool.filter(entry => entry.first >= start
        && entry.first < start + BPH_SURVIVAL_TABLE.batchSeconds).sort((a, b) => a.first - b.first)) {
        const slot = slots.filter(slot => !slot.introduction).reduce((best, slot) =>
          Math.abs(slot.at - entry.first) < Math.abs(best.at - entry.first) ? slot : best);
        slot.at = entry.first; slot.introduction = entry;
      }
      slots.sort((a, b) => a.at - b.at);
    }
    const shares = bphSurvivalRosterShares(start);
    for (const slot of slots) {
      const eligible = waveId === "WaveChapter4" ? pool.filter(entry => entry.first <= slot.at) : pool;
      const tierWeight = rosterTierWeights(eligible, shares);
      for (const entry of eligible) entry.credit += tierWeight(entry);
      const selected = slot.introduction
        ?? eligible.reduce((best, entry) => entry.credit > best.credit ? entry : best);
      selected.credit -= eligible.reduce((sum, entry) => sum + tierWeight(entry), 0);
      const replacement = selected.id === "Monster1_Raider" ? patrolPending : undefined;
      if (replacement) patrolPending = undefined;
      const profileId = replacement?.id ?? selected.id;
      const strength = bphSurvivalEnemyScale(waveId, profileId);
      plan.push({ ...bphEnemyMapping(profileId), profileId, at: slot.at,
        boss: false, final: false, hp: chapter.hp * intensity.hp * (replacement?.hp ?? strength.hp),
        unitDamage: chapter.unitDamage * intensity.unitDamage * strength.unitDamage,
        castleDamage: chapter.castleDamage * intensity.castleDamage * (replacement?.castleDamage ?? strength.castleDamage) });
    }
  }
  BPH_SURVIVAL_TABLE.bosses.forEach((beat, group) => {
    const placeholder = BPH_SURVIVAL_TABLE.commanders[0];
    for (let member = 0; member < beat.count; member++)
      plan.push({ ...bphEnemyMapping(placeholder), profileId: placeholder, at: beat.at, group, member,
        boss: true, final: beat.final, hp: chapter.hp * beat.hp,
        unitDamage: chapter.unitDamage * beat.unitDamage,
        castleDamage: chapter.castleDamage * beat.castleDamage });
  });
  if (waveId === "WaveChapter1" || waveId === "WaveChapter2") {
    const beat = BPH_SURVIVAL_TABLE.earlyThreats;
    for (const at of [beat.eliteAt, beat.rushAt, beat.rushAgain]) {
      const rush = at !== beat.eliteAt, profileId = rush ? "Monster3_Shadow" : "Monster2_Overseer";
      // The rush is a slot of ordinary bodies and splits like one; the elite stays one body at the slot's whole strength.
      const intensity = rush ? bphSurvivalIntensity(at) : slotIntensity(at), strength = bphSurvivalEnemyScale(waveId, profileId);
      for (let index = 0; index < (rush ? beat.rushCount * survivalCountAt(at) : 1); index++)
        plan.push({ ...bphEnemyMapping(profileId), profileId, at, boss: false, final: false,
          ...(rush ? { rush: true } : { elite: true }),
          hp: chapter.hp * intensity.hp * strength.hp * (rush ? 1 : beat.eliteHp),
          unitDamage: chapter.unitDamage * intensity.unitDamage * strength.unitDamage,
          castleDamage: chapter.castleDamage * intensity.castleDamage * strength.castleDamage });
    }
  }
  plan.sort((a, b) => a.at - b.at);
  plans.set(waveId, plan);
  return plan;
}
/** Every profile a battle of this chapter can field: its plan plus the forms those spawns respawn as. */
export function bphSurvivalProfiles(waveId: BphWaveId): ReadonlySet<string> {
  const plan = bphSurvivalPlan(waveId), profiles = new Set(plan.filter(spawn => !spawn.boss).map(spawn => spawn.profileId));
  // Boss slots hold a placeholder; each run fills them from all eight commanders (ba634d8).
  if (plan.some(spawn => spawn.boss)) for (const id of BPH_SURVIVAL_TABLE.commanders) profiles.add(id);
  for (const id of profiles) if (BPH_SURVIVAL_PHASES[id]) profiles.add(BPH_SURVIVAL_PHASES[id]);
  return profiles;
}
type SlotStrength = { readonly count: number; readonly hp: number; readonly unitDamage: number; readonly castleDamage: number };
/** The authored strength of one slot at `time`, before `density` splits an ordinary slot into bodies. */
function slotIntensity(time: number): SlotStrength {
  let index = 0;
  while (index + 1 < BPH_SURVIVAL_TABLE.intensity.length && time >= BPH_SURVIVAL_TABLE.intensity[index + 1].at) index++;
  return BPH_SURVIVAL_TABLE.intensity[index];
}
/** Past the 15:00 win, one step per `endless.every` seconds on top of the last table step. */
function endlessSlotIntensity(time: number): SlotStrength {
  const last = BPH_SURVIVAL_TABLE.intensity[BPH_SURVIVAL_TABLE.intensity.length - 1], curve = BPH_SURVIVAL_TABLE.endless;
  const step = Math.floor(Math.max(0, time - BPH_SURVIVAL_TABLE.duration) / curve.every) + 1;
  return { count: last.count + step * curve.count, hp: last.hp * curve.hpGrowth ** step,
    unitDamage: last.unitDamage + step * curve.damageStep, castleDamage: last.castleDamage + step * curve.damageStep };
}
const densityByMinute = [2, 2, 2, 3, 4, 5, 7, 9, 10] as const;
export function survivalCountAt(time: number): number { return densityByMinute[Math.min(densityByMinute.length - 1, Math.floor(time / 60))]; }
function ordinaryBodies(slot: SlotStrength, time: number): SlotStrength {
  const split = BPH_SURVIVAL_TABLE.density;
  return { count: slot.count * survivalCountAt(time), hp: slot.hp * split.hp,
    unitDamage: slot.unitDamage * split.unitDamage, castleDamage: slot.castleDamage * split.castleDamage };
}
/** Ordinary bodies per half-minute at `time`, and one body's hp and damage. */
export function bphSurvivalIntensity(time: number): SlotStrength { return ordinaryBodies(slotIntensity(time), time); }
export function bphSurvivalEndlessIntensity(time: number): SlotStrength { return ordinaryBodies(endlessSlotIntensity(time), time); }
export function bphSurvivalSlotIntensity(time: number): SlotStrength {
  return time < BPH_SURVIVAL_TABLE.duration ? slotIntensity(time) : endlessSlotIntensity(time);
}
export function createBphSurvival(waveId: BphWaveId, seed = 0): BphSurvivalState | null {
  return bphSurvivalChapter(waveId) ? { cursor: 0, nextDeparture: BPH_SURVIVAL_TABLE.batchSeconds, damage: {},
    bossRng: (seed ^ 0x9e3779b9) >>> 0 || 1, bossBag: [], bossGroups: [] } : null;
}
function bossRandom(state: BphSurvivalState): number {
  state.bossRng = (state.bossRng + 0x6d2b79f5) >>> 0;
  let value = Math.imul(state.bossRng ^ state.bossRng >>> 15, state.bossRng | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}
export function bphSurvivalBossCount(group: number): number {
  const timed = BPH_SURVIVAL_TABLE.bosses, curve = BPH_SURVIVAL_TABLE.endless;
  return group < timed.length ? timed[group].count
    : Math.min(curve.bossMaxCount, curve.bossFirstCount + (group - timed.length) * curve.bossCountStep);
}
/** Commanders for one boss group. A shuffle bag gives no repeat until all eight have
 * appeared; a refilled bag never repeats a commander inside the same group. */
export function bphSurvivalBossGroup(state: BphSurvivalState, group: number): readonly string[] {
  while (state.bossGroups.length <= group) {
    const members: string[] = [];
    for (let count = bphSurvivalBossCount(state.bossGroups.length); members.length < count;) {
      if (!state.bossBag.length)
        state.bossBag = BPH_SURVIVAL_TABLE.commanders.filter(id => !members.includes(id));
      members.push(...state.bossBag.splice(Math.floor(bossRandom(state) * state.bossBag.length), 1));
    }
    state.bossGroups.push(members);
  }
  return state.bossGroups[group];
}
/** A planned boss slot becomes this run's commander, keeping the slot's scaling. */
export function bphSurvivalCommander(state: BphSurvivalState, entry: BphSurvivalSpawn): BphSurvivalSpawn {
  if (entry.group === undefined) return entry;
  const profileId = bphSurvivalBossGroup(state, entry.group)[entry.member ?? 0];
  return { ...entry, ...bphEnemyMapping(profileId), profileId };
}
const lastBatches = new Map<BphWaveId, readonly BphSurvivalSpawn[]>();
/** Endless spawns in (after, through], all past the duration: the last half-minute roster
 * repeats at the endless count, and a growing commander group arrives every `endless.every`. */
export function bphSurvivalEndlessBetween(waveId: BphWaveId, state: BphSurvivalState,
  interval: { readonly after: number; readonly through: number; readonly countMultiplier?: number }): BphSurvivalSpawn[] {
  const { duration, batchSeconds: span, endless: curve, bosses } = BPH_SURVIVAL_TABLE;
  const chapter = bphSurvivalChapter(waveId);
  if (!chapter) return [];
  let roster = lastBatches.get(waveId);
  if (!roster) {
    roster = bphSurvivalPlan(waveId).filter(entry => !entry.boss && entry.at >= duration - span);
    lastBatches.set(waveId, roster);
  }
  const after = Math.max(duration, interval.after), due: BphSurvivalSpawn[] = [];
  if (interval.through <= after) return due;
  const scaled = (intensity: SlotStrength, hp = 1) => ({ hp: chapter.hp * intensity.hp * hp,
    unitDamage: chapter.unitDamage * intensity.unitDamage, castleDamage: chapter.castleDamage * intensity.castleDamage });
  for (let start = Math.floor(after / span) * span; start < interval.through; start += span) {
    const count = Math.round(bphSurvivalEndlessIntensity(start).count * (interval.countMultiplier ?? 1));
    for (let index = 0; index < count; index++) {
      const at = start + (index + 1) * span / (count + 1);
      if (at > after && at <= interval.through)
        due.push({ ...roster[index % roster.length], at, boss: false, final: false, ...scaled(bphSurvivalEndlessIntensity(start)) });
    }
  }
  for (let wave = Math.max(1, Math.floor((after - duration) / curve.every)); duration + wave * curve.every <= interval.through; wave++) {
    const at = duration + wave * curve.every, group = bosses.length - 1 + wave;
    if (at <= after) continue;
    bphSurvivalBossGroup(state, group).forEach((profileId, member) => due.push({ ...bphEnemyMapping(profileId),
      profileId, at, group, member, boss: true, final: false, ...scaled(endlessSlotIntensity(at), curve.bossHp) }));
  }
  return due.sort((a, b) => a.at - b.at);
}
/** Combat consumers use the spawn-time multiplier, never the current player's N. */
export function bphSurvivalDamageMultiplier(run: Run, enemy: Enemy, target: "unit" | "castle"): number {
  return run.bph?.survival?.damage[enemy.id]?.[target] ?? 1;
}
export function bphSurvivalStep(run: Run, dt: number): number {
  return run.bph?.survival && !run.endless && !bphSurvivalFinalsRemain(run)
    ? Math.min(dt, Math.max(0, BPH_SURVIVAL_TABLE.duration - run.time)) : dt;
}
/** Past 15:00 the run continues while any final commander that appeared is still standing. */
export function bphSurvivalFinalsRemain(run: Run): boolean {
  return run.metrics.bosses.some(boss => boss.final && boss.fallen === null);
}
export function bphSurvivalWon(run: Run): boolean {
  return run.bph?.survival ? !run.endless && run.time >= BPH_SURVIVAL_TABLE.duration && !bphSurvivalFinalsRemain(run)
    : run.metrics.bosses.length > 0 && run.metrics.bosses.every(boss => boss.fallen !== null) && !run.enemies.length;
}
