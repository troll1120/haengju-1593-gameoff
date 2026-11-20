import { reserveHealthBar } from "./health-bars";
import type { HealthBar } from "./health-bars";
import { PALETTE } from "./presentation";

/** View-only memory of one unit's swing cycle (owner DM 1794934339.123669: like Booster Pack Heroes, the bar runs from one
 *  attack to the next). `full` is the value combat last reset the unit's clock to, i.e. its real interval; nothing here is
 *  written back to combat. */
export type AttackCycle = { full: number; last: number; winding: boolean; struck: boolean; ready: boolean };
type BarGraphics = {
  fillStyle(color: number): BarGraphics;
  fillRect(x: number, y: number, width: number, height: number): BarGraphics;
};
export function attackCycle(): AttackCycle { return { full: 0, last: 0, winding: false, struck: false, ready: false }; }

/** Share of the bar for this frame, or null to hide it. Combat resets `clock` to the interval when a windup starts, holds it
 *  through the windup, then counts it down to zero; the bar maps that countdown to the first part and the windup to the rest,
 *  so it is empty at the hit and full at the next hit. Readiness includes the first swing: without a target the combat
 *  clock still counts down, and a ready unit holds a full bar until it hits. */
export function attackShare(cycle: AttackCycle, clock: number, strikeAt: number, time: number, windupMs: number): number | null {
  if (clock > cycle.last + 1e-6 || cycle.full <= 0 && clock > 0) cycle.full = clock;
  cycle.last = clock;
  if (cycle.winding && strikeAt <= 0) { cycle.struck = true; cycle.ready = false; }
  cycle.winding = strikeAt > 0;
  const windup = Math.max(0, Math.min(1, 1 - (strikeAt - time) / (windupMs / 1000)));
  if (!cycle.struck && strikeAt > 0 && !cycle.ready) return windup;
  const head = cycle.full / (cycle.full + windupMs / 1000);
  if (strikeAt > 0) return cycle.ready ? 1 : head + (1 - head) * windup;
  if (clock <= 0) { cycle.ready = true; return 1; }
  return head * Math.max(0, Math.min(1, 1 - clock / cycle.full));
}

/** Read the combat clock without advancing combat or consuming randomness. The bar sits in the slot right under the
 *  health bar (owner DM 1794893457.152139: health on top, attack progress directly below). */
export function drawAttackPreparation(
  bars: BarGraphics, head: { readonly x: number; readonly y: number }, occupied: HealthBar[],
  unit: { readonly clock: number; readonly strikeAt: number }, time: number, view: { readonly windFor: number; readonly cycle: AttackCycle },
  leader: boolean,
): void {
  const share = attackShare(view.cycle, unit.clock, unit.strikeAt, time, view.windFor);
  if (share === null) return;
  const width = leader ? 40 : 22;
  const box = reserveHealthBar({ x: Math.round(head.x) - width / 2, y: Math.round(head.y), width, height: 4 }, occupied);
  bars.fillStyle(PALETTE.outline).fillRect(box.x, box.y, width, 4)
    .fillStyle(PALETTE.dark).fillRect(box.x + 1, box.y + 1, width - 2, 2)
    .fillStyle(PALETTE.gold).fillRect(box.x + 1, box.y + 1, Math.round((width - 2) * share), 2);
}
