import type { BphSave } from "./bph-contract";
import { BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import type { BphUpgradeNode } from "./bph-upgrade-data";

export const BPH_UNKNOWN_NAME = "???";
export const BPH_SILHOUETTE_ART = "./art/icons/codex-undiscovered-silhouette.webp";

/** The packs an upgrade itself unlocks (a shop unlock, or the pack a rift entrance names). It is the way to them,
 * so they never conceal it: otherwise the tactics unlock and the nature rift would stay buttonless ??? cells until
 * the very pack only they can open. */
export function bphOwnUnlockPacks(node: BphUpgradeNode): ReadonlySet<string> {
  const own = node.effects.flatMap(({ type, targets }) =>
    type === "ShopUnlockTargetPack" && targets.targetPack ? [targets.targetPack] : []);
  // Type 6 is a rift entrance (bph-shop BPH_RIFT_NODE_TYPE); importing it here would pull the shop into identity checks.
  if (node.type === 6 && node.refs.targetPack) own.push(node.refs.targetPack);
  return new Set(own);
}

/** Check authored identity references independently of the upgrade's price and readiness. */
export function bphConcealsUpgradeIdentity(save: BphSave, node: BphUpgradeNode, unlockedPacks: ReadonlySet<string>): boolean {
  const own = bphOwnUnlockPacks(node);
  const locked = (id: string) =>
    (Object.hasOwn(BPH_PROFILES, id) || Object.hasOwn(BPH_TOMES, id)) && !save.discovered.includes(id)
    || Object.hasOwn(BPH_PACKS, id) && !unlockedPacks.has(id) && !own.has(id);
  return node.type === 5 && !save.relicState.owned.includes(node.id)
    || Object.entries(node.refs).some(([key, id]) => key !== "questRelicPackReward" && locked(id))
    || node.effects.some(({ targets }) => {
      const relic = targets.targetRelic;
      return Boolean(relic && !save.relicState.owned.includes(relic)) || Object.values(targets).some(locked);
    });
}
