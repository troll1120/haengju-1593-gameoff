import { BPH_DEFAULT_GRID, BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES } from "../src/bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES } from "../src/bph-hidden-upgrades";
import { prepareBphUpgrades } from "../src/bph-upgrades";
import { bphReachabilityTargets } from "../src/bph-reachability-targets";
import { migrateBphHiddenUpgrades } from "../src/bph-upgrade-migration";
import { BPH_UNIT_UPGRADES, bphUnitUpgradePrice, buyBphUnitUpgrade } from "../src/bph-unit-upgrades";
import { freshBphSave } from "../src/bph-save";
import type { BphSave } from "../src/bph-contract";

const UNIT_TRACKS = ["attack", "attackSpeed", "health", "special"] as const;
// Preserve the audited progression cohorts when the gold-only overlay is available.
const GOLD_OVERLAY_NODE_IDS = new Set(["HJ_GoldGain", "HJ_GoldPouchSpawn"]);

export const SURVIVAL_STATES = ["none", "typical", "full144", "FULL218", "full143", "full163"] as const;
export type SurvivalState = typeof SURVIVAL_STATES[number];

// Exact states.json selection, seed 16: 896 mastery spent from a synthetic 1000 budget.
// This is a conditional progression scenario, not observed player telemetry.
const TYPICAL22 = [
  "23:15", "27:16", "19:14", "18:14", "27:14", "27:17", "27:13", "19:13",
  "27:12", "28:16", "28:17", "28:14", "29:14", "30:16", "18:13", "17:14",
  "16:14", "30:17", "28:12", "29:12", "16:13", "19:16",
].map(position => `_SkillTreeMain_Demo:${position}`);

export class SurvivalFixtureError extends Error {
  constructor(readonly detail: string) { super(detail); this.name = "SurvivalFixtureError"; }
}

export type SurvivalFixture = {
  readonly state: SurvivalState;
  readonly purchasedPlacements: readonly string[];
  readonly unitUpgrades: BphSave["unitUpgrades"];
  readonly provenance: {
    readonly sources: readonly string[];
    readonly construction: string;
    readonly account: string;
    readonly diagnostic: boolean;
    readonly placements: number;
    readonly futureExcluded: number;
  };
};

/** Matches demo-reachable-placements.json's authored zero-prestige partition exactly.
 * Full fixtures grant effects; they do not claim to have paid costs or satisfied discovery gates.
 */
export async function survivalFixture(state: SurvivalState): Promise<SurvivalFixture> {
  await prepareBphUpgrades();
  const grid = BPH_UPGRADE_GRIDS.find(grid => grid.id === BPH_DEFAULT_GRID);
  if (!grid) throw new SurvivalFixtureError("Current demo grid is unavailable");
  const full = grid.placements.filter(p => p.nodeId &&
    BPH_UPGRADE_NODES[p.nodeId]?.type === 0 && !BPH_HIDDEN_UPGRADES.has(p.nodeId) && !GOLD_OVERLAY_NODE_IDS.has(p.nodeId));
  const current = full.filter(p => p.nodeId && p.prestigeLock === 0 &&
    (BPH_UPGRADE_NODES[p.nodeId]?.values.prestigeLock ?? 0) === 0);
  if (full.length !== 110 || current.length !== 63)
    throw new SurvivalFixtureError(`Audit drift: current=${current.length}, diagnostic=${full.length}; refresh audited mapping`);
  let purchasedPlacements: readonly string[];
  let unitUpgrades: BphSave["unitUpgrades"] = {};
  let construction: string;
  switch (state) {
    case "none":
      purchasedPlacements = []; construction = "No purchased placements"; break;
    case "typical": {
      const typical = typicalAfterUnitMove();
      purchasedPlacements = typical.purchasedPlacements; unitUpgrades = typical.unitUpgrades;
      construction = "states.json typical22 (seed16) after the production unit-upgrade refund; the refund buys the cheapest tier-1 unit stages"; break;
    }
    case "full144":
      purchasedPlacements = current.map(p => p.id); unitUpgrades = maxUnitUpgrades();
      construction = "Nonhidden type0 demo placements with both placement and node prestigeLock=0, plus every unit upgrade stage"; break;
    case "FULL218":
      purchasedPlacements = full.map(p => p.id);
      construction = "Diagnostic nonhidden type0 demo ceiling; includes future74 and ignores acquisition gates"; break;
    case "full143":
      purchasedPlacements = bphReachabilityTargets().core143;
      construction = "Diagnostic core143 effects; later dimension1 shop target excluded; acquisition not simulated"; break;
    case "full163": {
      const targets = bphReachabilityTargets();
      if (targets.training20.length !== 20)
        throw new SurvivalFixtureError("full163 requires the integrated chaos training20 registry");
      purchasedPlacements = targets.survival;
      construction = "Diagnostic core143 plus normal paid training20 effects; acquisition not simulated"; break;
    }
  }
  return {
    state, purchasedPlacements, unitUpgrades,
    provenance: {
      sources: [
        "lane-results/2026-11-17/survival-balance/states.json",
        "lane-results/2026-11-17/survival-balance/demo-reachable-placements.json",
        "src/bph-upgrade-data.ts", "src/bph-hidden-upgrades.ts",
      ],
      construction, account: "Fresh seeded account; no discoveries, quest claims or prestige granted",
      diagnostic: state === "FULL218", placements: purchasedPlacements.length,
      futureExcluded: state === "FULL218" ? 0 : full.length - current.length,
    },
  };
}

function typicalAfterUnitMove(): Pick<BphSave, "purchasedPlacements" | "unitUpgrades"> {
  const save = freshBphSave(0);
  save.purchasedPlacements = [...TYPICAL22];
  migrateBphHiddenUpgrades(save);
  const units = ["Hero1_Squire", "Hero1_Barbarian", "Hero1_Archer"];
  save.discovered = [...new Set([...save.discovered, ...units])];
  for (;;) {
    const next = units.flatMap(id => UNIT_TRACKS.flatMap(track => {
      const price = bphUnitUpgradePrice(save, id, track);
      return price === undefined ? [] : [{ id, track, price }];
    })).sort((a, b) => a.price - b.price)[0];
    if (!next || !buyBphUnitUpgrade(save, next.id, next.track)) break;
  }
  return { purchasedPlacements: save.purchasedPlacements, unitUpgrades: save.unitUpgrades };
}

function maxUnitUpgrades(): BphSave["unitUpgrades"] {
  // Keep the old maxed-account fixture at its original stage depth.
  return Object.fromEntries([...BPH_UNIT_UPGRADES].map(([id, row]) => [id, {
    ...Object.fromEntries(row.statTracks.map(track => [track, 5])), special: row.specialMax,
  }]));
}
