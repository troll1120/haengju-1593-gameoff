import type { BphClass, BphFxContext, BphFxEvent, BphSave } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { BPH_CLASS_TEXT, BPH_CODEX_SLOTS, BPH_CODEX_TEXT, BPH_GENERAL_TEXT } from "./bph-codex-data";
import { BPH_GENERALS } from "./bph-commanders";
import { grantBphRelic } from "./bph-account";
import { bphCodexCompletion } from "./bph-codex-groups";

/** One coin is below the three-coin starting purse and buys no repeat income. */
export const BPH_CODEX_DISCOVERY_GOLD = 1;
export const BPH_CODEX_CLASS_REWARDS: Readonly<Record<BphClass, string>> = {
  spearman: "Relic1_CharmWarrior", archer: "Relic1_Rapier",
  militia: "Relic1_FourLeafClover", monk: "Relic2_Nature_TalkingBeet",
  hwacha: "Relic1_GiantsMight", chongtong: "Relic1_Club",
  joseon_cavalry: "R_HeroMoveSpeed", panokseon: "Relic1_TomeDuration",
};
export const BPH_CODEX_COSMETICS = [
  { percent: 25, id: "title:collector", name: "기록자" },
  { percent: 50, id: "frame:bronze", name: "청동 초상틀" },
  { percent: 100, id: "frame:gold", name: "황금 초상틀" },
] as const;
export function bphCodexRewardView(save: BphSave) {
  const claimed = save.codexRewards?.claimed ?? [];
  return {
    pendingGold: save.codexRewards?.pendingGold ?? 0,
    anecdotes: save.discovered.filter(id => claimed.includes(`discovery:${id}`))
      .map(id => ({ id, text: bphCodexAnecdote(id) })),
    cosmetics: BPH_CODEX_COSMETICS.filter(cosmetic => claimed.includes(cosmetic.id)),
    classes: Object.entries(BPH_CODEX_CLASS_REWARDS).map(([classId, itemId]) => ({
      classId, itemId, claimed: claimed.includes(`class:${classId}`),
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
  for (const [classId, relicId] of Object.entries(BPH_CODEX_CLASS_REWARDS)) {
    const members = BPH_CODEX_SLOTS.filter(slot => slot.kind === "hero"
      && BPH_PROFILES[slot.id]?.classId === classId);
    const key = `class:${classId}`;
    if (members.length && members.every(slot => save.discovered.includes(slot.id))
      && !rewards.claimed.includes(key)) {
      grantBphRelic(save, relicId);
      rewards.claimed.push(key);
    }
  }
  const { found, total } = bphCodexCompletion(save);
  for (const cosmetic of BPH_CODEX_COSMETICS) {
    if (found * 100 >= total * cosmetic.percent
      && !rewards.claimed.includes(cosmetic.id)) rewards.claimed.push(cosmetic.id);
  }
}
export function discoverBphCodex(save: BphSave, id: string): boolean {
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
      if (event.enemy.bphProfileId) discoverBphCodex(context.save, event.enemy.bphProfileId);
      break;
    default: return;
  }
  const rewards = state(context.save);
  if (rewards.pendingGold === 0) return;
  context.run.gold += rewards.pendingGold;
  context.save.coins = context.run.gold;
  rewards.pendingGold = 0;
}
