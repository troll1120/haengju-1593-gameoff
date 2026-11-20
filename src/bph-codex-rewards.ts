import type { BphClass, BphFxContext, BphFxEvent, BphSave } from "./bph-contract";
import { BPH_PACKS, BPH_PROFILES } from "./bph-data";
import { activeBphEffects } from "./bph-upgrades";
import { bphUnlockedTroopPacks } from "./bph-shop";
import { BPH_CLASS_TEXT, BPH_CODEX_SLOTS, BPH_CODEX_TEXT, BPH_GENERAL_TEXT } from "./bph-codex-data";
import { BPH_GENERALS } from "./bph-commanders";
import { discoverBphRelic } from "./bph-account";
import { bphEnemyBaseProfile } from "./bph-waves";

/** One coin is below the three-coin starting purse and buys no repeat income. */
export const BPH_CODEX_DISCOVERY_GOLD = 1;
export const BPH_CODEX_CLASS_REWARDS: Readonly<Record<BphClass, string>> = {
  spearman: "Relic1_CharmWarrior", archer: "Relic1_Rapier",
  militia: "Relic1_FourLeafClover", monk: "Relic2_Nature_TalkingBeet",
  hwacha: "Relic1_GiantsMight", chongtong: "Relic1_Club",
  joseon_cavalry: "R_HeroMoveSpeed", panokseon: "Relic1_TomeDuration",
};
export function bphCodexRewardView(save: BphSave) {
  const claimed = save.codexRewards?.claimed ?? [];
  return {
    pendingGold: save.codexRewards?.pendingGold ?? 0,
    anecdotes: save.discovered.filter(id => claimed.includes(`discovery:${id}`))
      .map(id => ({ id, text: bphCodexAnecdote(id) })),
    classes: Object.entries(BPH_CODEX_CLASS_REWARDS).map(([classId, itemId]) => ({
      classId, itemId, claimed: claimed.includes(`class:${classId}`) && save.relicState.owned.includes(itemId),
    })),
  };
}

const collectionIds = new Set<string>(BPH_CODEX_SLOTS.map(slot => slot.id));
function generalIndex(id: string): number {
  return BPH_GENERALS.findIndex(name => id === `general:${name}`);
}
function validId(id: string): boolean {
  return collectionIds.has(id) || generalIndex(id) >= 0;
}
/** Completion follows the troop packs this account can actually draw. */
export function bphObtainableProfiles(save: BphSave): ReadonlySet<string> {
  return new Set(bphUnlockedTroopPacks(save, activeBphEffects(save))
    .flatMap(id => BPH_PACKS[id].pool.filter(card => BPH_PROFILES[card.id]).map(card => card.id)));
}
/** A class completes on its obtainable members; a class with none keeps the full roster. */
export function bphCodexClassRequirement(save: BphSave, classId: string, obtainable = bphObtainableProfiles(save)): readonly string[] {
  const members = BPH_CODEX_SLOTS.filter(slot => slot.kind === "hero" && BPH_PROFILES[slot.id]?.classId === classId)
    .map(slot => slot.id);
  const required = members.filter(id => obtainable.has(id));
  return required.length ? required : members;
}
function state(save: BphSave) {
  return save.codexRewards ??= { version: 1, claimed: [], pendingGold: 0 };
}
export function bphCodexAnecdote(id: string): string {
  const profile = BPH_PROFILES[id], index = generalIndex(id);
  const text = profile ? BPH_CODEX_TEXT[BPH_CLASS_TEXT[profile.classId]]
    : index >= 0 ? BPH_CODEX_TEXT[BPH_GENERAL_TEXT[index]] : undefined;
  return text ? "text" in text ? text.text : text.title : "전장에서 마주한 모습을 도감에 기록했다.";
}
/** Backfill rewards for legacy discoveries; claims and pending currency save atomically. */
export function reconcileBphCodexRewards(save: BphSave): void {
  const rewards = state(save);
  for (const id of save.discovered) {
    if (!collectionIds.has(id) || rewards.claimed.includes(`discovery:${id}`)) continue;
    rewards.claimed.push(`discovery:${id}`);
    rewards.pendingGold += BPH_CODEX_DISCOVERY_GOLD;
  }
  const obtainable = bphObtainableProfiles(save);
  for (const [classId, relicId] of Object.entries(BPH_CODEX_CLASS_REWARDS)) {
    const key = `class:${classId}`;
    if (rewards.claimed.includes(key)) continue;
    const members = bphCodexClassRequirement(save, classId, obtainable);
    if (members.length && members.every(id => save.discovered.includes(id))) {
      discoverBphRelic(save, relicId);
      rewards.claimed.push(key);
    }
  }
}
export function discoverBphCodex(save: BphSave, id: string, _newlyDrawn?: boolean): boolean {
  if (!validId(id)) return false;
  const fresh = !save.discovered.includes(id);
  if (fresh) save.discovered.push(id);
  reconcileBphCodexRewards(save);
  return fresh;
}
/** Uses emitted runtime identities, never a guessed class-to-profile mapping. */
export function recordBphCodexEvent(context: BphFxContext, event: BphFxEvent): void {
  switch (event.kind) {
    case "run-start":
      for (const name of context.save.unlockedGenerals) discoverBphCodex(context.save, `general:${name}`);
      for (const squad of context.run.squads) {
        discoverBphCodex(context.save, `general:${squad.general}`);
        for (const unit of squad.soldiers) {
          const id = context.profileId(unit);
          if (id) discoverBphCodex(context.save, id);
        }
      }
      break;
    case "unit-spawn": discoverBphCodex(context.save, event.profileId); break;
    case "enemy-spawn":
      if (event.enemy.bphProfileId) discoverBphCodex(context.save, bphEnemyBaseProfile(event.enemy.bphProfileId));
      break;
    default: return;
  }
  const rewards = state(context.save);
  if (rewards.pendingGold === 0) return;
  context.run.gold += rewards.pendingGold;
  context.save.coins = context.run.gold;
  rewards.pendingGold = 0;
}
