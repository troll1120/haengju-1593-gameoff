import { expect, test } from "bun:test";
import type { BphEffect } from "./bph-contract";
import { language, setLanguage } from "./i18n";
import { skillGrowthLine } from "./skill-growth-view";

const generals = [
  { general: "권율", en: "Gwon Yul", koEffects: ["화살 +2", "화살 +4"], enEffects: ["Arrows +2", "Arrows +4"] },
  { general: "신립", en: "Sin Rip", koEffects: ["돌파 +24", "돌파 +48"], enEffects: ["Path +24", "Path +48"] },
  { general: "송상현", en: "Song Sang-hyeon", koEffects: ["낙뢰 강화", "낙뢰 강화"], enEffects: ["Stronger lightning strikes", "Stronger lightning strikes"] },
  { general: "황진", en: "Hwang Jin", koEffects: ["진각 반경 +9", "진각 반경 +18"], enEffects: ["Stomp radius +9", "Stomp radius +18"] },
  { general: "김시민", en: "Kim Si-min", koEffects: ["성벽 포격 강화", "성벽 포격 강화"], enEffects: ["Stronger castle-wall barrage", "Stronger castle-wall barrage"] },
  { general: "곽재우", en: "Gwak Jae-u", koEffects: ["의병 +1명", "의병 +2명"], enEffects: ["Militia +1", "Militia +2"] },
  { general: "사명대사", en: "Master Samyeong", koEffects: ["범종 타격 강화", "범종 타격 강화"], enEffects: ["Stronger bell strikes", "Stronger bell strikes"] },
  { general: "이순신", en: "Yi Sun-sin", koEffects: ["거북선 +1회", "거북선 +2회"], enEffects: ["Ship passes +1", "Ship passes +2"] },
] as const;
const boundaries = [
  { count: 0, pips: "●○○", remaining: 3, next: 0, armyNext: 1 },
  { count: 1, pips: "●○○", remaining: 2, next: 0, armyNext: 5 },
  { count: 2, pips: "●○○", remaining: 1, next: 0, armyNext: 5 },
  { count: 3, pips: "●●○", remaining: 3, next: 1, armyNext: 5 },
  { count: 4, pips: "●●○", remaining: 2, next: 1, armyNext: 5 },
  { count: 5, pips: "●●○", remaining: 1, next: 1, armyNext: 10 },
  { count: 6, pips: "●●●", remaining: 0, next: 1, armyNext: 10 },
  { count: 9, pips: "●●●", remaining: 0, next: 1, armyNext: 10 },
  { count: 10, pips: "●●●", remaining: 0, next: 1, armyNext: 20 },
  { count: 19, pips: "●●●", remaining: 0, next: 1, armyNext: 20 },
  { count: 20, pips: "●●●", remaining: 0, next: 1, armyNext: null },
  { count: 21, pips: "●●●", remaining: 0, next: 1, armyNext: null },
] as const;

for (const entry of generals) for (const lang of ["ko", "en"] as const) {
  test.each(boundaries)(`${entry.general} ${lang} shows tier and remaining purchases at $count`, boundary => {
    const effects: BphEffect[] = Array.from({ length: boundary.count }, (_, index) => ({
      nodeId: "SN_HeroDmg", type: "HeroAttackPower", value: .25,
      effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
      targets: { placementId: `display:${index}`, nodeType: "0" },
    }));
    const previous = language();
    try {
      setLanguage(lang);
      const line = skillGrowthLine(entry.general, effects);
      const heading = lang === "ko" ? `${entry.general} 스킬 ${boundary.pips}` : `${entry.en} skill ${boundary.pips}`;
      const next = lang === "ko" ? entry.koEffects[boundary.next] : entry.enEffects[boundary.next];
      const progress = boundary.remaining === 0 ? "MAX" : lang === "ko"
        ? `강화 ${boundary.remaining}번 더 사면 → ${next}`
        : `Buy ${boundary.remaining} more upgrades → ${next}`;
      const army = lang === "ko"
        ? `군대 Lv ${Math.min(20, boundary.count)}/20 · 적용 강화 ${boundary.count}회`
        : `Army Lv ${Math.min(20, boundary.count)}/20 · ${boundary.count} applied upgrades`;
      const armyNext = boundary.armyNext === null ? lang === "ko" ? "군대 성장 MAX" : "Army growth MAX"
        : lang === "ko" ? `다음 군대 효과: Lv ${boundary.armyNext} (강화 ${boundary.armyNext - boundary.count}회 남음)`
          : `Next army effect: Lv ${boundary.armyNext} (${boundary.armyNext - boundary.count} more upgrades)`;
      const skill = boundary.remaining === 0 ? `${heading} ${progress}` : `${heading}\n${progress}`;
      expect(line).toBe(`${skill}\n${army}\n${armyNext}`);
    } finally { setLanguage(previous); }
  });
}
