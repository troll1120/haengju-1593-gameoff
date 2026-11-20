import type { Point } from "./geometry";
import type { Facing } from "./enemy-animation";

/** Use displayed positions: boss crowd projection can put a target across the attacker. */
export function attackFacing(from: Point, target: Point): { flipX: boolean; direction: Facing } {
  const dx = target.x - from.x, dy = target.y - from.y;
  return { flipX: dx < 0, direction: Math.abs(dy) > Math.abs(dx) ? dy > 0 ? "front" : "back" : "side" };
}

/** Enemy cavalry is authored looking left. Joseon cavalry uses the right-facing Ming sheet. */
export function spriteFlipX(base: string, faceLeft: boolean): boolean {
  return base === "cavalry" ? !faceLeft : faceLeft;
}

export function cavalryAttackTarget<T extends Point & { readonly id: number }>(
  enemies: readonly T[], targetId: number | undefined, lastAim: Point,
  at: (target: T) => Point = target => target,
): Point {
  const target = enemies.find(enemy => enemy.id === targetId);
  return target ? at(target) : lastAim;
}
