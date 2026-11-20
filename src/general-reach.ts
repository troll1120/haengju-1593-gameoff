import type { BphGeneral } from "./bph-commanders";
import type { General } from "./roster";
import { CHAOS_MAX_LEVEL } from "./chaos-contract";

/** Automatic special attack reach, independent of the basic and manual skill clocks.
 *  Owner DM 1794966115 ("장군들 공격하면 일자로 뭐 나가는것도 ... 업그레이드 할때마다 쌔지고 범위가 넓어지게"), recommendation approved
 *  DM 1794966217: each general's attack visibly reaches out in his own shape, short at Lv1 and longer, thicker and wider every
 *  in-run level up to Lv20 (values run straight from the Lv1 to the Lv20 column).
 *  length: px the reach runs past the struck enemy (황진 streak, 신립 dust trail, 이순신 lance) or its radius from the general
 *  (김시민 fan, 사명대사 ring), or the bow/rocket reach (권율, 곽재우) or the ricochet hop (송상현).
 *  width: half-width px of a line, or half-angle in degrees of a fan (김시민 cut, 곽재우 arrows).
 *  targets: the most enemies one attack can strike through its reach (권율 rockets, 곽재우 arrows, 송상현 hops).
 *  ratio: the share of the attack's damage the reach deals (황진 streaks, 이순신 lance; the others strike at full damage).
 *  Lv1 keeps the reach each pattern had before it grew (92d3d66), except 김시민's fan, which starts narrow and never opens past
 *  100 degrees either side so it never closes into 사명대사's ring. 이순신 has the longest and thickest reach at every level
 *  (owner: "이순신이 게임내에서 제일이여야돼"). */
type Span = readonly [lv1: number, lv20: number];
export type ReachShape = "streak" | "trail" | "fan" | "ring" | "lance" | "rockets" | "arrows" | "ricochet";
type Row = { readonly shape: ReachShape; readonly length: Span; readonly width: Span; readonly targets: Span; readonly ratio: Span };
export const GENERAL_REACH: Readonly<Record<BphGeneral, Row>> = {
  황진: { shape: "streak", length: [24, 96], width: [6, 16], targets: [1, 6], ratio: [.6, .6] },
  신립: { shape: "trail", length: [40, 140], width: [12, 24], targets: [4, 10], ratio: [1, 1] },
  김시민: { shape: "fan", length: [50, 110], width: [60, 100], targets: [6, 12], ratio: [1, 1] },
  사명대사: { shape: "ring", length: [46, 110], width: [0, 0], targets: [8, 16], ratio: [1, 1] },
  이순신: { shape: "lance", length: [130, 320], width: [10, 30], targets: [3, 16], ratio: [.5, 1.2] },
  권율: { shape: "rockets", length: [150, 230], width: [0, 0], targets: [3, 8], ratio: [1, 1] },
  곽재우: { shape: "arrows", length: [160, 210], width: [15, 45], targets: [1, 5], ratio: [1, 1] },
  송상현: { shape: "ricochet", length: [40, 160], width: [0, 0], targets: [1, 5], ratio: [1, 1] },
};
export type Reach = { readonly shape: ReachShape; readonly level: number; readonly length: number; readonly width: number; readonly targets: number; readonly ratio: number };
type Pooled = { readonly chaos?: { readonly general: string; readonly level: number } | null; readonly squads: readonly { readonly general: string }[] };
/** The one level every general of a survival run stands at: the run's shared XP pool (run.chaos, chaos-growth.ts) raises them
 *  together, so a general who joins starts where the run already is (owner DM 1794983077 "기존캐릭과 같은레벨"). Undefined where no
 *  pool runs: legacy combat, or a pool whose owner is not in the run (the sandbox's Lv0). */
export function sharedLevel(run: Pooled): number | undefined {
  const pool = run.chaos;
  return pool && run.squads.some(squad => squad.general === pool.general) ? pool.level : undefined;
}
/** The in-run level a general's reach is drawn and struck at: the shared level, Lv1 where there is none. */
export function reachLevel(run: Pooled): number {
  return Math.max(1, Math.min(CHAOS_MAX_LEVEL, sharedLevel(run) ?? 1));
}
export function generalReach(general: General, level: number): Reach | undefined {
  const row: Row | undefined = (GENERAL_REACH as Partial<Record<General, Row>>)[general];
  if (!row) return;
  const t = (Math.max(1, Math.min(CHAOS_MAX_LEVEL, level)) - 1) / (CHAOS_MAX_LEVEL - 1);
  const at = ([lv1, lv20]: Span) => lv1 + (lv20 - lv1) * t;
  return { shape: row.shape, level, length: at(row.length), width: at(row.width), targets: Math.round(at(row.targets)), ratio: at(row.ratio) };
}
