import { expect, test } from "bun:test";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { implementedEffectDescription } from "./bph-upgrade-effects";
import { setLanguage } from "./i18n";

/** The effect kinds whose English sentence counts with an ordinal ("every 3rd ..."). */
const COUNTED = ["CursorDpsEveryNthApplyStatus", "CursorDpsEveryNthDamageMult",
  "HeroSpawnEveryNthSacrificeGainPack", "SacrificeHeroFromEveryNthPack"];

// The Iron Mace relic read "Every 3th touch attack": the suffix was a fixed "th" in every counted sentence.
test.each([
  [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [13, "13th"],
  [21, "21st"], [22, "22nd"], [23, "23rd"], [101, "101st"], [111, "111th"], [112, "112th"], [113, "113th"],
] as const)("every counted effect sentence writes %i as %s in English", (count, ordinal) => {
  setLanguage("en");
  try {
    const counted = new Set<string>();
    for (const node of Object.values(BPH_UPGRADE_NODES)) for (const effect of node.effects) {
      const written = implementedEffectDescription({ ...effect, value: count })?.match(/\b\d+(?:st|nd|rd|th)\b/g) ?? [];
      if (!written.length) continue;
      counted.add(effect.type);
      expect([effect.nodeId, ...written]).toEqual([effect.nodeId, ordinal]);
    }
    expect([...counted].sort()).toEqual(COUNTED);
  } finally {
    setLanguage("ko");
  }
});
