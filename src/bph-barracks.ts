import type { BphDrawResult } from "./bph-contract";
import type { Run } from "./rules";
import { grantBphPacks } from "./bph-account";
import { hitBphPack } from "./bph-combat";
import { bphFxContext } from "./bph-fx-dispatch";
import { bphBarracksClock, takeBphBarracksDraw } from "./bph-fx-buildings";
import { buildings } from "./fortification";
import { bphRecruitMultiplier } from "./bph-recruit";

/**
 * Barracks production (lead decision 2026-11-17, owner DM 1794902274): the shared clock fills, the barracks
 * holds READY, and a tap draws. Untapped for `grace` battle seconds it draws by itself. "auto" draws the
 * moment it is ready.
 */
export const BPH_BARRACKS = { collect: "tap" as "tap" | "auto", grace: 4 } as const;

export type BphBarracksView = { readonly share: number; readonly ready: boolean };
export function bphBarracksView(run: Run): BphBarracksView | null {
  const context = bphFxContext(run), clock = context && bphBarracksClock(context);
  if (!clock) return null;
  return clock.readyAt === null ? { share: Math.min(1, clock.clock / clock.cooldown), ready: false } : { share: 1, ready: true };
}
function drawBphBarracks(run: Run, tapped: boolean): readonly BphDrawResult[] {
  const battle = run.bph, context = bphFxContext(run);
  if (!battle || !context || run.phase !== "playing") return [];
  const at = buildings().barracks, results: BphDrawResult[] = [];
  for (const draw of takeBphBarracksDraw(context)) {
    const [instance] = grantBphPacks(battle.save, { packId: draw.packId, count: 1, metadata: draw.metadata });
    if (tapped) instance.multiplier = bphRecruitMultiplier(run.seed, instance.id);
    battle.packs.push({ ...instance, hp: 1, x: at.x, y: at.y });
    const opened = hitBphPack(run, instance.id, "reveal");
    (battle.barracksReceipts ??= []).push(...opened.map(result => result.id));
    results.push(...opened);
  }
  return results;
}
export function collectBphBarracks(run: Run): boolean {
  return bphBarracksView(run)?.ready === true && drawBphBarracks(run, true).length > 0;
}
export function tickBphBarracks(run: Run): void {
  const context = run.phase === "playing" ? bphFxContext(run) : undefined, clock = context && bphBarracksClock(context);
  if (!clock || clock.readyAt === null) return;
  if (BPH_BARRACKS.collect === "auto" || run.time >= clock.readyAt + BPH_BARRACKS.grace) drawBphBarracks(run, false);
}
