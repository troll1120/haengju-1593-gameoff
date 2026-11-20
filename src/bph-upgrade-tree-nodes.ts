import type { BphGeneral } from "./bph-commanders";
import type { BphGeneralUpgradeTrack, BphSave, BphUnitUpgradeTrack } from "./bph-contract";
import { bphGeneralUpgradePrice, generalUpgradeMax, GENERAL_UPGRADE_PERCENT, GENERAL_UPGRADE_TRACKS } from "./bph-general-upgrades";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { BPH_SILHOUETTE_ART, BPH_UNKNOWN_NAME, bphConcealsUpgradeIdentity } from "./bph-locked-identity";
import { bphUnlockedPacks } from "./bph-shop";
import { BPH_UNIT_HEALTH_PERCENT, BPH_UNIT_STAT_PERCENT, BPH_UNIT_UPGRADES, bphUnitUpgradePrice } from "./bph-unit-upgrades";
import type { Run } from "./rules";
import type { BphPlacement, BphUpgradeNode } from "./bph-upgrade-data";
import { phrase } from "./bph-upgrade-effect-text";
import { bphPlacementPrerequisites, reachedBphPlacements } from "./bph-upgrade-graph";
import { upgradeDescription, upgradeFace, upgradeName, upgradeRank } from "./bph-upgrade-presentation";
import { questRequirement } from "./bph-upgrade-quest-text";
import { activeBphEffects, BPH_RESOURCE_LABELS, BPH_UPGRADE_NODES, bphNodeBlockers, bphNodeCost, bphQuestAmount, bphQuestClaims } from "./bph-upgrades";
import type { BphShownResource } from "./bph-upgrades";
import { language, t, tr } from "./i18n";
import { pixelIcon } from "./icons";
import type { IconName } from "./icons";
import { UNIT_SPECIAL_TEXT } from "./unit-codex-i18n";

export interface BphUpgradeTreeNode<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  readonly icon: {
    readonly url: string;
    readonly sheet: "unit" | "ship" | null;
    readonly badge: string | null;
  };
  /** Candidate nodes, of which requiredPrereqCount must be reached. */
  readonly prereqs: readonly { readonly id: Id; readonly rank: number }[];
  readonly requiredPrereqCount: number;
  readonly rank: number;
  readonly max: number | null;
  /** This node itself was purchased. Its rank may aggregate across placements. */
  readonly purchased: boolean;
  readonly cost: number | null;
  readonly currency: BphShownResource | null;
  readonly costs: readonly { readonly amount: number; readonly currency: BphShownResource }[];
  readonly buyable: boolean;
  readonly currentText: string;
  readonly nextText: string | null;
  readonly description: string | null;
  /** Stable display band, independent of save progress. */
  readonly tier: number;
  readonly thresholds: readonly number[];
  readonly blockers: readonly string[];
  readonly concealed?: true;
}

const statTracks = {
  attack: { label: "공격력", icon: "sword", step: 10 },
  attackSpeed: { label: "공격 속도", icon: "hourglass", step: 5 },
  health: { label: "체력", icon: "heart", step: 10 },
  skill: { label: "필살기 위력", icon: "skill-up" },
} as const;
const unitTracks = ["attack", "health", "attackSpeed", "special"] as const satisfies readonly BphUnitUpgradeTrack[];
const codexTiers = { attack: 1, attackSpeed: 2, health: 2, special: 3, skill: 3 } as const;

function codexNode<Id extends keyof typeof codexTiers>(save: BphSave, id: Id, label: string, icon: IconName,
  rank: number, max: number | null, price: number | undefined, value: (rank: number) => string,
  description: string | null): BphUpgradeTreeNode<Id> {
  const blockers = price === undefined ? [t("최대")] : save.resources.mastery < price
    ? [tr`${BPH_RESOURCE_LABELS.mastery} 부족`] : [];
  return {
    id, label, icon: { url: pixelIcon(icon), sheet: null, badge: null },
    prereqs: [], requiredPrereqCount: 0, rank, max, purchased: rank > 0,
    cost: price ?? null, currency: price === undefined ? null : "mastery",
    costs: price === undefined ? [] : [{ amount: price, currency: "mastery" }],
    buyable: blockers.length === 0, currentText: value(rank),
    nextText: price === undefined ? null : value(rank + 1), description, tier: codexTiers[id], thresholds: [], blockers,
  };
}

export function bphUnitUpgradeNodes(save: BphSave, id: string, run?: Run): readonly BphUpgradeTreeNode<BphUnitUpgradeTrack>[] {
  const config = BPH_UNIT_UPGRADES.get(id), special = UNIT_SPECIAL_TEXT[id];
  if (!config || !special || !save.discovered.includes(id)) return [];
  const copy = special[language()];
  return unitTracks.flatMap<BphUpgradeTreeNode<BphUnitUpgradeTrack>>(track => {
    const max = track === "special" ? config.specialMax : null;
    if (track !== "special" && !config.statTracks.includes(track)) return [];
    const rank = save.unitUpgrades[id]?.[track] ?? 0, price = bphUnitUpgradePrice(save, id, track);
    if (track === "special") return [codexNode(save, track, copy.name, special.icon, rank, max, price,
      tier => copy.value(special.values[tier - 1] ?? 0), copy.description(run))];
    const { label, icon } = statTracks[track];
    return [codexNode(save, track, t(label), icon, rank, max, price, tier => tier ? `+${tier * (track === "health" ? BPH_UNIT_HEALTH_PERCENT : BPH_UNIT_STAT_PERCENT)}%` : "0%", null)];
  });
}

export function bphGeneralUpgradeNodes(save: BphSave, general: BphGeneral): readonly BphUpgradeTreeNode<BphGeneralUpgradeTrack>[] {
  if (!save.unlockedGenerals.includes(general)) return [];
  return GENERAL_UPGRADE_TRACKS.map(track => codexNode(save, track,
    t(statTracks[track].label), statTracks[track].icon, save.generalUpgrades?.[general]?.[track] ?? 0,
    generalUpgradeMax(track), bphGeneralUpgradePrice(save, general, track),
    tier => track === "skill" ? `${tier * GENERAL_UPGRADE_PERCENT}%` : `Lv ${tier}`, null));
}

function isShownResource(resource: string): resource is BphShownResource {
  return Object.hasOwn(BPH_RESOURCE_LABELS, resource);
}

function questText(save: BphSave, placement: BphPlacement, node: BphUpgradeNode, description: string) {
  const claims = bphQuestClaims(save, placement.id), threshold = node.thresholds[claims];
  const count = `${claims}/${node.thresholds.length}`;
  const claimed = phrase(`보상 ${count}회 받음`, `${count} rewards claimed`);
  if (threshold === undefined) return { currentText: claimed, nextText: null };
  const progress = bphQuestAmount(save, placement, node);
  const currentText = `${claimed} · ${phrase(`현재 ${progress}/${threshold}`, `Progress ${progress}/${threshold}`)}`;
  if (node.thresholds.length === 1) return { currentText, nextText: description };
  const all = `${questRequirement(node, node.thresholds.join("/"))} → `;
  const next = questRequirement(node, String(threshold));
  const nextText = description.startsWith(all)
    ? `${next} → ${description.slice(all.length)}`
    : `${next || threshold} · ${description}`;
  return { currentText, nextText };
}

/** Maps the caller's visible placements to their live purchase and effect data. */
export function bphPrepUpgradeNodes(save: BphSave, placements: readonly BphPlacement[]): readonly BphUpgradeTreeNode[] {
  const reached = reachedBphPlacements(save), purchasedIds = new Set(save.purchasedPlacements);
  const unlockedPacks = bphUnlockedPacks(save, activeBphEffects(save));
  return placements.flatMap(placement => {
    const { id, nodeId } = placement, node = nodeId && BPH_UPGRADE_NODES[nodeId];
    if (!node || BPH_HIDDEN_UPGRADES.has(node.id) || [1, 2, 3].includes(node.type)) return [];
    const concealed = bphConcealsUpgradeIdentity(save, node, unlockedPacks);
    const blockers = bphNodeBlockers(save, id);
    const description = concealed ? null : upgradeDescription(node);
    const face = concealed ? { picture: BPH_SILHOUETTE_ART, sheet: null, badge: "" } : upgradeFace(node);
    const { bought: rank, max } = upgradeRank(save, placement);
    const purchased = purchasedIds.has(id);
    const hiddenText = t("미발견");
    const completed = node.type === 4 ? bphQuestClaims(save, id) >= node.thresholds.length : purchased;
    const text = description === null ? {
      currentText: purchased ? hiddenText : phrase("이 칸의 효과 미적용", "Effect from this node inactive"),
      nextText: completed ? null : hiddenText,
    } : node.type === 4 ? questText(save, placement, node, description) : {
      currentText: purchased ? description : phrase("이 칸의 효과 미적용", "Effect from this node inactive"),
      nextText: purchased ? null : description,
    };
    const prereqs = bphPlacementPrerequisites(save, placement, node, reached);
    const costs = Object.keys(BPH_RESOURCE_LABELS).filter(isShownResource).flatMap(currency => {
      const amount = bphNodeCost(save, node, currency);
      return amount > 0 ? [{ amount, currency }] : [];
    });
    return [{
      id, label: concealed ? BPH_UNKNOWN_NAME : upgradeName(node),
      ...(concealed ? { concealed: true as const } : {}),
      icon: { url: face.picture, sheet: face.sheet, badge: face.badge || null },
      prereqs: prereqs.placements.map(prerequisite => ({ id: prerequisite.id, rank: 1 })),
      requiredPrereqCount: prereqs.required, rank, max, purchased,
      cost: costs[0]?.amount ?? (text.nextText === null ? null : 0), currency: costs[0]?.currency ?? null, costs,
      buyable: blockers.length === 0, ...text, description, tier: 1,
      thresholds: node.thresholds, blockers,
    }];
  });
}
