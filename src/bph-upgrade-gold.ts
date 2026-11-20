import type { BphEffect } from "./bph-contract";
import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import type { BphPlacement, BphUpgradeGrid, BphUpgradeNode } from "./bph-upgrade-data";

const source = "haengju:gold-economy";
const upgrades = [
  {
    id: "HJ_GoldGain", type: "BattleGoldGainBonus", bonus: 0.2, mastery: 15,
    name: "Increased Gold Gain", ko: "금화 획득 증가",
    cells: [[24, 14], [24, 13], [24, 12]],
  },
  {
    id: "HJ_GoldPouchSpawn", type: "GoldPouchSpawnChanceBonus", bonus: 0.5, mastery: 25,
    name: "Increased Gold Pouch Enemy Spawn Chance", ko: "금화 주머니 적 출현 증가",
    cells: [[25, 17], [25, 18]],
  },
] as const;

export function bphGoldUpgradeName(effect: BphEffect, lang: "ko" | "en"): string | undefined {
  const upgrade = upgrades.find(entry => entry.type === effect.type);
  return lang === "ko" ? upgrade?.ko : upgrade?.name;
}

export type BphGoldUpgradeEffects = {
  readonly goldGainMultiplier: number;
  readonly goldPouchSpawnChanceMultiplier: number;
};

/** Ranks add a fraction of the base value, not of the preceding rank's value. */
export function bphGoldUpgradeEffects(effects: readonly BphEffect[]): BphGoldUpgradeEffects {
  let goldGainBonus = 0, pouchSpawnBonus = 0;
  for (const effect of effects) {
    if (effect.type === upgrades[0].type) goldGainBonus += effect.value;
    if (effect.type === upgrades[1].type) pouchSpawnBonus += effect.value;
  }
  return { goldGainMultiplier: 1 + goldGainBonus, goldPouchSpawnChanceMultiplier: 1 + pouchSpawnBonus };
}

// Ranks share one definition per branch. The last cell is a dead end with no cross-branch edges.
const placements: readonly BphPlacement[] = upgrades.flatMap(({ id, cells }) =>
  cells.map(([x, y]) => ({
    id: `${BPH_DEFAULT_GRID}:${x}:${y}`, gridId: BPH_DEFAULT_GRID, x, y, nodeId: id,
    source, start: false, prestigeLock: 0, prestigeIgnore: 0,
  })),
);

const nodes: Readonly<Record<string, BphUpgradeNode>> = Object.fromEntries(upgrades.map(upgrade => [
  upgrade.id, {
    id: upgrade.id, source, name: upgrade.name, description: "", type: 0,
    costs: {
      mastery: upgrade.mastery, skull: 0, coinIncome: 0, zenith: 0, ink: 0, fruit: 0,
      foilium: 0, shard: 0, runeA: 0, runeB: 0, runeC: 0, prestigePoint: 0, relic: 0,
    },
    values: { nodeType: 0, connectUp: 1, connectDown: 1 },
    refs: {}, thresholds: [], raw: {},
    effects: [{
      nodeId: upgrade.id, type: upgrade.type, value: upgrade.bonus, effectPower: 0,
      effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {},
    }],
  } satisfies BphUpgradeNode,
]));

type UpgradeRegistry = {
  readonly nodes: Readonly<Record<string, BphUpgradeNode>>;
  readonly grids: readonly BphUpgradeGrid[];
};

export function withBphGoldUpgrades(data: UpgradeRegistry): UpgradeRegistry {
  return {
    nodes: { ...data.nodes, ...nodes },
    grids: data.grids.map(grid => grid.id === BPH_DEFAULT_GRID
      ? { ...grid, placements: [...grid.placements, ...placements] } : grid),
  };
}
