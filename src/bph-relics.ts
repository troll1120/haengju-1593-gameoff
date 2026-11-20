import type { BphSave } from "./bph-contract";
import { BPH_CODEX_CLASS_REWARDS } from "./bph-codex-rewards";
import { bphRelicSlots, equipBphRelic, unequipBphRelic } from "./bph-account";
import { BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { objects } from "./bph-upgrade-labels";
import { phrase } from "./bph-upgrade-effect-text";
import { t } from "./i18n";

const NAMES: Readonly<Record<string, readonly [string, string]>> = {
  _REMOVERelic1_Flail: ["넓은 날 낫", "Wide Scythe"],
  Relic1_CharmArcanist: ["승병 병서", "Monks' Tactics Manual"],
  Relic1_CharmMystic: ["승병의 태양 가면", "Monks' Sun Mask"],
  Relic1_CharmOutcast: ["의병의 엽전 주머니", "Militia Coin Purse"],
  Relic1_CharmWarrior: ["창병의 출전 나발", "Spearmen's War Trumpet"], Relic1_Rapier: ["환도", "Hwando Saber"],
  Relic1_FourLeafClover: ["말편자", "Horseshoe"], Relic2_Nature_TalkingBeet: ["수군 북", "Naval War Drum"],
  Relic1_GiantsMight: ["편곤", "War Flail"], Relic1_Club: ["철퇴", "Iron Mace"],
  Relic1_Rare: ["뇌전 비파", "Lightning Lute"],
  R_HeroMoveSpeed: ["날랜 짚신", "Swift Sandals"], Relic1_TomeDuration: ["병서 보따리", "Book Bundle"],
  Relic2_Nature_RingOfDuplication: ["분신 허리띠", "Belt of Duplication"],
  Relic_HuntersAreOutcast: ["궁수와 의병의 가락지", "Archers' and Militia's Ring"],
  R_ArcanistTomePower: ["승병의 푸른 두건", "Monks' Blue Hood"],
  R_CharmHunter: ["의병의 맹수 송곳니", "Militia Fang Necklace"],
  R_Epic: ["거인의 투구", "Giant's Helmet"],
  R_HeroSpawnTransformAllHeroes: ["변신 탈", "Changeling Mask"],
  R_HunterPeriodicInvisibility: ["궁수의 그림자 도포", "Archers' Shadow Cloak"],
  R_MysticSpawnFortify: ["창병의 바위 방패", "Spearmen's Rock Shield"],
  R_QuestCompleteCoin: ["탐험 수첩", "Explorer's Journal"],
  R_WarriorAliveGiant: ["창병의 거인 혈석", "Spearmen's Titan Bloodstone"],
  Relic_ArcanistsAreHunters: ["승병과 궁수의 가락지", "Monks' and Archers' Ring"],
  Relic_MilitiaAreMystics: ["창병과 승병의 가락지", "Spearmen's and Monks' Ring"],
  Relic_MysticsAreArcanists: ["화차병과 승병의 가락지", "Hwacha Troops' and Monks' Ring"],
  Relic_OutcastsAreMilitia: ["의병과 창병의 가락지", "Militia's and Spearmen's Ring"],
  Relic4_Arctic_FrozenMace: ["서리 검", "Frost Sword"],
  _REMOVERelic3_Cursed_Lantern: ["원혼 등불", "Spirit Lantern"],
  R_EpicAttacksEletrify_Demo: ["뇌명 거문고", "Thunder Zither"],
  R_AutomaticBallista: ["자동 쇠뇌", "Auto Crossbow"], R_EchoingBones: ["병부", "Military Tally"],
  R_FirstPackPortal: ["모집 봉인", "Recruit Seal"],
  R_ShockNeedle: ["벼락 바늘", "Shock Needle"],
  R_SunstrideBoots: ["햇살 장화", "Sunstride Boots"],
  Relic3_Cursed_RitualDagger: ["제의 단검", "Ritual Dagger"],
  Relic2_Nature_LifeStaff: ["숲의 활", "Forest Bow"],
  "R_HunterArrowBounce - Demo": ["궁수의 화살통", "Archers' Quiver"],
  _REMOVER_HeroSpawnInvisibility: ["은신 약병", "Vanishing Potion"],
  _REMOVERelic1_WarBanner: ["진군 나각", "Marching Horn"],
  R_BuildingsActivateFaster: ["황금 망치", "Golden Hammer"],
  R_CommonSacrificeRareFromPack: ["뼈 주사위", "Bone Die"],
  R_FirstEpicSacrificeCommons: ["부서진 왕관", "Shattered Crown"],
  R_RareSacrificeGainPack: ["나룻배 노", "Ferryman's Paddle"],
  "R_WarriorsSpawnFortify - Demo": ["승병의 금강 방패", "Monks' Diamond Shield"],
};
const DRAWN = new Set(["Relic1_CharmWarrior", "Relic1_Rapier", "Relic1_FourLeafClover", "Relic2_Nature_TalkingBeet",
  "Relic1_GiantsMight", "Relic1_Club", "R_HeroMoveSpeed", "Relic1_TomeDuration", "R_AutomaticBallista"]);
/** Keep the nine bespoke relic paintings, and give every remaining relic an explicit thematic icon. */
const ART: Readonly<Record<string, string>> = {
  _REMOVERelic1_Flail: "icons/sword.webp",
  Relic1_CharmArcanist: "icons/tome-book-svg.webp",
  Relic1_CharmMystic: "icons/skill-shield.webp",
  Relic1_CharmOutcast: "icons/coin.webp",
  Relic1_Rare: "tomes/Tome_Thunderstorm.png",
  Relic2_Nature_RingOfDuplication: "icons/infinity.webp",
  Relic_HuntersAreOutcast: "icons/head-ring.webp",
  R_ArcanistTomePower: "icons/skill-up.webp",
  R_CharmHunter: "icons/pierce.webp",
  R_Epic: "icons/guard-sprite.webp",
  R_HeroSpawnTransformAllHeroes: "tomes/Tome_Transmutation.png",
  R_HunterPeriodicInvisibility: "icons/rift.webp",
  R_MysticSpawnFortify: "icons/shield.webp",
  R_QuestCompleteCoin: "icons/card-order.webp",
  R_WarriorAliveGiant: "icons/heart.webp",
  Relic_ArcanistsAreHunters: "icons/charge-ring-portrait.webp",
  Relic_MilitiaAreMystics: "icons/charge-ring-plate.webp",
  Relic_MysticsAreArcanists: "icons/charge-ring-urgent.webp",
  Relic_OutcastsAreMilitia: "icons/sword-charm.webp",
  Relic4_Arctic_FrozenMace: "tomes/Tome_Blizzard.png",
  _REMOVERelic3_Cursed_Lantern: "icons/skull.webp",
  R_EpicAttacksEletrify_Demo: "icons/flash.webp",
  R_EchoingBones: "tomes/Tome_RaiseDead.png",
  R_FirstPackPortal: "icons/reserve.webp",
  R_ShockNeedle: "icons/shot-tracer.webp",
  R_SunstrideBoots: "icons/motion.webp",
  Relic3_Cursed_RitualDagger: "icons/attack.png",
  Relic2_Nature_LifeStaff: "icons/crossbow.webp",
  "R_HunterArrowBounce - Demo": "icons/crossbow-charm.webp",
  _REMOVER_HeroSpawnInvisibility: "tomes/Tome_SpectralPact.png",
  _REMOVERelic1_WarBanner: "icons/keep-flag.webp",
  R_BuildingsActivateFaster: "icons/yard-forge0.webp",
  R_CommonSacrificeRareFromPack: "icons/jackpot.webp",
  R_FirstEpicSacrificeCommons: "icons/star-fame.webp",
  R_RareSacrificeGainPack: "icons/supply.webp",
  "R_WarriorsSpawnFortify - Demo": "icons/shield-charm.webp",
};

export function bphRelicName(relicId: string): string {
  const name = NAMES[relicId];
  return name ? phrase(...name) : t(objects[relicId] ?? "유물");
}
export const bphRelicArt = (relicId: string): string =>
  DRAWN.has(relicId) ? `./art/relics/${relicId}.png` : `./art/${ART[relicId] ?? "icons/unit-cap-relic.webp"}`;

export type BphRelicCard = { readonly id: string; readonly name: string; readonly art: string; readonly equipped: boolean };
/** Unowned slots show no identity. Ready slots come first within the unopened part of the shelf. */
export function bphUnownedRelics(save: BphSave) {
  const { owned, discovered } = save.relicState;
  const ids = new Set([...Object.values(BPH_CODEX_CLASS_REWARDS), ...discovered]);
  for (const grid of BPH_UPGRADE_GRIDS) for (const { nodeId } of grid.placements) {
    if (!nodeId || BPH_HIDDEN_UPGRADES.has(nodeId)) continue;
    for (const effect of BPH_UPGRADE_NODES[nodeId]?.effects ?? [])
      if (effect.type === "DiscoverTargetRelic" && effect.targets.targetRelic) ids.add(effect.targets.targetRelic);
  }
  return [...ids].filter(id => !owned.includes(id) && !BPH_HIDDEN_UPGRADES.has(id))
    .map(id => ({ id, ready: discovered.includes(id) }))
    .sort((a, b) => Number(b.ready) - Number(a.ready));
}
export function bphRelicCards(save: BphSave): readonly BphRelicCard[] {
  const relics = save.relicState;
  return relics.owned.filter(id => !BPH_HIDDEN_UPGRADES.has(id) && !relics.destroyed.includes(id))
    .map(id => ({ id, name: bphRelicName(id), art: bphRelicArt(id), equipped: relics.equipped.includes(id) }));
}
/** Locked slots are the upgrade web's slot upgrades whose one-time claim has not happened yet. */
export function bphRelicSlotView(save: BphSave): { readonly open: number; readonly locked: number } {
  const claimed = save.lifecycle.claimed;
  const locked = BPH_UPGRADE_GRIDS.flatMap(grid => grid.placements).reduce((sum, placement) => {
    const node = placement.nodeId ? BPH_UPGRADE_NODES[placement.nodeId] : undefined;
    if (!node || BPH_HIDDEN_UPGRADES.has(node.id) || claimed.includes(`buildings:slots:${placement.id}`)) return sum;
    return sum + node.effects.reduce((total, effect) => total + (effect.type === "GainRelicSlot" ? effect.value : 0), 0);
  }, 0);
  return { open: bphRelicSlots(save), locked };
}
export function toggleBphRelic(save: BphSave, relicId: string): "equipped" | "unequipped" | "full" {
  if (unequipBphRelic(save, relicId)) return "unequipped";
  const worn = save.relicState.equipped, before = [...worn];
  if (bphRelicSlots(save) === 1) worn.length = 0;
  if (equipBphRelic(save, relicId)) return "equipped";
  worn.splice(0, worn.length, ...before);
  return "full";
}
/** Relics gained since the last notice. Each telling is a receipt, so a relic is announced once, reload or not. */
export function takeBphRelicNotices(save: BphSave): readonly string[] {
  const told = save.lifecycle.claimed;
  const gained = bphRelicCards(save).map(card => card.id).filter(id => !told.includes(`relic-notice:${id}`));
  told.push(...gained.map(id => `relic-notice:${id}`));
  return gained;
}
