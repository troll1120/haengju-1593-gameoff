import type { BphSave } from "./bph-contract";
import { bphRelicSlots, equipBphRelic, unequipBphRelic } from "./bph-account";
import { BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { objects } from "./bph-upgrade-labels";
import { phrase } from "./bph-upgrade-effect-text";
import { t } from "./i18n";

const NAMES: Readonly<Record<string, readonly [string, string]>> = {
  Relic1_CharmWarrior: ["출전 나발", "War Trumpet"], Relic1_Rapier: ["환도", "Hwando Saber"],
  Relic1_FourLeafClover: ["말편자", "Horseshoe"], Relic2_Nature_TalkingBeet: ["말하는 순무", "Talking Turnip"],
  Relic1_GiantsMight: ["거인의 힘", "Giant's Might"], Relic1_Club: ["철퇴", "Iron Mace"],
  R_HeroMoveSpeed: ["날랜 짚신", "Swift Sandals"], Relic1_TomeDuration: ["병서 보따리", "Book Bundle"],
  R_AutomaticBallista: ["자동 쇠뇌", "Auto Crossbow"], R_EchoingBones: ["메아리 뼈", "Echoing Bones"],
  R_FirstPackPortal: ["모집 차원문", "Portal Seal"],
};
const DRAWN = new Set(["Relic1_CharmWarrior", "Relic1_Rapier", "Relic1_FourLeafClover", "Relic2_Nature_TalkingBeet",
  "Relic1_GiantsMight", "Relic1_Club", "R_HeroMoveSpeed", "Relic1_TomeDuration", "R_AutomaticBallista"]);

export function bphRelicName(relicId: string): string {
  const name = NAMES[relicId];
  return name ? phrase(...name) : t(objects[relicId] ?? "유물");
}
export const bphRelicArt = (relicId: string): string =>
  DRAWN.has(relicId) ? `./art/relics/${relicId}.png` : "./art/icons/unit-cap-relic.webp";

export type BphRelicCard = { readonly id: string; readonly name: string; readonly art: string; readonly equipped: boolean };
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
