import { language } from "./i18n";
import type { BphSave } from "./bph-contract";
import type { BphPlacement } from "./bph-upgrade-data";
import { bphNodeBlockers } from "./bph-upgrades";
import type { bphReachabilityTargets } from "./bph-reachability-targets";

const phrase = (ko: string, en: string): string => language() === "en" ? en : ko;

export type BphTileState = "bought" | "available" | "locked";

export function bphTileState(save: BphSave, p: BphPlacement): BphTileState {
  if (save.purchasedPlacements.includes(p.id)) return "bought";
  if (bphNodeBlockers(save, p.id).length === 0) return "available";
  return "locked";
}

/** The three original states return their dictionary source words. */
export function bphTileStateWord(state: BphTileState): string {
  switch (state) {
    case "bought": return "구입 완료";
    case "available": return "구입 가능";
    case "locked": return "잠김";
    default: return state satisfies never;
  }
}

/** The income-investment line went with the currency merge (790dd7b) and the rift passage line with the dimension gate (91974ad). */
export function bphSelectedNote(_save: BphSave, _p: BphPlacement): string | null {
  return null;
}

export type BphTargetGroup = "core" | "training" | "survival" | "laterShop" | "future";
export type BphTargetRow = { readonly group: BphTargetGroup; readonly bought: number; readonly total: number };

/** Denominators are the manifest's own lengths, so growth rows appear only once the effective registry carries them. */
export function bphTargetRows(save: BphSave, targets: ReturnType<typeof bphReachabilityTargets>): readonly BphTargetRow[] {
  const bought = new Set(save.purchasedPlacements);
  const row = (group: BphTargetGroup, ids: readonly string[]): BphTargetRow =>
    ({ group, bought: ids.filter(id => bought.has(id)).length, total: ids.length });
  const growth = targets.training20.length ? [row("training", targets.training20), row("survival", targets.survival)] : [];
  return [row("core", targets.core143), ...growth, row("laterShop", targets.laterShop), row("future", targets.future74)]
    .filter(entry => entry.total > 0);
}

export const bphGoalSummary = (row: BphTargetRow): string => `${phrase("목표", "Goal")} ${row.bought}/${row.total}`;

export function bphTargetLabel(group: BphTargetGroup): string {
  switch (group) {
    case "core": return phrase("현재 목표", "Current goal");
    case "training": return phrase("추가 성장", "Extra growth");
    case "survival": return phrase("통합 목표", "Combined goal");
    case "laterShop": return phrase("후속 상점", "Later shop");
    case "future": return phrase("확장 목표", "Expansion goal");
    default: return group satisfies never;
  }
}
