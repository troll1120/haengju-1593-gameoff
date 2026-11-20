import { language } from "./i18n";
import type { BphResource, BphSave } from "./bph-contract";
import type { BphPlacement, BphUpgradeNode } from "./bph-upgrade-data";
import { bphNodeBlockers, bphNodeCost, bphRiftPassThrough } from "./bph-upgrades";
import type { bphReachabilityTargets } from "./bph-reachability-targets";

const phrase = (ko: string, en: string): string => language() === "en" ? en : ko;

/** A pre-P2 Graveyard/Frozen rift that only carries the path reads as a passage, never as a dead end. */
export type BphTileState = "bought" | "available" | "passage" | "locked";

export function bphTileState(save: BphSave, p: BphPlacement): BphTileState {
  if (save.purchasedPlacements.includes(p.id)) return "bought";
  if (bphNodeBlockers(save, p.id).length === 0) return "available";
  return bphRiftPassThrough(save, p) ? "passage" : "locked";
}

/** The three original states return their dictionary source words; the passage returns its shown copy. */
export function bphTileStateWord(state: BphTileState): string {
  switch (state) {
    case "bought": return "구입 완료";
    case "available": return "구입 가능";
    case "locked": return "잠김";
    case "passage": return phrase("통로 열림 · 균열 진입은 후속 차원", "Passage open · rift entry in a later dimension");
    default: return state satisfies never;
  }
}

/** Net income is the single coinIncome ledger: the wallet shows it, never the legacy wallet field. */
export function bphWalletAmount(save: BphSave, resource: BphResource): number {
  return resource === "coinIncome" ? save.income : save.resources[resource];
}

export type BphIncomeInvestment = {
  readonly kind: "open" | "short" | "invested"; readonly cost: number; readonly income: number; readonly after: number;
};

export function bphIncomeInvestment(save: BphSave, p: BphPlacement, node: BphUpgradeNode): BphIncomeInvestment | null {
  const cost = bphNodeCost(save, node, "coinIncome");
  if (cost <= 0) return null;
  const kind = save.purchasedPlacements.includes(p.id) ? "invested" : save.income < cost ? "short" : "open";
  return { kind, cost, income: save.income, after: save.income - cost };
}

export function bphSelectedNote(save: BphSave, p: BphPlacement, node: BphUpgradeNode): string | null {
  if (bphTileState(save, p) === "passage") return phrase(
    "지나가는 길은 열려 있습니다.\n균열 진입은 후속 차원에서.",
    "The path through is open.\nEntering the rift waits for a later dimension.");
  const investment = bphIncomeInvestment(save, p, node);
  if (!investment) return null;
  const { cost, income, after } = investment;
  switch (investment.kind) {
    case "invested": return phrase(`영구 투자 완료 · 수입\u00a0−${cost}`, `Invested for good · income\u00a0−${cost}`);
    case "short": return phrase(`영구 투자 · 수입\u00a0${income} · 필요\u00a0${cost}`, `Permanent investment · income\u00a0${income} · needs\u00a0${cost}`);
    case "open": return phrase(`영구 투자 · 수입\u00a0${income}\u00a0→\u00a0${after}`, `Permanent investment · income\u00a0${income}\u00a0→\u00a0${after}`);
    default: return investment.kind satisfies never;
  }
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
    case "future": return phrase("후속 차원", "Later dimensions");
    default: return group satisfies never;
  }
}
