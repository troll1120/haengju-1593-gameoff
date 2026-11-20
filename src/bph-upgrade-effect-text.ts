import { language, t } from "./i18n";
import { BPH_CLASS_NAMES, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { bphEnemyDisplayName } from "./bph-codex-groups";
import { objects, recruitment } from "./bph-upgrade-labels";
import type { BphEffect } from "./bph-contract";

export const phrase = (ko: string, en: string): string => language() === "ko" ? t(ko) : en;
export const amount = (value: number): string => String(Number(value.toFixed(4)));
export const signed = (value: number): string => `${value >= 0 ? "+" : ""}${amount(value)}`;
const ORDINAL_SUFFIX = { zero: "th", one: "st", two: "nd", few: "rd", many: "th", other: "th" } as const;
const ordinalRule = new Intl.PluralRules("en", { type: "ordinal" });
/** English ordinal of a count: 1st, 2nd, 3rd, 4th, 11th to 13th, 21st. */
export const ordinal = (value: number): string => `${amount(value)}${ORDINAL_SUFFIX[ordinalRule.select(value)]}`;
export function effectTarget(id: string | undefined): string {
  if (!id) return "";
  return t(objects[id] ?? recruitment[id] ?? BPH_PROFILES[id]?.name ?? BPH_TOMES[id]?.name ??
    bphEnemyDisplayName(id) ?? phrase("지정 대상", "Target"));
}
const classes: Readonly<Record<string, readonly [string, string]>> = {
  "1": ["전사 병과", "Warrior class"], "3": ["명사수 병과", "Sharpshooter class"],
  "4": ["비술사 병과", "Arcanist class"], "5": ["신비 병과", "Mystic class"],
  "6": ["방랑자 병과", "Outcast class"], "7": ["동물 병과", "Animal class"],
};
export function effectClass(id: string | undefined): string {
  if (id && Object.hasOwn(BPH_CLASS_NAMES, id))
    return t(BPH_CLASS_NAMES[id as keyof typeof BPH_CLASS_NAMES]);
  const names = classes[id ?? ""];
  return names ? phrase(...names) : phrase("전체 병력", "All troops");
}
export function effectSubject(effect: BphEffect): string {
  const direct = effect.targets.targetHero ?? effect.targets.targetBuilding ?? effect.targets.targetTome ??
    effect.targets.targetPack ?? effect.targets.targetRelic ??
    (effect.type.startsWith("Bonfire") ? undefined : effect.targets.targetSpell);
  if (direct) return effectTarget(direct);
  if (effect.nodeId.startsWith("FOIL_")) {
    const card = [...Object.values(BPH_PROFILES), ...Object.values(BPH_TOMES)].find(card =>
      typeof card.raw.foilNode === "string" && card.raw.foilNode.includes(`"name":"${effect.nodeId}"`));
    if (card) return phrase(`금박 ${card.name}`, `Foil ${t(card.name)}`);
  }
  if (effect.targets.targetHaengjuClass || Number(effect.targets.targetClass) > 0)
    return effectClass(effect.targets.targetHaengjuClass ?? effect.targets.targetClass);
  if (effect.targets.useTargetRarity === "1") {
    const rarities = [["일반", "Common"], ["희귀", "Rare"], ["영웅", "Epic"], ["전설", "Legendary"]];
    const name = rarities[Number(effect.targets.targetRarity)];
    return name ? phrase(`${name[0]} 병력`, `${name[1]} troops`) : "";
  }
  return "";
}
export const EXECUTED_SPELLS = new Set([
  "Spell_AoeCircle", "Spell_Thunderbolt", "Spell_Stun", "Spell_Shockwave",
  "Spell_PoisonCloud", "Spell_Mine", "Spell_Fireball", "Spell_TeleportAndDamageAoe",
]);
export function effectTome(effect: BphEffect): string | undefined {
  if (effect.targets.targetTome) return effect.targets.targetTome;
  return Object.values(BPH_TOMES).find(book => typeof book.raw.foilNode === "string" &&
    book.raw.foilNode.includes(`"name":"${effect.nodeId}"`))?.id;
}
export function tomeWorks(id: string): boolean {
  const tome = BPH_TOMES[id];
  return !!tome && ([1, 4, 5, 6].includes(tome.effectKind) || id === "Tome_Thunderstorm");
}
