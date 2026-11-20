import type { BphUpgradeNode } from "./bph-upgrade-data";
import { bphQuestUnknowns } from "./bph-upgrades";
import { bphMergedReward } from "./bph-cost-merge";
import { amount, effectTarget, phrase } from "./bph-upgrade-effect-text";

export function implementedQuestName(node: BphUpgradeNode): string | null {
  return node.id === "Q_DefeatCursor" ? phrase("전투 피해", "Combat damage") : null;
}

/** The active threshold is shared by the locked button and the full quest description. */
export function questRequirement(node: BphUpgradeNode, count: string): string {
  const target = effectTarget(node.refs.questPack ?? node.refs.questMonster ?? node.refs.questHero ?? node.refs.questSpell);
  if (node.id === "Q_DefeatCursor")
    return phrase(`적에게 실제 전투 피해 ${count} 가하기`, `Deal ${count} actual combat damage to enemies`);
  if (node.refs.questPack) return phrase(`${target} ${count}회 개봉`, `Open ${count} ${target}`);
  if (node.refs.questMonster) return phrase(`${target} ${count}마리 처치`, `Defeat ${count} ${target}`);
  if (node.refs.questHero) return phrase(`${target} ${count}명 등장`, `Spawn ${count} ${target}`);
  if (node.refs.questSpell) return phrase(`${target} ${count}회 시전`, `Cast ${target} ${count} times`);
  if (node.values.questCompleteTotalQuests) return phrase(`퀘스트 ${count}개 완료`, `Complete ${count} quests`);
  if (node.values.questPurchaseUpgradeNodes) return phrase(`강화 ${count}개 구입`, `Buy ${count} upgrades`);
  if (node.values.questDiscoverUnits) return phrase(`병력·책략 ${count}종 발견`, `Discover ${count} troop/tome types`);
  return "";
}

/** Only rewards actually paid by buyBphNode; authored pack/relic rewards are not paid. */
export function implementedQuestDescription(node: BphUpgradeNode): string | null {
  if (node.type !== 4 || bphQuestUnknowns(node).length) return null;
  const values: Readonly<Record<string, number>> = { ...node.values,
    questMasteryReward: (node.values.questMasteryReward ?? 0) + bphMergedReward("skull", node.values.flatSkullBonus ?? 0).amount };
  // The income bonus is permanent: it raises the starting coins of every battle from the claim on (castle ledger 1046).
  const rewards = values.questIncomeFlatBonus
    ? [phrase(`매 전투 시작 코인 +${amount(values.questIncomeFlatBonus)} (영구)`,
        `+${amount(values.questIncomeFlatBonus)} starting coin every battle (permanent)`)]
    : [];
  for (const [key, ko, en] of [
    ["questMasteryReward", "숙련", "Mastery"],
    ["questZenithReward", "명성", "Renown"], ["questRuneAReward", "공격 부적", "Attack runes"],
    ["questRuneBReward", "수비 부적", "Defense runes"], ["questRuneCReward", "지원 부적", "Support runes"],
  ] as const) if (values[key]) rewards.push(`${phrase(ko, en)} +${amount(values[key])}`);
  if (!rewards.length) return null;
  const condition = questRequirement(node, node.thresholds.join("/"));
  if (!condition) return null;
  return `${condition} → ${rewards.join(" · ")}`;
}
