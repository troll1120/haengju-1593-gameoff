import { advance } from "../src/rules";
import type { Effect, Enemy, Run } from "../src/rules";
import { createBphRun } from "../src/bph-session";
import { addBphProfile, BPH_SCALE } from "../src/bph-combat";
import { BPH_PROFILES } from "../src/bph-data";
import { bindBphConsumers, bphConsumers, bphFxContext } from "../src/bph-fx-dispatch";
import { freshMeta } from "../src/meta";
import { fortRect, WIDTH, HEIGHT } from "../src/geometry";
import type { BphEffectConsumer } from "../src/bph-contract";
import { bphSurvivalPlan } from "../src/bph-survival";
import { riverBank, riverLane } from "../src/river";

export const SCENARIO = {
  seed: 7, seconds: 15, step: 1 / 60, foil: false, upgrades: [],
  enemyHp: 1_000_000,
  enemyLayout: "Four land targets: south-front +24px, southwest, east, north; two stationary ships on the naval lane. Exact initial positions are recorded per result.",
  samples: [0, 3, 6, 9, 12, 15],
  settings: [
    "One nonfoil copy; all profiles with classId, including noncollectible.",
    "Spawn one unit at the south castle front (bottom edge plus 30px), emerging=false, including boats; then allow all production movement, garrison/perch selection, pursuit, dash, hook and naval positioning.",
    "The full field is fitted into each 390x844 frame; the range circle follows the unit's current world position. No fixture position locks, resets or movement overrides.",
    "The same six targets for every profile: four yari around the castle including the nearby south-front target, plus two ships on riverLane(). All have speed=0, disabled offense/skills, no shields or boss scaling. Production knockback and hook pulls remain.",
    "General remains as roster owner, hp=0 and downUntil=1e9; no general offense.",
    "No survival waves (production plan cursor exhausted, nextDeparture=1e9), wall weapons, cursor damage, tomes, packs or upgrades.",
    "Automatic context.spawnProfile is suppressed and logged; legacy Beastmaster companions are removed immediately after addBphProfile.",
    "15 seconds at 60 fixed steps/sec; real advance, createBphRun, addBphProfile and profile consumers.",
    "Damage is sum of positive enemy HP loss per step, capped by remaining HP; includes profile spells and excludes overkill.",
    "Release count/distance observes before-attack (including handled attacks); initiation observes real windup target. Distances are center-to-center world pixels.",
    "Observed maxima are scenario samples, not a proof of absolute maximum range; initiation may use a quarry lock outside configured range and release permits production 16px slack. Neither is clamped in this report.",
    "The circle shows basic attack reach. Spell/actor radii retain their separate original conversion; a skill may damage outside this circle.",
    "Skill triggers observe source spellCast events (legacy events may have null castId), actor creations sampled after each step, and source counters without modifying them; zero basic attacks are preserved.",
    "Samples at 0/3/6/9/12/15s plus first windup midpoint and first release when present. No fabricated attack frame for zero-attack profiles.",
    "Production scene/sprites render replay copies; rendering never advances the measurement run.",
  ],
} as const;

type Attack = { readonly time: number; readonly distancePx: number; readonly targetId: number };
type Frame = { readonly label: string; readonly time: number; readonly run: Run; readonly effects: Effect[] };

export function simulateProfile(profileId: string) {
  if (WIDTH !== 370 || HEIGHT !== 800)
    throw new RangeError(`Expected reference phone field 370x800, received ${WIDTH}x${HEIGHT}`);
  const profile = BPH_PROFILES[profileId];
  if (!profile?.classId) throw new RangeError(`No unit profile: ${profileId}`);
  const run = createBphRun(freshMeta(), { seed: SCENARIO.seed, general: "권율", upgrades: [], startBattle: false });
  const battle = run.bph, context = bphFxContext(run);
  if (!battle || !context || !battle.survival) throw new TypeError("BPH survival context missing");
  // null selects the authored wave fallback; exhaust the existing survival cursor instead.
  battle.survival.cursor = bphSurvivalPlan(battle.waveId).length;
  battle.survival.nextDeparture = 1e9;
  battle.packs = []; battle.tomes = [];
  run.arrow = run.hwacha = 0; run.commandClock = 1e9; run.spawnBudget = -1e9;
  const owner = run.squads[0], wall = fortRect(0);
  Object.assign(owner, { hp: 0, downUntil: 1e9, clock: 1e9, skillClock: 1e9 });
  owner.soldiers = [];
  const origin = { x: WIDTH / 2, y: wall.bottom + 30 };
  const suppressed: { time: number; profileId: string; copies: number }[] = [];
  const initiations: Attack[] = [], releases: Attack[] = [];
  const casts: { time: number; spellId: string; castId: number | null }[] = [];
  let sourceId = -1;
  // Empty kinds avoids owning any production effect. The callback only reads the event.
  const observer: BphEffectConsumer = {
    id: "profiles", kinds: [], consume: () => {},
    onEvent: (_ctx, event) => {
      if (event.kind === "unit-spawn" && event.profileId === profileId) sourceId = event.unit.id;
      if (event.kind === "before-attack" && event.unit.id === sourceId)
        releases.push({ time: run.time, targetId: event.target.id,
          distancePx: Math.hypot(event.unit.x - event.target.x, event.unit.y - event.target.y) });
      if (event.kind === "spellCast" && (event.source?.id === sourceId || event.cast?.sourceId === sourceId))
        casts.push({ time: run.time, spellId: event.spellId, castId: event.cast?.id ?? null });
    },
  };
  bindBphConsumers({ ...context, pointer: { x: -1e9, y: -1e9 },
    spawnProfile: (id, copies) => { suppressed.push({ time: run.time, profileId: id, copies }); },
  }, [...bphConsumers(), observer], false);
  addBphProfile(run, { profileId, copies: 1, foil: false, discovered: false },
    { packId: "DeliveryBox", cause: "pack", position: origin });
  const unit = owner.soldiers.find(candidate => candidate.bph?.profileId === profileId);
  if (!unit) throw new TypeError(`addBphProfile did not create ${profileId}`);
  sourceId = unit.id;
  for (const companion of owner.soldiers.filter(candidate => candidate !== unit))
    suppressed.push({ time: 0, profileId: companion.bph?.profileId ?? companion.kind, copies: 1 });
  owner.soldiers = [unit];
  unit.emerging = false;
  const targetPositions: { kind: "yari" | "ship"; x: number; y: number }[] = [
    { kind: "yari", x: origin.x, y: origin.y + 24 },
    { kind: "yari", x: origin.x - 80, y: Math.min(riverBank() - 16, wall.bottom + 108) },
    { kind: "yari", x: wall.right + 45, y: (wall.top + wall.bottom) / 2 },
    { kind: "yari", x: origin.x, y: wall.top - 60 },
    { kind: "ship", x: origin.x + 40, y: riverLane() },
    { kind: "ship", x: origin.x - 100, y: riverLane() },
  ];
  const enemies: Enemy[] = targetPositions.map(({ kind, x, y }) => ({
    id: run.nextId++, kind, direction: "아래", x, y, goalX: x, goalY: y,
    hp: SCENARIO.enemyHp, maxHp: SCENARIO.enemyHp, speed: 0, elite: false, boss: false,
    clock: 1e9, skillClock: 1e9, strikeAt: 0, prey: null, stun: 0,
    burn: 0, burnClock: 0, casting: 0, casts: 0,
  }));
  run.enemies = enemies;
  const initialEnemies = structuredClone(enemies), frames: Frame[] = [];
  const seenActors = new Set<number>();
  const actorCreations: { time: number; id: number; kind: string; ownerId: number; castId: number | null }[] = [];
  const observeActors = () => {
    for (const actor of battle.fx.actors) if (!seenActors.has(actor.id)) {
      seenActors.add(actor.id);
      actorCreations.push({ time: run.time, id: actor.id, kind: actor.kind, ownerId: actor.ownerId, castId: actor.cast?.id ?? null });
    }
  };
  observeActors();
  const take = (label: string, effects: Effect[]) =>
    frames.push({ label, time: run.time, run: structuredClone(run), effects: structuredClone(effects) });
  take("start", []);
  let dealt = 0, windupFrame = false, releaseFrame = false;
  let sampledTravelPx = 0;
  const movementBounds = { minX: unit.x, maxX: unit.x, minY: unit.y, maxY: unit.y };
  let lastWindup: Effect | undefined;
  for (let step = 1; step <= SCENARIO.seconds / SCENARIO.step; step++) {
    const previous = enemies.map(enemy => enemy.hp);
    const previousPosition = { x: unit.x, y: unit.y };
    const releaseCount = releases.length;
    const batch = advance(run, SCENARIO.step);
    observeActors();
    sampledTravelPx += Math.hypot(unit.x - previousPosition.x, unit.y - previousPosition.y);
    movementBounds.minX = Math.min(movementBounds.minX, unit.x);
    movementBounds.maxX = Math.max(movementBounds.maxX, unit.x);
    movementBounds.minY = Math.min(movementBounds.minY, unit.y);
    movementBounds.maxY = Math.max(movementBounds.maxY, unit.y);
    if (run.phase !== "playing") throw new RangeError(`Fixture ended early: ${profileId} ${run.phase}`);
    if (owner.soldiers.length !== 1 || owner.soldiers[0] !== unit)
      throw new RangeError(`Fixture no longer has exactly one source: ${profileId}`);
    if (run.enemies.some(enemy => !enemies.includes(enemy)))
      throw new RangeError(`Unrelated enemy spawned: ${profileId}`);
    dealt += enemies.reduce((sum, enemy, i) => sum + Math.max(0, previous[i] - Math.max(0, enemy.hp)), 0);
    for (const effect of batch) if (effect.kind === "windup" && effect.squad === owner.id && effect.index === 0) {
      initiations.push({ time: run.time, targetId: unit.aim, distancePx: Math.hypot(unit.x - effect.x, unit.y - effect.y) });
      lastWindup = effect;
    }
    if (!windupFrame && unit.strikeAt > 0 && unit.strikeAt - run.time <= .08) {
      take("first-windup-midpoint", lastWindup ? [lastWindup, ...batch] : batch); windupFrame = true;
    }
    if (!releaseFrame && releases.length > releaseCount) { take("first-release", batch); releaseFrame = true; }
    if (step % 180 === 0) take(`${step / 60}s`, batch);
  }
  const max = (events: readonly Attack[]) => events.length ? Math.max(...events.map(event => event.distancePx)) : null;
  return {
    metrics: {
      profileId, name: profile.name, classId: profile.classId, collectible: profile.collectible,
      originalRange: profile.range, oldRangePx: profile.range * (40 / .3),
      currentWorldToPx: BPH_SCALE.distance, configuredRangePx: profile.range * BPH_SCALE.distance,
      currentToOldRatio: BPH_SCALE.distance / (40 / .3),
      maxInitiationDistancePx: max(initiations), maxReleaseDistancePx: max(releases),
      attacksPerSecond: releases.length / SCENARIO.seconds, initiations, releases,
      firstAttackAt: releases[0]?.time ?? null,
      interReleaseAttacksPerSecond: releases.length > 1
        ? (releases.length - 1) / (releases[releases.length - 1].time - releases[0].time) : null,
      actualDamageDealt: dealt, skillTriggers: casts, skillTriggerCount: casts.length,
      actorCreations,
      sourceCounters: { ...battle.fx.counters }, suppressedCompanions: suppressed,
      zeroAttack: releases.length === 0,
      zeroAttackReason: releases.length ? null : profile.cooldown <= 0 ? "Profile basic cooldown <= 0; production fight returns early" : "No before-attack event in this scenario",
      simulationSeconds: run.time, sourceId, sourceFinalHp: unit.hp,
      initialPosition: origin, finalPosition: { x: unit.x, y: unit.y },
      sampledTravelPx, movementBounds, initialEnemies,
      field: { width: WIDTH, height: HEIGHT },
      frames: frames.map(({ label, time, run: snapshot }) => {
        const source = snapshot.squads[0].soldiers[0];
        return { label, time, position: { x: source.x, y: source.y } };
      }),
    },
    frames,
  };
}
