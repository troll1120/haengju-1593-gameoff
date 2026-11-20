import type { BphUpgradeNode } from "./bph-upgrade-data";
import { bphQuestUnknowns } from "./bph-upgrades";
import { amount, effectTarget, phrase } from "./bph-upgrade-effect-text";

export function implementedQuestName(node: BphUpgradeNode): string | null {
  return node.id === "Q_DefeatCursor" ? phrase("전투 피해", "Combat damage") : null;
}

/** Only rewards actually paid by buyBphNode; authored pack/relic rewards are not paid. */
export function implementedQuestDescription(node: BphUpgradeNode): string | null {
  if (node.type !== 4 || bphQuestUnknowns(node).length) return null;
  const target = effectTarget(node.refs.questPack ?? node.refs.questMonster ?? node.refs.questHero ?? node.refs.questSpell);
  const count = node.thresholds.join("/");
  const rewards = [
    ["questIncomeFlatBonus", "전투 시작 코인", "Starting coins"],
    ["questMasteryReward", "숙련", "Mastery"], ["flatSkullBonus", "전공", "Skulls"],
    ["questZenithReward", "명성", "Renown"], ["questRuneAReward", "공격 부적", "Attack runes"],
    ["questRuneBReward", "수비 부적", "Defense runes"], ["questRuneCReward", "지원 부적", "Support runes"],
  ].flatMap(([key, ko, en]) => node.values[key] ? [`${phrase(ko, en)} +${amount(node.values[key])}`] : []);
  if (!rewards.length) return null;
  let condition: string;
  if (node.id === "Q_DefeatCursor")
    condition = phrase(`적에게 실제 전투 피해 ${count} 가하기`, `Deal ${count} actual combat damage to enemies`);
  else if (node.refs.questPack) condition = phrase(`${target} ${count}회 개봉`, `Open ${count} ${target}`);
  else if (node.refs.questMonster) condition = phrase(`${target} ${count}마리 처치`, `Defeat ${count} ${target}`);
  else if (node.refs.questHero) condition = phrase(`${target} ${count}명 등장`, `Spawn ${count} ${target}`);
  else if (node.refs.questSpell) condition = phrase(`${target} ${count}회 시전`, `Cast ${target} ${count} times`);
  else if (node.values.questCompleteTotalQuests) condition = phrase(`과제 ${count}회 완료`, `Complete ${count} quests`);
  else if (node.values.questPurchaseUpgradeNodes) condition = phrase(`강화 ${count}개 구입`, `Buy ${count} upgrades`);
  else if (node.values.questDiscoverUnits) condition = phrase(`병력·책략 ${count}종 발견`, `Discover ${count} troop/tome types`);
  else return null;
  return `${condition} → ${rewards.join(" · ")}`;
}
