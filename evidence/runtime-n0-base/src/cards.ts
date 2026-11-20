import type { CardId, SoldierKind } from "./rules";

/** Classes with rarity cards; the cavalry joins only through generals and recruits. */
export const CLASS_KINDS = ["archer", "spearman", "monk", "hwacha", "ming_cavalry", "panokseon"] as const;
export type ClassKind = typeof CLASS_KINDS[number];
export const isClassKind = (kind: SoldierKind): kind is ClassKind => (CLASS_KINDS as readonly SoldierKind[]).includes(kind);
export type ClassCardId = `rare-${ClassKind}` | `epic-${ClassKind}` | `upgrade-${ClassKind}` | `legend-${ClassKind}-${"storm" | "guard"}`;
export type Rarity = "common" | "rare" | "epic" | "legend";
export type Tactic = { epic: boolean; storm: boolean; guard: boolean };
export const freshTactics = (): Record<SoldierKind, Tactic> => ({
  archer: { epic: false, storm: false, guard: false }, spearman: { epic: false, storm: false, guard: false },
  monk: { epic: false, storm: false, guard: false }, hwacha: { epic: false, storm: false, guard: false },
  ming_cavalry: { epic: false, storm: false, guard: false },
  panokseon: { epic: false, storm: false, guard: false },
});
export function classCard(card: CardId): { kind: ClassKind; rarity: Rarity; mode?: "storm" | "guard" } | null {
  for (const kind of CLASS_KINDS) {
    if (card === `upgrade-${kind}`) return { kind, rarity: "rare" };
    if (card === `recruit-${kind}`) return { kind, rarity: "common" };
    if (card === `rare-${kind}`) return { kind, rarity: "rare" };
    if (card === `epic-${kind}`) return { kind, rarity: "epic" };
    for (const mode of ["storm", "guard"] as const)
      if (card === `legend-${kind}-${mode}`) return { kind, rarity: "legend", mode };
  }
  return null;
}
export function cardRarity(card: CardId): Rarity | "cursed" {
  const army = classCard(card);
  if (army) return army.rarity;
  if (card.startsWith("hero-") || card.startsWith("awaken-") || card.startsWith("promote-")) return "epic";
  if (card === "rift") return "legend";
  if (card === "curse") return "cursed";
  return card === "quiver" || card === "powder" || card === "fire" ? "rare" : "common";
}
export const LEGEND_NAMES: Record<ClassKind, Record<"storm" | "guard", string>> = {
  archer: { storm: "천우시", guard: "빙결시" }, spearman: { storm: "장창진", guard: "철산진" },
  monk: { storm: "금강파", guard: "회생진" }, hwacha: { storm: "신기전진", guard: "진천뢰" },
  ming_cavalry: { storm: "철기 돌파", guard: "철기 방진" }, panokseon: { storm: "함포 일제사격", guard: "철갑 함대" },
};
/** Rarity changes quantity first, then attack behavior, then a whole class's role. */
export function rarityAt(time: number, roll: number): Rarity {
  const [rare, epic, legend] = time < 120 ? [.05, 0, 0] : time < 240 ? [.18, .04, 0]
    : time < 360 ? [.33, .11, .01] : [.35, .22, .03];
  return roll < legend ? "legend" : roll < legend + epic ? "epic" : roll < legend + epic + rare ? "rare" : "common";
}
