import { strict as assert } from "node:assert";
import { BPH_PLACEMENTS, activeBphEffects, prepareBphUpgrades } from "../src/bph-upgrades";
import { BPH_UPGRADE_NODES } from "../src/bph-upgrade-data";
import { ensureBphSave } from "../src/bph-session";
import { bphConsumers, bphFxContext, bindBphConsumers, dispatchBphEffects } from "../src/bph-fx-dispatch";
import type { BphDrawResult } from "../src/bph-contract";
import type { Meta } from "../src/meta";
import { troopCap, troopCount } from "../src/rules";
import type { Run } from "../src/rules";

export async function prepareBalanceUpgrades() { await prepareBphUpgrades(); }
export function fullTreeEffects(meta: Meta) {
  const save = ensureBphSave(meta);
  save.purchasedNodes = Object.keys(BPH_UPGRADE_NODES);
  save.purchasedPlacements = [...BPH_PLACEMENTS.keys()];
  return activeBphEffects(save);
}
export const fullTreeInventory = () => ({
  nodes: Object.keys(BPH_UPGRADE_NODES).length, placements: BPH_PLACEMENTS.size,
});
export function observeBalanceRun(run: Run) {
  const context = bphFxContext(run);
  assert(context, "Production BPH effect context is required");
  let maxTroops = troopCount(run);
  const sample = () => { maxTroops = Math.max(maxTroops, troopCount(run)); };
  // Preserve every production consumer and its ordering; the added observation only reads state.
  bindBphConsumers(context, bphConsumers().map(consumer => ({
    ...consumer,
    onEvent(ctx, event) { sample(); consumer.onEvent?.(ctx, event); sample(); },
  })), false);
  dispatchBphEffects(run, { kind: "run-start" });
  sample();
  return { sample, maximum: () => maxTroops };
}
export function auditBalanceReceipts(run: Run, receipts: readonly BphDrawResult[], firstId: number) {
  const added = run.squads.flatMap(squad => squad.soldiers).filter(unit => unit.id >= firstId);
  const receiptEvidence = receipts.map(receipt => {
    const base = receipt.cards.reduce((sum, card) => sum + card.copies, 0);
    const spawned = receipt.spawned ?? base, requested = base * (receipt.multiplier ?? 1);
    const direct = added.filter(unit => unit.bph?.resultId === receipt.id && unit.bph.cause === "pack");
    // Summons and duplicates are separately visible, rather than silently folded into spawned.
    const related = added.filter(unit => unit.bph?.resultId === receipt.id);
    assert.equal(spawned, requested, "Uncapped receipt must retain every multiplier copy");
    return {
      id: receipt.id, packId: receipt.packId, multiplier: receipt.multiplier ?? 1,
      base, requested, spawned, clipped: spawned < requested,
      directRosterGain: direct.length, relatedRosterGain: related.length,
      matchesDirectRoster: spawned === direct.length,
      matchesTotalRoster: spawned === related.length,
    };
  });
  return {
    receiptEvidence, rosterGain: added.length,
    units: receiptEvidence.reduce((sum, receipt) => sum + receipt.spawned, 0),
    clipped: receiptEvidence.some(receipt => receipt.clipped),
    cap: troopCap(run),
  };
}
