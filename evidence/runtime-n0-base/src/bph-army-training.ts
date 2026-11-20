import type { BphUpgradeGrid, BphUpgradeNode, BphPlacement } from "./bph-upgrade-data";

const gridId = "_SkillTreeMain_Demo";
const source = "haengju:army-training";
const stats = ["HeroAttackPower", "HeroAttackSpeed", "HeroDuration", "HeroMoveSpeed"] as const;
// From the existing connector (22,15), descend four free cells, then head east.
// Only the previous/next directions open, so nearby original branches cannot skip training.
export const BPH_ARMY_TRAINING: readonly BphPlacement[] = Array.from({ length: 20 }, (_, index) => {
  const x = index < 4 ? 22 : 19 + index, y = index < 4 ? 14 - index : 11;
  return { id: `${gridId}:${x}:${y}`, gridId, x, y,
    nodeId: `HJ_ArmyTraining${String(index + 1).padStart(2, "0")}`,
    source, start: false, prestigeLock: 0, prestigeIgnore: 0 };
});

const trainingNodes: Readonly<Record<string, BphUpgradeNode>> = Object.fromEntries(
  BPH_ARMY_TRAINING.map((p, index) => {
    const id = p.nodeId ?? "", type = stats[index % stats.length];
    const previous = BPH_ARMY_TRAINING[index - 1] ?? { x: 22, y: 15 };
    const next = BPH_ARMY_TRAINING[index + 1];
    return [id, {
      id, source, name: id, description: "", type: 0,
      costs: { mastery: 50 + 10 * index, skull: 0, coinIncome: 0, zenith: 0, ink: 0,
        fruit: 0, foilium: 0, shard: 0, runeA: 0, runeB: 0, runeC: 0, prestigePoint: 0, relic: 0 },
      values: {
        nodeType: 0, targetClass: 0,
        connectLeft: Number(previous.x < p.x),
        connectRight: Number(next !== undefined && next.x > p.x),
        connectUp: Number(previous.y > p.y),
        connectDown: Number(next !== undefined && next.y < p.y),
      },
      refs: {}, thresholds: [], raw: {},
      effects: [{ nodeId: id, type, value: .02, effectPower: 0, effectPowerScale: 0,
        stackCap: 0, countStep: 0, targets: { targetClass: "0", nodeType: "0" } }],
    } satisfies BphUpgradeNode];
  }),
);

/** Merge at the registration boundary, both synchronously and after the production lazy load. */
export function withBphArmyTraining(data: {
  readonly nodes: Readonly<Record<string, BphUpgradeNode>>;
  readonly grids: readonly BphUpgradeGrid[];
}): { readonly nodes: Readonly<Record<string, BphUpgradeNode>>; readonly grids: readonly BphUpgradeGrid[] } {
  return {
    nodes: { ...data.nodes, ...trainingNodes },
    grids: data.grids.map(grid => grid.id === gridId
      ? { ...grid, placements: [...grid.placements, ...BPH_ARMY_TRAINING] } : grid),
  };
}
