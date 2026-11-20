import type { BphSave } from "./bph-contract";
import { BPH_PACKS, BPH_PROFILES } from "./bph-data";
import { BPH_GENERALS } from "./bph-general-roster";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { bphMasterySideOf } from "./bph-mastery-sides";
import { phrase } from "./bph-upgrade-effect-text";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES } from "./bph-upgrades";

export const BPH_PREP_TABS = ["shared", "militia", "government", "elite", "general"] as const;
export type BphPrepTab = typeof BPH_PREP_TABS[number];
type CardGroup = Exclude<BphPrepTab, "shared" | "general">;

export function bphPrepTabLabel(tab: BphPrepTab): string {
  switch (tab) {
    case "shared": return phrase("공통", "Shared");
    case "militia": return phrase("의병대", "Militia");
    case "government": return phrase("관군", "Government Troops");
    case "elite": return phrase("정예군", "Elite Troops");
    case "general": return phrase("장수", "General");
  }
}
export const BPH_BASIC_MONK = "Hero2_Monk";

const packs = {
  militia: ["Pack1_Basic"],
  government: ["Pack2_Advanced", "Pack5_Skeleton", "Pack6_Forest"],
  elite: ["Pack3_Magic", "Pack4_Royal", "Pack7_Arctic", "Pack8_Chaos", "Pack9_Cosmic"],
} as const satisfies Record<CardGroup, readonly string[]>;

const cards = new Map<string, CardGroup>();
for (const group of ["militia", "government", "elite"] as const) {
  for (const packId of packs[group]) {
    for (const { id } of BPH_PACKS[packId].pool) {
      if (BPH_PROFILES[id]) cards.set(id, group);
    }
  }
}
// The prep card group is presentation only. The monk still drops from his authored pack.
cards.set(BPH_BASIC_MONK, "militia");
// Companion, summon and evolved cards outside the normal pack pools.
for (const id of ["Hero1_Squire2", "Hero1_Squire3"]) cards.set(id, "militia");
for (const id of ["Hero_Bear", "Hero_Jaguar", "Hero_Monkey", "Hero_Rat", "Hero5_DinoRider",
  "Hero_Skeleton", "Hero_SkeletonUpgraded"]) cards.set(id, "government");
cards.set("Hero7_Warlord_Spiked", "elite");

export function bphPrepCardGroup(id: string): CardGroup | undefined {
  return cards.get(id);
}

export function bphPrepTabLock(save: BphSave, tab: BphPrepTab, unlockedPacks: ReadonlySet<string>) {
  if (tab === "shared") return;
  if (tab === "general") {
    if (!BPH_GENERALS.some(id => save.unlockedGenerals.includes(id))) {
      return { kind: "general", id: BPH_GENERALS[0] } as const;
    }
    return;
  }
  if (packs[tab].some(id => unlockedPacks.has(id)) || save.discovered.some(id => cards.get(id) === tab)) return;
  return { kind: "pack", id: packs[tab][0] } as const;
}

export function bphPlacementSide(id: string) {
  const nodeId = BPH_PLACEMENTS.get(id)?.nodeId, node = nodeId ? BPH_UPGRADE_NODES[nodeId] : undefined;
  if (node?.type !== 0 || BPH_HIDDEN_UPGRADES.has(node.id)) return null;
  return bphMasterySideOf(node.effects.map(effect => effect.type));
}

export function bphPrepPlacementGroup(id: string): { tab: BphPrepTab; card?: string } {
  const nodeId = BPH_PLACEMENTS.get(id)?.nodeId;
  const node = nodeId ? BPH_UPGRADE_NODES[nodeId] : undefined;
  if (!node) return { tab: "shared" };
  if (node.effects.some(effect => effect.type === "ShopUnlockTargetPack")) return { tab: "shared" };
  const targets = new Set(node.effects.flatMap(({ targets }) => targets.targetHero ? [targets.targetHero] : []));
  if (node.refs.questHero) targets.add(node.refs.questHero);
  const [card] = targets;
  const tab = card && bphPrepCardGroup(card);
  if (targets.size === 1 && tab) return { tab, card };
  return { tab: bphPlacementSide(id) === "general" && !targets.size ? "general" : "shared" };
}
