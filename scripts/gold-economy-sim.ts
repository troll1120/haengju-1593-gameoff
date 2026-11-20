import { strict as assert } from "node:assert";
import { activeBphEffects, BPH_UPGRADE_GRIDS } from "../src/bph-upgrades";
import { BPH_DEFAULT_GRID } from "../src/bph-upgrade-data";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { survivalFixture } from "./survival-fixtures";
import { simulateSurvival } from "./survival-sim";
import type { SurvivalRow } from "./survival-sim";

const checkpoints = [3, 6, 9, 12, 15] as const;
const commanderTimes = [180, 360, 540, 720, 810] as const;
const sampleAt = [...checkpoints.map(minute => minute * 60), ...commanderTimes.flatMap(time => [time - .05, time + 3])];
const seeds = [1, 7, 1593] as const;
const chapter = 1;
const general = "권율";
const policy = "active2Hz";
const args = process.argv.slice(2);
const settlementOnly = args.includes("--settlements");
const states = settlementOnly ? ["none", "full144"] as const : ["none", "typical"] as const;
// Optional positional node IDs. Add every authored placement of those nodes in the active grid.
const nodeIds = [...new Set(args.filter(arg => arg !== "--settlements"))];
type EconomySample = NonNullable<SurvivalRow["timeSeries"]>[number];
type RunReport = {
  readonly seed: number;
  readonly state: SurvivalRow["state"];
  readonly maxed: boolean;
  readonly setup: {
    readonly purchasedPlacements: readonly string[];
    readonly unitUpgrades: ReturnType<typeof freshBphSave>["unitUpgrades"];
    readonly goldEffects: ReturnType<typeof activeBphEffects>;
  };
  readonly survivalSeconds: number;
  readonly phase: SurvivalRow["phase"];
  readonly won: boolean;
  readonly capped: boolean;
  readonly castleFallTime: number | null;
  readonly settlement: {
    readonly medalsBeforeSettlement: number;
    readonly medalsAfterSettlement: number;
    readonly medalsCreditedAtSettlement: number;
    readonly medalsEarnedDuringRun: number;
  } | null;
  readonly final: NonNullable<SurvivalRow["finalEconomy"]>;
  readonly finalCommanders: NonNullable<SurvivalRow["finalCommanders"]>;
  readonly purchases: SurvivalRow["purchaseLog"];
  readonly checkpoints: readonly {
    readonly minute: number;
    readonly reached: boolean;
    readonly sample: (NonNullable<SurvivalRow["finalEconomy"]> & { readonly time: number }) | null;
  }[];
  readonly commanderWindows: readonly {
    readonly time: number;
    readonly before: EconomySample | null;
    readonly after: EconomySample | null;
    readonly enemySpawns: number | null;
    readonly markedEscortSpawns: number | null;
  }[];
};
const runs: RunReport[] = [];

for (const state of states) {
  const fixture = await survivalFixture(state);
  const placements = BPH_UPGRADE_GRIDS.find(grid => grid.id === BPH_DEFAULT_GRID)?.placements ?? [];
  const goldPlacements = nodeIds.flatMap(nodeId => {
    const matches = placements.filter(placement => placement.nodeId === nodeId);
    assert(matches.length, `Gold node ${nodeId} has no placements in ${BPH_DEFAULT_GRID}`);
    return matches.map(placement => placement.id);
  });
  for (const maxed of !settlementOnly && nodeIds.length ? [false, true] : [false]) {
    for (const seed of seeds) {
      const save = freshBphSave(seed);
      save.chapter = chapter - 1;
      save.purchasedPlacements = [...new Set([...fixture.purchasedPlacements, ...(maxed ? goldPlacements : [])])];
      save.unitUpgrades = structuredClone(fixture.unitUpgrades);
      const setup = {
        purchasedPlacements: [...save.purchasedPlacements],
        unitUpgrades: structuredClone(save.unitUpgrades),
        goldEffects: maxed ? activeBphEffects(save).filter(effect => goldPlacements.some(id => effect.targets.placementId === id)) : [],
      };
      if (maxed) assert(goldPlacements.every(id => setup.goldEffects.some(effect => effect.targets.placementId === id)),
        "Some selected gold placements are not active");
      const result = await simulateSurvival({
        seed, chapter, general, state, policy, account: { meta: freshMeta(), save }, sampleAt,
        ...(settlementOnly ? { capSeconds: 1200 } : {}),
      });
      assert(result.timeSeries && result.finalEconomy && result.finalCommanders);
      const samples = result.timeSeries;
      const final = result.finalEconomy;
      runs.push({
        seed, state, maxed, setup, survivalSeconds: result.survival, phase: result.phase,
        won: result.phase === "won", capped: result.capped, castleFallTime: result.castleFallTime,
        settlement: result.capped ? null : {
          medalsBeforeSettlement: result.mastery.immediate,
          medalsAfterSettlement: result.mastery.final,
          medalsCreditedAtSettlement: result.mastery.final - result.mastery.immediate,
          medalsEarnedDuringRun: result.mastery.delta,
        },
        final, finalCommanders: result.finalCommanders, purchases: result.purchaseLog,
        checkpoints: checkpoints.map(minute => {
          const seconds = minute * 60;
          const sample = samples.find(row => row.scheduledTime === seconds);
          if (sample) return { minute, reached: true, sample };
          if (result.survival >= seconds - 1e-9 && result.survival <= seconds + .05)
            return { minute, reached: true, sample: { time: result.survival, ...final } };
          return { minute, reached: false, sample: null };
        }),
        commanderWindows: commanderTimes.map(time => {
          const before = samples.find(row => row.scheduledTime === time - .05) ?? null;
          const after = samples.find(row => row.scheduledTime === time + 3) ?? null;
          return { time, before, after,
            enemySpawns: before && after ? after.uniqueEnemySpawns - before.uniqueEnemySpawns : null,
            markedEscortSpawns: before && after ? after.commanderEscortSpawns - before.commanderEscortSpawns : null };
        }),
      });
    }
  }
}

const settlements = settlementOnly ? (["lost", "won"] as const).map(outcome => {
  const cohort = runs.filter(run => run.state === (outcome === "lost" ? "none" : "full144"));
  const matched = cohort.filter(run => run.phase === outcome && run.settlement !== null);
  const medals = matched.flatMap(run => run.settlement?.medalsCreditedAtSettlement ?? []);
  return {
    intendedOutcome: outcome, state: cohort[0]?.state, matchedSeeds: matched.map(run => run.seed),
    otherOutcomes: cohort.filter(run => run.phase !== outcome).map(run => ({ seed: run.seed, phase: run.phase })),
    meanMedalsCreditedAtSettlement: medals.length ? medals.reduce((sum, amount) => sum + amount, 0) / medals.length : null,
  };
}) : undefined;
console.log(JSON.stringify({
  chapter, general, policy, seeds, states, nodeIds, runs, settlements,
  observationHorizon: settlementOnly ? "1200s" : "production duration plus 0.1s",
  enemySpawns: "Unique enemy IDs from production enemy-spawn events, including passengers when put onboard. Live map count includes ships and excludes onboard passengers, who are reported separately.",
  pouchGold: "Direct kill gold includes pouch rewards. Pouch enemy spawns and kills are counted separately.",
}, null, 2));
