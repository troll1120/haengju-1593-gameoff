import type { Point } from "./geometry";
import type { Facing } from "./enemy-animation";

/** Use displayed positions: boss crowd projection can put a target across the attacker. */
export function attackFacing(from: Point, target: Point): { flipX: boolean; direction: Facing } {
  const dx = target.x - from.x, dy = target.y - from.y;
  return { flipX: dx < 0, direction: Math.abs(dy) > Math.abs(dx) ? dy > 0 ? "front" : "back" : "side" };
}

/** The shared Joseon/enemy cavalry sheet is authored looking left; other side art looks right. */
export function spriteFlipX(base: string, faceLeft: boolean): boolean {
  return base === "cavalry" || base === "joseon_cavalry" ? !faceLeft : faceLeft;
}
