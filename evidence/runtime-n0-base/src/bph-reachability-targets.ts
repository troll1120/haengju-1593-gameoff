import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES } from "./bph-upgrades";

/** Original partitions stay intact. The isolated shop branch is a later D1 target.
 * Training is read from the effective registry, so merging chaos adds its 20
 * normal paid placements without changing the original 144/74 audit. */
export function bphReachabilityTargets() {
  const normal = [...BPH_PLACEMENTS.values()].filter(p => p.gridId === BPH_DEFAULT_GRID &&
    p.nodeId && BPH_UPGRADE_NODES[p.nodeId]?.type === 0 && !BPH_HIDDEN_UPGRADES.has(p.nodeId));
  const training20 = normal.filter(p => p.nodeId?.startsWith("HJ_ArmyTraining")).map(p => p.id);
  const original = normal.filter(p => !training20.includes(p.id));
  const current144 = original.filter(p => p.prestigeLock === 0 &&
    (p.nodeId ? BPH_UPGRADE_NODES[p.nodeId].values.prestigeLock ?? 0 : 0) === 0).map(p => p.id);
  const laterShop: string[] = current144.filter(id => id === "_SkillTreeMain_Demo:17:6");
  const core143 = current144.filter(id => !laterShop.includes(id));
  const future74 = original.filter(p => !current144.includes(p.id)).map(p => p.id);
  return { current144, core143, laterShop, future74, training20, survival: [...core143, ...training20] };
}
