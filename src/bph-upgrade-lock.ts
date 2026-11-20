import type { BphSave } from "./bph-contract";
import type { BphPlacement, BphUpgradeNode } from "./bph-upgrade-data";
import type { IconName } from "./icons";
import { t } from "./i18n";
import { bphQuestAmount, bphQuestClaims } from "./bph-upgrades";
import { effectTarget, phrase } from "./bph-upgrade-effect-text";
import { questRequirement } from "./bph-upgrade-quest-text";

/** Only quests carry a count (the same counter as purchase validation); single-step gates show just their icon.
 * Gates the player cannot open in this build (no dimensions, unverified events) share one hint. */
const unavailable = () => phrase("아직 열 수 없는 강화", "Not available yet");

export function upgradeLock(save: BphSave, placement: BphPlacement, node: BphUpgradeNode, reason: string): {
  readonly icon: IconName; readonly count?: string; readonly hint: string;
} {
  switch (reason) {
    case t("퀘스트 진행 부족"): {
      const required = node.thresholds[bphQuestClaims(save, placement.id)];
      return { icon: "trophy", count: `${bphQuestAmount(save, placement, node)}/${required}`,
        hint: questRequirement(node, String(required)) };
    }
    case t("차원 잠금"):
      return { icon: "rift", hint: unavailable() };
    case t("지정 병력 미발견"):
      return { icon: "card", hint: phrase(`${effectTarget(node.refs.requiredHero)} 발견`, `Discover ${effectTarget(node.refs.requiredHero)}`) };
    case t("지정 책략 미발견"):
      return { icon: "card", hint: phrase(`${effectTarget(node.refs.requiredTome)} 발견`, `Discover ${effectTarget(node.refs.requiredTome)}`) };
    case t("지정 모집 미해금"):
      return { icon: "card", hint: phrase(`${effectTarget(node.refs.requiredPack)} 해금`, `Unlock ${effectTarget(node.refs.requiredPack)}`) };
    case t("연결된 선행 노드 필요"):
      return { icon: "lock", hint: phrase("연결된 선행 강화 구입", "Buy a connected prerequisite upgrade") };
    case t("강화망 입구 미구입"): {
      const tree = effectTarget(placement.gridId);
      return { icon: "rift", hint: phrase(`${tree} 칸 구입`, `Buy ${tree}`) };
    }
    default:
      return { icon: "lock", hint: unavailable() };
  }
}
