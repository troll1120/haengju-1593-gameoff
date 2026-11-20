import type { BphEffect } from "./bph-contract";
import { language, t, tr } from "./i18n";
import type { General } from "./roster";
import { growthFor, skillUpgradeCount } from "./skill-growth";

export function skillGrowthDescription(general: General, tier: number): string {
  const step = tier - 1;
  if (step === 0) return t("기본 효과");
  switch (general) {
    case "권율": return tr`화살 +${step * 2} · 반경 +${step * 8}`;
    case "신립": return tr`돌파 +${step * 24} · 기절 +${(step * .2).toFixed(1)}초`;
    case "황진": return tr`진각 반경 +${step * 9}`;
    case "김시민": return t("성벽 포격 강화");
    case "사명대사": return t("범종 타격 강화");
    case "이순신": return tr`거북선 +${step}회 · 총 피해 +${step * 50}%`;
    case "송상현": return t("낙뢰 강화");
    case "곽재우": return tr`의병 +${step}명`;
    default: return t("기본 효과");
  }
}

export function skillGrowthLine(general: General, effects: readonly BphEffect[]): string {
  const { tier } = growthFor(general, { level: 1, squads: [], bph: { upgrades: effects } });
  const pips = "●".repeat(tier) + "○".repeat(3 - tier);
  const current = tr`${general} 스킬 ${pips}`;
  const count = skillUpgradeCount(general, effects), threshold = tier === 1 ? 3 : 6;
  const next = skillGrowthDescription(general, tier + 1).split(" · ")[0];
  const manual = tier === 3 ? "MAX" : tr`강화 ${threshold - count}번 더 사면 → ${next}`;
  const milestone = [1, 5, 10, 20].find(level => count < level);
  const army = language() === "en"
    ? `Army Lv ${Math.min(20, count)}/20 · ${count} applied upgrades`
    : `군대 Lv ${Math.min(20, count)}/20 · 적용 강화 ${count}회`;
  const armyNext = milestone === undefined
    ? language() === "en" ? "Army growth MAX" : "군대 성장 MAX"
    : language() === "en"
      ? `Next army effect: Lv ${milestone} (${milestone - count} more upgrades)`
      : `다음 군대 효과: Lv ${milestone} (강화 ${milestone - count}회 남음)`;
  const skill = tier === 3 ? `${current} ${manual}` : `${current}\n${manual}`;
  return `${skill}\n${army}\n${armyNext}`;
}

export function skillPips(tier: number): string {
  return `<span class="skill-pips" aria-hidden="true">${[1, 2, 3].map(level =>
    `<i class="${level <= tier ? "filled" : ""}"></i>`).join("")}</span>`;
}
