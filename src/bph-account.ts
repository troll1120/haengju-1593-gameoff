import type { BphEffect, BphFxEvent, BphPackInstance, BphSave } from "./bph-contract";
import { dispatchBphAccountEvent } from "./bph-fx-dispatch";
import type { BphQuestClaim } from "./bph-effects-entry";
import { activateBphQuests } from "./bph-upgrades";

const pendingMasteryClaims = new WeakMap<BphSave, Set<string>>();

export function grantBphMastery(save: BphSave, request: {
  readonly receiptId: string; readonly amount: number;
  readonly source: Extract<BphFxEvent, { kind: "mastery-gained" }>["source"];
}): number {
  const key = `mastery:${request.receiptId}`;
  const pending = pendingMasteryClaims.get(save) ?? new Set<string>();
  if (save.lifecycle.claimed.includes(key) || pending.has(key)) return 0;
  pendingMasteryClaims.set(save, pending); pending.add(key);
  try {
    const grant = { amount: request.amount };
    dispatchBphAccountEvent(save, { kind: "mastery-gained", ...request, grant });
    // Commit balance and persistent receipt together after the pre-credit hook.
    save.resources.mastery += grant.amount; save.lifecycle.claimed.push(key);
    return grant.amount;
  } finally {
    pending.delete(key);
    if (pending.size === 0) pendingMasteryClaims.delete(save);
  }
}
export function enterBphImprovements(save: BphSave): boolean {
  activateBphQuests(save);
  const key = `improvements:${save.lifecycle.managementVisit}`;
  if (save.lifecycle.claimed.includes(key)) return false;
  save.lifecycle.claimed.push(key);
  dispatchBphAccountEvent(save, { kind: "improvements-start", visitId: save.lifecycle.managementVisit });
  return true;
}
export function startBphCampaignAttempt(save: BphSave): boolean {
  const key = `campaign:${save.lifecycle.campaignAttempt}`;
  if (save.lifecycle.claimed.includes(key)) return false;
  save.lifecycle.claimed.push(key);
  dispatchBphAccountEvent(save, { kind: "campaign-start", attemptId: save.lifecycle.campaignAttempt });
  return true;
}
export function notifyBphQuestCompletion(save: BphSave, placementId: string, receipt?: BphQuestClaim): boolean {
  const claim = save.questProgress[`claims:${placementId}`] ?? 0;
  const key = `quest:${placementId}:${claim}`;
  if (claim <= 0 || save.lifecycle.claimed.includes(key)) return false;
  save.lifecycle.claimed.push(key);
  dispatchBphAccountEvent(save, { kind: "quest-completed", placementId, claim, ...(receipt ? { receipt } : {}) });
  return true;
}
export function projectBphSalary(save: BphSave, effects: readonly BphEffect[]): void {
  const salary = effects.filter(effect => effect.type === "SalaryFlatBonus").reduce((sum, effect) => sum + effect.value, 0);
  save.income += salary - save.salaryApplied; save.salaryApplied = salary;
}
type BphRelicAcquisition = { readonly relicId: string };
const relicAcquisitions = new WeakMap<BphSave, BphRelicAcquisition[]>();

export function takeBphRelicAcquisitions(save: BphSave): readonly BphRelicAcquisition[] {
  const acquisitions = relicAcquisitions.get(save);
  relicAcquisitions.delete(save);
  return acquisitions ?? [];
}

/** Eligibility is permanent, even if the account later resets a placement or opens more packs. */
export function discoverBphRelic(save: BphSave, relicId: string): void {
  if (!save.relicState.discovered.includes(relicId)) save.relicState.discovered.push(relicId);
}
export function claimBphRelic(save: BphSave, relicId: string): boolean {
  if (!save.relicState.discovered.includes(relicId) || !grantBphRelic(save, relicId)) return false;
  save.lifecycle.claimed.push(`relic-notice:${relicId}`);
  const acquisitions = relicAcquisitions.get(save) ?? [];
  acquisitions.push({ relicId });
  relicAcquisitions.set(save, acquisitions);
  return true;
}
export function grantBphRelic(save: BphSave, relicId: string): boolean {
  if (save.relicState.owned.includes(relicId)) return false;
  save.relicState.owned.push(relicId);
  discoverBphRelic(save, relicId);
  return true;
}
/** Every account holds one slot. The saved count is what was gained on top of it, so a save
 * from before the relic tab reads the same as a new one and no stored value changes. */
export const bphRelicSlots = (save: BphSave): number => 1 + save.relicState.slots;
export function equipBphRelic(save: BphSave, relicId: string): boolean {
  const relics = save.relicState;
  if (!relics.owned.includes(relicId) || relics.destroyed.includes(relicId)
    || relics.equipped.includes(relicId) || relics.equipped.length >= bphRelicSlots(save)) return false;
  relics.equipped.push(relicId); return true;
}
export function unequipBphRelic(save: BphSave, relicId: string): boolean {
  const index = save.relicState.equipped.indexOf(relicId);
  if (index < 0) return false;
  save.relicState.equipped.splice(index, 1); return true;
}
export function recoverBphRelic(save: BphSave, request: {
  readonly relicId: string; readonly effects: readonly BphEffect[];
}): boolean {
  const relics = save.relicState, index = relics.destroyed.indexOf(request.relicId);
  const cost = 5 + relics.recoveries * 5;
  if (index < 0 || !request.effects.some(e => e.type === "RecoverDestroyedRelicsWithFoilium" && e.value > 0)
    || save.resources.foilium < cost) return false;
  save.resources.foilium -= cost; relics.destroyed.splice(index, 1); relics.recoveries++;
  dispatchBphAccountEvent(save, { kind: "relic-recovered", relicId: request.relicId, cost });
  return true;
}
export function grantBphPacks(save: BphSave, request: {
  readonly packId: string; readonly count: number;
  readonly metadata?: Pick<BphPackInstance, "sourceBuilding" | "sourceWave" | "foilChanceBonus" | "giantChance">;
}): BphPackInstance[] {
  const granted: BphPackInstance[] = [];
  for (let i = 0; i < request.count; i++) {
    const instance: BphPackInstance = { id: save.nextPackId++, packId: request.packId, box: false, ...request.metadata };
    save.inventory.push(instance); granted.push(instance);
    if (instance.sourceWave) dispatchBphAccountEvent(save, { kind: "wave-pack-spawn", waveId: instance.sourceWave, instance });
  }
  return granted;
}
