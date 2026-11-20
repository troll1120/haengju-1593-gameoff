import type { Point } from "./geometry";
import { TUNABLES } from "./tunables";

/** CSS pixels a finger must travel before a press turns into a drag-aim, and how far above the finger the ring then sits. */
export const TAP_AIM = TUNABLES.tapAim;

/** Where the tap-strike aim ring sits and where a touch release fires (owner DM 1794909654.988639). Display and input only:
 *  the volley itself is still called through tapBphStrike at the chosen point. A mouse shows the ring at the cursor and fires
 *  on click; a finger shows it while dragging, lifted above the finger, and fires on release; a quick tap fires where it lands. */
export class TapAim {
  private hovered: Point | null = null;
  private press: { readonly start: Point; aim: Point | null } | null = null;
  private dismissed = false;

  get ring(): Point | null { return this.dismissed ? null : this.press ? this.press.aim : this.hovered; }

  /** Where a cursor tactic acts: the hover point, or while a finger is down its lifted drag point (under the finger before the drag starts). */
  get pointing(): Point | null { return this.press ? this.press.aim ?? this.press.start : this.hovered; }

  hover(point: Point | null): void { this.hovered = point; if (!this.press) this.dismissed = false; }

  touch(point: Point): void { this.press = { start: point, aim: null }; this.hovered = null; this.dismissed = false; }

  /** Hide the current preview without changing where the active pointer action lands. */
  dismissRing(): void { this.dismissed = true; }

  /** cssPixel: world pixels per CSS pixel, so thresholds feel the same at every canvas size. */
  drag(point: Point, cssPixel: number): void {
    const press = this.press;
    if (!press) return;
    if (!press.aim && Math.hypot(point.x - press.start.x, point.y - press.start.y) < TAP_AIM.dragCss * cssPixel) return;
    press.aim = { x: point.x, y: point.y - TAP_AIM.liftCss * cssPixel };
  }

  release(): Point | null {
    const press = this.press;
    this.press = null;
    return press ? press.aim ?? press.start : null;
  }

  cancel(): void { this.press = null; this.hovered = null; }
}
