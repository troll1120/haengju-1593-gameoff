import { strict as assert } from "node:assert";
import { freshMeta } from "../src/meta";
import type { Meta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { createBphRun, settleBphRun } from "../src/bph-session";
import { projectBphSalary } from "../src/bph-account";
import { activeBphEffects, prepareBphUpgrades } from "../src/bph-upgrades";
import { BPH_GENERALS } from "../src/bph-commanders";
import type { BphGeneral } from "../src/bph-commanders";
import { BPH_PACKS } from "../src/bph-data";
import { bphCrates, hitBphPack, tapBphCrate } from "../src/bph-combat";
import { buyBphRecruit } from "../src/bph-recruit";
import { restockBphRecruit } from "../src/bph-supply";
import { prepareBphFieldShop } from "../src/bph-shop-session";
import { BPH_SURVIVAL_TABLE } from "../src/bph-survival-data";
import { bphConsumers, bphFxContext, bindBphConsumers, bphTapStrike, dispatchBphEffects, tapBphStrike, updateBphPointer } from "../src/bph-fx-dispatch";
import { BPH_TAP_STRIKE } from "../src/bph-tap-strike";
import type { BphEffectConsumer } from "../src/bph-contract";
import type { BphSave } from "../src/bph-contract";
import { advance, choose, chooseGeneral, generalHandOpen, hitBphEnemy, useSkill } from "../src/rules";
import type { Enemy, Run } from "../src/rules";
import { ordinaryCard } from "../src/bots";
import { CENTER, setFieldSize } from "../src/geometry";
import { survivalFixture } from "./survival-fixtures";
import type { SurvivalState } from "./survival-fixtures";
import { observeSurvival } from "./survival-observation";
import { survivalTelemetry } from "./survival-telemetry";
import { runSurvivalCli } from "./survival-report";

export type SurvivalAccount = { readonly meta: Meta; readonly save: BphSave };
export type SurvivalOptions = {
  readonly seed: number;
  /** Human chapter number, 1..4. Converted to the production save's zero-based index. */
  readonly chapter: number;
  readonly general: BphGeneral;
  readonly state: SurvivalState;
  readonly policy: SurvivalPolicy;
  /** Observation horizon only; never changes the production deadline. */
  readonly capSeconds?: number;
  /** Mutated in place, including terminal settlement; fixtures never overwrite this account.
   * chapter must match its current chapter (C4 remains selected after later wins).
   * The returned account is this same object, not a historical snapshot.
   */
  readonly account?: SurvivalAccount;
  /** Optional observation cadence, >= one 0.05-second simulation step. Default off. */
  readonly sampleEvery?: number;
  /** Additional exact observation times, aligned to the fixed simulation step. */
  readonly sampleAt?: readonly number[];
  /** Optional combat attribution and general level checkpoints. Default off. */
  readonly telemetry?: boolean;
  /** Log when pack receipts land, including their source. Always on for barracks-only. */
  readonly trackPackArrivals?: boolean;
  /** Portrait taps, the only way a general's skill fires. "timely" taps every portrait at each .5s decision (the default);
   * "never" leaves every full gauge waiting; a list replays recorded taps, each applied at the first step at or after its time. */
  readonly taps?: "timely" | "never" | readonly SkillTap[];
};
export type SkillTap = { readonly time: number; readonly squad: number };

export const SURVIVAL_POLICIES = ["cursor0", "active2Hz", "tap2Hz", "barracks-only"] as const;
export type SurvivalPolicy = typeof SURVIVAL_POLICIES[number];
type PackArrival = {
  readonly time: number;
  readonly packId: string;
  readonly source: "paid" | "barracks" | "other-free";
};
/** The scripted tapper's aim: the living non-ship enemy with the most others inside the base volley circle,
 *  then nearest the castle, then lowest id. Deterministic, so a balance run can be repeated exactly. */
export function tapperAim(run: Run): { x: number; y: number } | null {
  const alive = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship");
  const crowd = (at: Enemy) => alive.filter(other => Math.hypot(other.x - at.x, other.y - at.y) <= BPH_TAP_STRIKE.radius).length;
  const best = alive.map(enemy => ({ enemy, count: crowd(enemy) })).sort((a, b) => b.count - a.count ||
    Math.hypot(a.enemy.x - CENTER.x, a.enemy.y - CENTER.y) - Math.hypot(b.enemy.x - CENTER.x, b.enemy.y - CENTER.y) || a.enemy.id - b.enemy.id)[0];
  return best ? { x: best.enemy.x, y: best.enemy.y } : null;
}

export const SURVIVAL_POLICY = {
  stepSeconds: .05, decisionSeconds: .5, width: 370, height: 800,
  tapping: "tap2Hz only: every .5s at t=0, when a volley is ready, tap tapperAim (densest base-radius crowd). Other policies never tap.",
  targeting: "Every step: living non-ship; breach first, boss next, distance to castle CENTER ascending, id ascending. Pointer tracks target every step; hitBphEnemy once at t=0,.5,1,... when a target exists.",
  actions: "Every .5s from t=0: tap each portrait and attempt to buy and open the first unsold offer. active2Hz also taps every field crate. barracks-only does everything active2Hz does except buy or open paid recruits. All policies retain the production barracks auto-draw.",
  settlement: "Settle terminal runs only; capped runs retain uncredited pending combat mastery.",
} as const;

/** Fresh by default; supplied account state carries discoveries, purchases and settled rewards forward. */
export async function simulateSurvival(options: SurvivalOptions) {
  assert(Number.isInteger(options.seed) && options.seed >= 0 && options.seed <= 0xffffffff, "seed must be uint32");
  assert(Number.isInteger(options.chapter) && options.chapter >= 1 && options.chapter <= 4, "chapter must be 1..4");
  assert(BPH_GENERALS.includes(options.general), "unknown general");
  assert(SURVIVAL_POLICIES.includes(options.policy), "unknown policy");
  const barracksOnly = options.policy === "barracks-only";
  const activeCursor = options.policy === "active2Hz" || barracksOnly;
  const trackPackArrivals = barracksOnly || options.trackPackArrivals === true;
  const duration = BPH_SURVIVAL_TABLE.duration;
  const capSeconds = options.capSeconds ?? duration + .1;
  assert(Number.isFinite(capSeconds) && capSeconds >= 0, "cap must be within the nonnegative finite range");
  if (options.sampleEvery !== undefined)
    assert(Number.isFinite(options.sampleEvery) && options.sampleEvery >= .05, "sampleEvery must be at least .05 seconds");
  const taps = options.taps ?? "timely";
  const scripted = typeof taps === "string" ? [] : [...taps].sort((a, b) => a.time - b.time || a.squad - b.squad);
  assert(scripted.every(tap => Number.isFinite(tap.time) && tap.time >= 0 && Number.isInteger(tap.squad) && tap.squad >= 0), "taps need finite times and squad indexes");
  if (options.account) await prepareBphUpgrades();
  const fixture = options.account ? null : await survivalFixture(options.state);
  setFieldSize(SURVIVAL_POLICY.width, SURVIVAL_POLICY.height);
  const meta = options.account?.meta ?? freshMeta(), save = options.account?.save ?? freshBphSave(options.seed);
  meta.bph = save;
  if (options.account) {
    assert(options.chapter === Math.min(save.chapter + 1, 4), "chapter must match the carried account");
  } else {
    save.chapter = options.chapter - 1;
    assert(fixture, "Fresh account fixture required");
    save.purchasedPlacements = [...fixture.purchasedPlacements];
    save.unitUpgrades = structuredClone(fixture.unitUpgrades);
  }
  const effects = activeBphEffects(save);
  projectBphSalary(save, effects);
  const run = createBphRun(meta, { seed: options.seed, general: options.general, upgrades: effects, startBattle: false });
  const battle = run.bph, context = bphFxContext(run);
  assert(battle && context, "Production BPH context required");
  const telemetry = options.telemetry ? survivalTelemetry(run) : undefined;
  let input: "advance" | "cursor" | "portrait" = "advance";
  // Mutable observation accumulators; appended observer never changes an event.
  const masterySources: Record<string, number> = {};
  const coinSources: Record<string, number> = {};
  const purchaseLog: { time: number; packId: string; box: boolean; price: number; multiplier: number }[] = [];
  const paidPackIds = new Set<number>();
  const packArrivals: PackArrival[] = [];
  // Player taps on field crates, as input events in order; crates seen but never tapped opened by themselves.
  const crateTaps: { time: number; id: number; packId: string; multiplier: number }[] = [];
  const cratesSeen = new Set<number>();
  const spawnedIds = new Set(run.squads.flatMap(squad => squad.soldiers.map(unit => unit.id)));
  const spawnedEnemyIds = new Set<number>();
  let pouchSpawned = 0, pouchKilled = 0, commanderEscortSpawns = 0;
  let peakAlive = 0, maxEnemies = 0, boxMastery = 0;
  let source = "enemy-kill", cursorHits = 0, strikeTaps = 0, decisions = 0, blockedPurchases = 0;
  let castleFallTime: number | null = null;
  let cumulativeRecruits = 0, nextSample = 0, tapCount = 0, nextTap = 0;
  const joinLog: { time: number; offered: readonly string[]; general: string }[] = [];
  const skillCasts: SkillTap[] = [];
  // A tap on a portrait whose gauge is not full does nothing, as in the game.
  const tapPortrait = (squad: number) => {
    tapCount++;
    const before = run.metrics.skillTimes.length;
    input = "portrait";
    useSkill(run, squad);
    input = "advance";
    if (run.metrics.skillTimes.length > before) skillCasts.push({ time: run.time, squad });
  };
  const economy = () => ({
    wallHp: run.base, wallMaxHp: run.maxBase, totalSpawned: spawnedIds.size,
    liveTroops: run.squads.reduce((count, squad) => count + squad.soldiers.filter(unit => unit.hp > 0).length, 0),
    cumulativeRecruits, packsBought: purchaseLog.length, goldBalance: run.gold, earnedGold: run.earned,
    directKillGold: coinSources["enemy-kill"] ?? 0, goldSources: { ...coinSources },
    liveEnemiesOnMap: run.enemies.filter(enemy => enemy.hp > 0).length,
    liveEnemiesOnboard: run.enemies.reduce((count, enemy) => count + (enemy.cargo?.filter(passenger => passenger.hp > 0).length ?? 0), 0),
    uniqueEnemySpawns: spawnedEnemyIds.size, commanderEscortSpawns, pouchSpawned, pouchKilled,
  });
  const timeSeries: (ReturnType<typeof observeSurvival> & ReturnType<typeof economy> & { readonly scheduledTime: number })[] = [];
  const sampleAt = [...new Set(options.sampleAt)].sort((a, b) => a - b);
  let nextExplicitSample = 0;
  const observe = () => {
    const cadenceTime = options.sampleEvery === undefined ? Infinity : nextSample * options.sampleEvery;
    const explicitTime = sampleAt[nextExplicitSample] ?? Infinity;
    const scheduledTime = Math.min(cadenceTime, explicitTime);
    if (run.time + 1e-9 < scheduledTime) return;
    timeSeries.push({ ...observeSurvival(run, cumulativeRecruits), ...economy(), scheduledTime });
    if (cadenceTime === scheduledTime) nextSample++;
    if (explicitTime === scheduledTime) nextExplicitSample++;
  };
  const sample = () => {
    const alive = run.squads.reduce((sum, squad) => sum + squad.soldiers.filter(unit => unit.hp > 0).length, 0);
    peakAlive = Math.max(peakAlive, alive);
    maxEnemies = Math.max(maxEnemies, run.enemies.filter(enemy => enemy.hp > 0).length);
    if (run.base <= 0 && castleFallTime === null) castleFallTime = run.time;
  };
  // Preserve production order and attribute nested coin events to their actual consumer.
  const consumers = bphConsumers().map(consumer => ({
    ...consumer,
    onEvent(ctx, event) {
      const previous = source; source = `effect:${consumer.id}`;
      try { consumer.onEvent?.(ctx, event); } finally { source = previous; }
    },
    consume(ctx, event, effect) {
      const previous = source; source = `effect:${effect.type}`;
      try { consumer.consume(ctx, event, effect); } finally { source = previous; }
    },
  } satisfies BphEffectConsumer));
  const observer: BphEffectConsumer = {
    id: "troops", kinds: [], consume() {},
    onEvent(_ctx, event) {
      if (event.kind === "mastery-gained")
        masterySources[event.source] = (masterySources[event.source] ?? 0) + event.grant.amount;
      if (event.kind === "coins-gained")
        coinSources[source] = (coinSources[source] ?? 0) + event.amount;
      if (trackPackArrivals && event.kind === "pack-opened" && event.origin) {
        const source = paidPackIds.has(event.origin.instanceId) ? "paid"
          : battle.barracksReceipts?.includes(event.result.id) ? "barracks" : "other-free";
        packArrivals.push({ time: run.time, packId: event.result.packId, source });
      }
      if (event.kind === "unit-spawn") {
        spawnedIds.add(event.unit.id);
        if (event.life?.cause === "pack") cumulativeRecruits++;
      }
      if (event.kind === "enemy-spawn" && !spawnedEnemyIds.has(event.enemy.id)) {
        spawnedEnemyIds.add(event.enemy.id);
        if ("goldPouch" in event.enemy && event.enemy.goldPouch === true) pouchSpawned++;
        if ("commanderEscort" in event.enemy && event.enemy.commanderEscort === true) commanderEscortSpawns++;
      }
      if (event.kind === "enemy-killed" && "goldPouch" in event.enemy && event.enemy.goldPouch === true) pouchKilled++;
      if (event.kind === "unit-spawn" || event.kind === "unit-death"
        || event.kind === "enemy-spawn" || event.kind === "enemy-killed") sample();
    },
  };
  const hitObserver: BphEffectConsumer = {
    id: "troops", kinds: [], consume() {},
    onEvent(_ctx, event) { telemetry?.event(event, input, source !== "enemy-kill"); },
  };
  // See the receipt at emission, before production consumers can apply nested damage.
  bindBphConsumers(context, telemetry ? [hitObserver, ...consumers, observer] : [...consumers, observer], false);
  const initialMastery = save.resources.mastery, initialCoins = run.gold;
  dispatchBphEffects(run, { kind: "run-start" });
  prepareBphFieldShop(run);
  sample(); observe(); telemetry?.sample();
  const maxSteps = Math.ceil(capSeconds / .05);
  let steps = 0;
  while (steps < maxSteps && run.phase !== "won" && run.phase !== "lost") {
    if (run.phase === "choice") { choose(run, ordinaryCard(run)); continue; }
    if (generalHandOpen(run)) {
      const general = run.generalOffers[0];
      assert(general, "General choice has no offers");
      joinLog.push({ time: run.time, offered: [...run.generalOffers], general });
      chooseGeneral(run, general); telemetry?.sample(); continue;
    }
    // Taps come first in a step, before the shop and the cursor, wherever they come from.
    while (nextTap < scripted.length && scripted[nextTap].time <= run.time + 1e-9) tapPortrait(scripted[nextTap++].squad);
    if (steps % 10 === 0) {
      decisions++;
      if (taps === "timely") for (const squad of run.squads) tapPortrait(squad.id);
      const shop = restockBphRecruit(run);
      const slot = shop.offers.findIndex(offer => !offer.sold);
      if (!barracksOnly && slot >= 0) {
        const gold = run.gold, pack = buyBphRecruit(run, shop, slot);
        if (pack) {
          if (trackPackArrivals) paidPackIds.add(pack.id);
          battle.packs.push({ ...pack, hp: 2, x: CENTER.x, y: CENTER.y + 70 });
          purchaseLog.push({ time: run.time, packId: pack.packId, box: pack.box,
            price: gold - run.gold, multiplier: pack.multiplier ?? 1 });
          const before = battle.receipts.length;
          hitBphPack(run, pack.id, "reveal"); hitBphPack(run, pack.id, "reveal");
          if (pack.box && battle.receipts.length > before) boxMastery += BPH_PACKS[pack.packId].boxMastery;
        } else blockedPurchases++;
      }
      for (const crate of bphCrates(run)) {
        cratesSeen.add(crate.id);
        if (!activeCursor) continue;
        const opened = tapBphCrate(run, crate.id);
        crateTaps.push({ time: run.time, id: crate.id, packId: crate.packId, multiplier: opened[0]?.multiplier ?? 1 });
        if (crate.box && opened.length) boxMastery += BPH_PACKS[crate.packId].boxMastery;
      }
      sample();
    }
    if (options.policy === "tap2Hz" && steps % 10 === 0 && (bphTapStrike(run)?.charges ?? 0) >= 1) {
      const aim = tapperAim(run);
      if (aim && tapBphStrike(run, aim)) strikeTaps++;
    }
    if (activeCursor) {
      const target = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship").sort((a, b) =>
        Number(Boolean(b.breach)) - Number(Boolean(a.breach)) || Number(b.boss) - Number(a.boss) ||
        Math.hypot(a.x - CENTER.x, a.y - CENTER.y) - Math.hypot(b.x - CENTER.x, b.y - CENTER.y) || a.id - b.id)[0];
      if (target) {
        updateBphPointer(run, target);
        if (steps % 10 === 0) {
          input = "cursor";
          hitBphEnemy(run, target.id); cursorHits++;
          input = "advance";
        }
      }
    }
    advance(run, .05); steps++; sample(); observe(); telemetry?.sample();
    // Presentation effects are not input to any combat rule.
    battle.fxEvents.length = 0;
  }
  const capped = run.phase !== "won" && run.phase !== "lost";
  const pendingMastery = battle.pendingMastery, immediateMastery = save.resources.mastery;
  const finalCoins = run.gold;
  const finalEconomy = economy();
  const finalCommanders = run.metrics.bosses.filter(boss => boss.final).map(boss => {
    const enemy = run.enemies.find(enemy => enemy.boss && enemy.bossArt === boss.art &&
      enemy.appearedAt === boss.appeared && enemy.hp > 0);
    return { art: boss.art, appeared: boss.appeared, fallen: boss.fallen,
      remaining: boss.fallen === null, hp: enemy?.hp ?? null, maxHp: enemy?.maxHp ?? null };
  });
  if (!capped) settleBphRun(meta, run);
  const masteryDelta = save.resources.mastery - initialMastery;
  const classifiedMastery = Object.values(masterySources).reduce((sum, n) => sum + n, 0) + boxMastery;
  const spentCoins = purchaseLog.reduce((sum, purchase) => sum + purchase.price, 0);
  const classifiedCoins = Object.values(coinSources).reduce((sum, n) => sum + n, 0);
  return {
    seed: options.seed, chapter: options.chapter, general: options.general, state: options.state,
    policy: options.policy, targetingPolicy: activeCursor ? SURVIVAL_POLICY.targeting
      : options.policy === "tap2Hz" ? SURVIVAL_POLICY.tapping : "No pointer updates or enemy hits",
    duration, capSeconds, survival: run.time, phase: run.phase, capped, castleFallTime,
    generalFalls: run.metrics.downs.length, firstGeneralFall: run.metrics.downs[0]?.time ?? null,
    generalFallCounts: run.squads.map(squad => ({ general: squad.general, squad: squad.id,
      falls: run.metrics.downs.filter(down => down.squad === squad.id).length,
      firstFall: run.metrics.downs.find(down => down.squad === squad.id)?.time ?? null })),
    kills: run.kills, totalSpawned: spawnedIds.size, peakAlive, maxEnemies, purchases: purchaseLog.length, purchaseLog,
    crateTaps, crateMissed: cratesSeen.size - crateTaps.length - bphCrates(run).filter(crate => cratesSeen.has(crate.id)).length,
    blockedPurchases, steps, decisions, cursorHits, strikeTaps,
    mastery: { initial: initialMastery, immediate: immediateMastery, pendingCombat: pendingMastery,
      final: save.resources.mastery, delta: masteryDelta, sources: masterySources, box: boxMastery,
      unattributedDirect: masteryDelta - classifiedMastery },
    coins: { initial: initialCoins, final: finalCoins, earned: run.earned, spent: spentCoins,
      sources: coinSources, unattributedDirect: finalCoins + spentCoins - initialCoins - classifiedCoins },
    stateProvenance: { ...(fixture?.provenance ?? {
      sources: ["caller account"], construction: "Existing account mutated in place; no fixture grants",
      account: "Carried discoveries, placements, RNG and resources", diagnostic: options.state === "FULL218",
      placements: save.purchasedPlacements.length, futureExcluded: null,
    }), purchasedPlacements: [...save.purchasedPlacements],
      activeEffects: effects.length, accountSeed: options.seed },
    ...(options.account ? { account: options.account } : {}),
    ...(trackPackArrivals ? { packArrivals } : {}),
    ...(options.sampleEvery === undefined && options.sampleAt === undefined ? {} : { timeSeries, finalEconomy, finalCommanders }),
    ...(telemetry ? { telemetry: telemetry.result() } : {}),
    ...(joinLog.length ? { joins: joinLog, bossTimes: run.metrics.bosses.map(boss => ({ appeared: boss.appeared, fallen: boss.fallen, final: boss.final })) } : {}),
    skillTaps: { policy: typeof taps === "string" ? taps : "scripted", taps: tapCount, casts: skillCasts },
  };
}

export type SurvivalRow = Awaited<ReturnType<typeof simulateSurvival>>;

if (import.meta.main) await runSurvivalCli(simulateSurvival, SURVIVAL_POLICY);
