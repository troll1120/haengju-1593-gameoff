import { survivalCountAt } from "./bph-survival";
import { BPH_MONSTERS, BPH_WAVES } from "./bph-data";
import { BPH_SCALE } from "./bph-combat";
import { bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { bphEnemyMapping, bphSpawnsBetween } from "./bph-waves";
import type { BphWaveId, BphWaveInterval } from "./bph-waves";
import { BPH_SURVIVAL_TABLE, bphSurvivalEnemyScale, bphSurvivalMonster, bphSurvivalRosterTier, infantryMultiplierAt } from "./bph-survival-data";
import { bphSurvivalCommander, bphSurvivalEndlessBetween, bphSurvivalPlan, bphSurvivalSlotIntensity } from "./bph-survival";
import type { BphSurvivalSpawn } from "./bph-survival";
import type { Effect, Enemy, Run } from "./rules";
import { effectiveWaveInterval } from "./bph-enemy-effects";
import { bphSurvivalRegularBetween } from "./bph-survival-interval";
import { takeBphWitchRespawns, trackBphWitchPhase } from "./bph-witch-phase";
import type { BphWitchRespawn } from "./bph-witch-phase";
import { SIDES } from "./geometry";
import { bphGoldUpgradeEffects } from "./bph-upgrade-gold";
import { MINIBOSS, MINIBOSS_TYPES, minibossBeat } from "./minibosses";

const GOLD_POUCH_INTERVAL = 60;
export const SURVIVAL_REGULAR_ALIVE_CAP = 400;
const GOLD_POUCH_BASE_CHANCE = .5;
const ESCORT_BURST_SECONDS = 2.5;
const escortPlans = new Map<BphWaveId, readonly BphSurvivalSpawn[]>();

function pouchRoll(seed: number, bucket: number): number {
  let hash = Math.imul(seed ^ 0x504f5543, 0x9e3779b1) ^ Math.imul(bucket, 0x85ebca77);
  hash = Math.imul(hash ^ hash >>> 16, 0x7feb352d);
  hash = Math.imul(hash ^ hash >>> 15, 0x846ca68b);
  return ((hash ^ hash >>> 16) >>> 0) / 4294967296;
}

function commanderEscorts(waveId: BphWaveId): readonly BphSurvivalSpawn[] {
  const previous = escortPlans.get(waveId);
  if (previous) return previous;
  const plan = bphSurvivalPlan(waveId);
  const chapter = Number(waveId.slice(-1));
  const escorts = plan.filter(entry => entry.boss && entry.member === 0).flatMap((anchor, beat) => {
    const roster = plan.filter(entry => entry.at >= anchor.at && entry.at < anchor.at + BPH_SURVIVAL_TABLE.batchSeconds
      && !entry.boss && !entry.elite && !entry.rush && !entry.ladder);
    const count = (18 + beat * 4 + (chapter - 1) * 4) * survivalCountAt(anchor.at);
    return Array.from({ length: count }, (_, i) => ({
      ...roster[Math.floor(i * roster.length / count)],
      at: anchor.at + i * ESCORT_BURST_SECONDS / (count - 1),
      side: SIDES[(i + beat) % SIDES.length],
    }));
  });
  escortPlans.set(waveId, escorts);
  return escorts;
}

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
  const escortDue: BphSurvivalSpawn[] = [];
  if (state) {
    if (state.reinforcements?.length) due.push(...state.reinforcements.splice(0));
    const plan = bphSurvivalPlan(battle.waveId);
    const epsilon = projected ? 1e-9 : 0;
    while (state.cursor < plan.length && plan[state.cursor].at <= run.time + epsilon) {
      const entry = plan[state.cursor++];
      if (!projected || entry.boss || entry.elite || entry.rush) due.push(bphSurvivalCommander(state, entry));
    }
    const finite = run.time - step.dt < BPH_SURVIVAL_TABLE.duration;
    if (projected && finite) due.push(...bphSurvivalRegularBetween(battle.waveId, { through: run.time, dt: step.dt }, interval));
    const beat = minibossBeat(run.time - step.dt, run.time);
    if (!run.rout && beat && (beat.at < BPH_SURVIVAL_TABLE.duration || run.endless)) {
      const { at } = beat, index = beat.index + (run.seed >>> 0);
      const { profileId, skill } = MINIBOSS_TYPES[index % MINIBOSS_TYPES.length];
      const intensity = bphSurvivalSlotIntensity(at);
      const strength = bphSurvivalEnemyScale(battle.waveId, profileId);
      due.push({ ...bphEnemyMapping(profileId), profileId, at, boss: false, final: false,
        hp: intensity.hp * strength.hp, unitDamage: intensity.unitDamage * strength.unitDamage,
        castleDamage: intensity.castleDamage * strength.castleDamage,
        side: (["위", "좌", "우"] as const)[index % 3], march: .16, miniboss: skill });
    }
    if (run.endless) due.push(...bphSurvivalEndlessBetween(battle.waveId, state,
      { after: run.time - step.dt, through: run.time, countMultiplier: interval.countMultiplier }));
    const escorts = commanderEscorts(battle.waveId);
    let cursor = battle.fx.counters.commanderEscortCursor ?? 0;
    while (cursor < escorts.length && escorts[cursor].at <= run.time + 1e-9) {
      const entry = escorts[cursor++];
      if (entry.at > run.time - step.dt + 1e-9) escortDue.push(entry);
    }
    if (cursor) battle.fx.counters.commanderEscortCursor = cursor;
  } else {
    for (const entry of bphSpawnsBetween(battle.waveId, interval)) {
      due.push({ ...entry, boss: Boolean(entry.bossId), final: entry.profileId === "Boss9_Final", hp: 1, unitDamage: 1, castleDamage: 1 });
    }
  }
  const respawns = takeBphWitchRespawns(run);
  const scheduled: { entry: BphSurvivalSpawn; phase?: BphWitchRespawn; escort: boolean; fileSize?: number }[] = [
    ...due.flatMap(slot => {
      const fileSize = state && slot.kind === "yari" && !slot.boss && !slot.elite && !slot.miniboss
        && !slot.rush && !slot.ladder ? infantryMultiplierAt(slot.at) : undefined;
      let bodies = fileSize ?? 1;
      if (state && !Number.isInteger(bodies)) {
        const budget = bodies + (state.infantryCarry ?? 0);
        bodies = Math.floor(budget);
        state.infantryCarry = budget - bodies;
      }
      // Owner 2026-11-19 (castle 1036): a file body keeps its share of HP and wall damage but the slot's full attack on troops.
      const entry = !fileSize || fileSize === 1 ? slot : { ...slot, hp: slot.hp / fileSize,
        castleDamage: slot.castleDamage / fileSize };
      return Array.from({ length: bodies }, () => ({ entry, phase: undefined, escort: false, fileSize }));
    }),
    ...respawns.map(phase => ({ entry: phase.entry, phase, escort: false, fileSize: undefined })),
    ...escortDue.map(entry => ({ entry, phase: undefined, escort: true, fileSize: undefined })),
  ];
  let admitted = scheduled;
  const queue = state?.spawnQueue;
  if (state) {
    // An interior tier step's offensive supersedes reinforcements that never deployed; the
    // final tier phases in as the backlog drains, avoiding a step spike in wall pressure.
    // The seat cap and FIFO order otherwise stay exactly as authored.
    const tier = bphSurvivalRosterTier(run.time);
    if (tier > (battle.fx.counters.rosterTier ?? -1)
      && tier < BPH_SURVIVAL_TABLE.rosterTiers.length - 1) {
      battle.fx.counters.rosterTier = tier;
      if (queue && queue.head < queue.bodies.length) queue.bodies.length = queue.head;
    }
  }
  if (state && (scheduled.length || (queue && queue.head < queue.bodies.length))) {
    // Reserve seats for living passengers as well, so disembarking cannot overflow the cap.
    let seats = SURVIVAL_REGULAR_ALIVE_CAP;
    for (const e of run.enemies) {
      if (e.hp <= 0) continue;
      if (e.kind === "ship") {
        for (const p of e.cargo ?? []) if (p.hp > 0 && !p.boss && !p.miniboss) seats--;
      } else if (!e.boss && !e.miniboss) seats--;
    }
    admitted = [];
    if (queue) {
      while (seats > 0 && queue.head < queue.bodies.length) {
        admitted.push(queue.bodies[queue.head++]);
        seats--;
      }
      if (queue.head && queue.head * 2 >= queue.bodies.length) {
        queue.bodies.splice(0, queue.head);
        queue.head = 0;
      }
    }
    for (const body of scheduled) {
      if (body.entry.boss || body.entry.miniboss || body.phase) admitted.push(body);
      else if (seats > 0) { admitted.push(body); seats--; }
      else {
        const waiting = state.spawnQueue ??= { bodies: [], head: 0, totalQueued: 0 };
        waiting.bodies.push(body);
        waiting.totalQueued++;
      }
    }
  }
  for (const { entry, phase, escort, fileSize } of admitted) {
    const data = state ? bphSurvivalMonster(entry.profileId) : BPH_MONSTERS[entry.profileId];
    // Escort geometry uses the native spawn route without consuming the regular spawn stream.
    const regularRng = run.rng;
    if (escort) run.rng = (run.seed ^ Math.imul(Math.round(entry.at * 1000), 0x9e3779b9)) >>> 0;
    const enemy = makeEnemy(entry), previousHp = enemy.maxHp;
    if (fileSize !== undefined) enemy.infantryRewardShare = 1 / fileSize;
    // A tier-strong single body carries its whole slot's file reward, so replacing spear
    // files with stronger types does not hollow out the run's coin income (castle 1040).
    else if (state && !entry.boss && !entry.elite && !entry.miniboss && !entry.rush && !entry.ladder
      && !escort && !phase && entry.kind !== "yari" && entry.kind !== "ship"
      && bphSurvivalRosterTier(entry.at) >= 0) enemy.infantryRewardShare = 1;
    if (escort) run.rng = regularRng;
    if (phase) Object.assign(enemy, phase.parent);
    enemy.bphProfileId = entry.profileId; enemy.kind = entry.kind;
    enemy.hp = enemy.maxHp = data.hp * BPH_SCALE.hp * entry.hp;
    enemy.speed = data.moveSpeed * BPH_SCALE.movement;
    if (entry.rush) enemy.speed *= BPH_SURVIVAL_TABLE.earlyThreats.rushSpeed;
    enemy.elite = entry.elite ?? false;
    if (entry.miniboss) {
      enemy.miniboss = entry.miniboss;
      enemy.skillClock = MINIBOSS.initialCast;
    }
    enemy.wave = entry.rush ?? false;
    enemy.shielded = false; enemy.ladder = entry.ladder ?? false;
    // Native transports initially include the native passenger HP. Replace that
    // contribution with authored BPH HP before combat can observe the carrier.
    const carrier = enemy.aboard ? run.enemies.find(ship => ship.cargo?.includes(enemy)) : undefined;
    const pouchBucket = Math.floor(entry.at / GOLD_POUCH_INTERVAL);
    if (escort) enemy.commanderEscort = true;
    if (state && pouchBucket > (battle.fx.counters.goldPouchBucket ?? 0) && !escort
      && !phase && !entry.boss && !entry.final && !entry.elite && !entry.rush && !entry.ladder && !entry.miniboss
      && enemy.kind !== "ship" && !carrier && !enemy.aboard) {
      battle.fx.counters.goldPouchBucket = pouchBucket;
      const chance = GOLD_POUCH_BASE_CHANCE * bphGoldUpgradeEffects(battle.upgrades).goldPouchSpawnChanceMultiplier;
      if (pouchRoll(run.seed, pouchBucket) < chance) enemy.goldPouch = true;
    }
    if (carrier) {
      const change = (enemy.maxHp - previousHp) * (carrier.hull ?? .5);
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
    if (entry.miniboss) { enemy.hp *= MINIBOSS.hp; enemy.maxHp *= MINIBOSS.hp; }
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
  if (!battle.fx.counters.waveSpawnComplete && clock >= completedAt
    && (!state?.spawnQueue || state.spawnQueue.head === state.spawnQueue.bodies.length)) {
    battle.fx.counters.waveSpawnComplete = 1;
    dispatchBphEffects(run, { kind: "wave-spawn-complete", waveId: battle.waveId });
  }
}
