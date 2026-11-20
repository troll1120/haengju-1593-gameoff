import { clip, contains, fortRect, pushOut, visibleCourtyard } from "./geometry";
import type { Direction, Point, Rect } from "./geometry";
import type { Enemy, Run } from "./rules";

const EDGE = 1e-6;

function opening(walls: Run["walls"], rect: Rect, court: Rect, at: Point): Direction | undefined {
  const side = at.x > court.left && at.x < court.right
    ? Math.abs(at.y - rect.top) < EDGE ? "위" : Math.abs(at.y - rect.bottom) < EDGE ? "아래" : undefined
    : at.y > court.top && at.y < court.bottom
      ? Math.abs(at.x - rect.left) < EDGE ? "좌" : Math.abs(at.x - rect.right) < EDGE ? "우" : undefined
      : undefined;
  return side !== undefined && walls[side] <= 0 ? side : undefined;
}

function place(enemy: Enemy, at: Point): void {
  enemy.x = at.x; enemy.y = at.y;
}

/** For births and scripted relocations to the exterior, never spawn inside the wall. */
export function placeEnemyOutside(run: Run, enemy: Enemy, at: Point, from: Point): void {
  const wall = fortRect(run.fort);
  const start = pushOut(wall, from);
  const span = clip(wall, start, at);
  place(enemy, contains(wall, at) && span ? {
    x: start.x + (at.x - start.x) * span[0], y: start.y + (at.y - start.y) * span[0],
  } : at);
  delete enemy.breach;
}

/** Sweep every ground displacement. Only a crossing through a destroyed side grants ingress. */
export function moveEnemy(run: Run, enemy: Enemy, to: Point): void {
  if (enemy.kind === "ship") { place(enemy, to); return; }
  const wall = fortRect(run.fort);
  if (Math.max(enemy.x, to.x) <= wall.left || Math.min(enemy.x, to.x) >= wall.right ||
      Math.max(enemy.y, to.y) <= wall.top || Math.min(enemy.y, to.y) >= wall.bottom) {
    place(enemy, to); return;
  }
  const inside = contains(wall, enemy), endsInside = contains(wall, to);
  if (inside && endsInside) { place(enemy, to); return; }
  const span = clip(wall, enemy, to);
  const at = (t: number): Point => ({ x: enemy.x + (to.x - enemy.x) * t, y: enemy.y + (to.y - enemy.y) * t });
  if (!span || !inside && !endsInside && !contains(wall, at((span[0] + span[1]) / 2))) {
    place(enemy, to); return;
  }
  const court = visibleCourtyard(run.fort), enter = at(span[0]), exit = at(span[1]);
  if (!inside) {
    const side = opening(run.walls, wall, court, enter);
    if (!side) { place(enemy, pushOut(wall, enter)); return; }
    enemy.breach = side;
  }
  if (endsInside) { place(enemy, to); return; }
  if (opening(run.walls, wall, court, exit)) { place(enemy, to); delete enemy.breach; return; }
  // Keep the anchor on the interior side of the edge so the next sweep cannot escape it.
  place(enemy, {
    x: Math.max(wall.left + EDGE, Math.min(wall.right - EDGE, exit.x)),
    y: Math.max(wall.top + EDGE, Math.min(wall.bottom - EDGE, exit.y)),
  });
}
