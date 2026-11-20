import { FULL_BOSS_ART } from "./bosses";
import type { Enemy, EnemyKind, Pattern } from "./rules";
import type { Point } from "./geometry";
import { SHIP_TEXTURES, SHIP_POSES } from "./river";

export const ENEMY_TEXTURES = ["yari", "teppo", "samurai", "ukita", "cavalry", "konishi", "kobayakawa", "wakizaka", "so_yoshitoshi"] as const;
export const GENERAL_POSES = { walk: 4, attack: 4, hit: 3, death: 3, idle: 4 } as const;
export const GENERAL_SHEET_COLUMNS = 18;
const UNIT_ART: Record<EnemyKind, string> = { yari: "yari", teppo: "teppo", samurai: "samurai", cavalry: "cavalry", ukita: "ukita",
  guard: "so_yoshitoshi", ship: "atakebune" };
const BOSS_ART: Record<Pattern, string> = { gunner: "konishi", siege: "kobayakawa", ninja: "wakizaka", cavalry: "so_yoshitoshi", decree: "ukita" };
export type EnemyArt = { readonly base: string; readonly full: boolean; readonly ship?: boolean };
export function enemyArt(enemy: Pick<Enemy, "kind" | "boss" | "elite" | "bossArt" | "pattern" | "shipArt" | "ladder">): EnemyArt {
  if (enemy.kind === "ship") return { base: enemy.shipArt ?? "atakebune", full: false, ship: true };
  if (enemy.ladder) return { base: "ladder", full: false };
  const base = enemy.bossArt ?? (enemy.boss && enemy.pattern ? BOSS_ART[enemy.pattern] : enemy.elite ? "samurai" : UNIT_ART[enemy.kind]);
  return { base, full: FULL_BOSS_ART.some(actor => actor === base) };
}
export type Facing = "front" | "back" | "side";
/** Mutable samples belong to simulation ticks, not render frames. */
export type EnemyMotion = { x: number; y: number; sampledAt: number; moving: boolean; gait: number; step: number; direction: Facing; faceLeft: boolean };
export const enemyMotion = (at: Point, time: number): EnemyMotion =>
  ({ x: at.x, y: at.y, sampledAt: time, moving: false, gait: 0, step: -1, direction: "side", faceLeft: false });
export function sampleEnemyMotion(motion: EnemyMotion, at: Point, time: number): void {
  if (motion.sampledAt === time) return;
  const dx = at.x - motion.x, dy = at.y - motion.y, travel = Math.hypot(dx, dy);
  motion.moving = travel > .01;
  if (Math.abs(dx) > .01) motion.faceLeft = dx < 0;
  if (motion.moving) {
    motion.gait += travel;
    motion.direction = Math.abs(dy) > Math.abs(dx) ? dy > 0 ? "front" : "back" : "side";
  }
  motion.x = at.x; motion.y = at.y; motion.sampledAt = time;
}

type AnimationFrame = { readonly key: string; readonly frame?: number };
type EnemyAnimation = { readonly key: string; readonly frames: readonly AnimationFrame[]; readonly frameRate: number; readonly repeat: number };
/** The exact sequences registered with Phaser and selected by the moving/attacking state. */
export const ENEMY_ANIMATIONS: Record<string, EnemyAnimation> = {};
for (const base of [...ENEMY_TEXTURES, "ladder"]) for (const white of [false, true]) {
  const texture = white ? `${base}-white` : base;
  for (const pose of ["idle", "walk", "attack", "hit", "death"] as const) {
    const key = `enemy-${texture}-${pose}`;
    ENEMY_ANIMATIONS[key] = { key, frames: (pose === "idle" ? [0] : [0, 1]).map(frame => ({ key: texture, frame })),
      frameRate: pose === "walk" ? 8 : 12, repeat: pose === "idle" || pose === "walk" ? -1 : 0 };
  }
}
for (const base of FULL_BOSS_ART) for (const white of [false, true]) for (const [row, direction] of ["front", "back", "side"].entries()) {
  let start = 0;
  for (const [pose, count] of Object.entries(GENERAL_POSES)) {
    const key = `enemy-${base}${white ? "-white" : ""}-${direction}-${pose}`;
    ENEMY_ANIMATIONS[key] = { key, frames: Array.from({ length: count }, (_, frame) => ({
      key: `boss-sheet-${base}${white ? "-white" : ""}`, frame: row * GENERAL_SHEET_COLUMNS + start + frame })),
      frameRate: pose === "attack" ? 12 : pose === "hit" ? 20 : 8, repeat: pose === "walk" || pose === "idle" ? -1 : 0 };
    start += count;
  }
}
for (const base of SHIP_TEXTURES) for (const white of [false, true]) for (const [row, direction] of ["front", "back", "side"].entries())
  for (const [pose, [start, count]] of Object.entries(SHIP_POSES)) {
    const texture = `${base}${white ? "-white" : ""}`, key = `enemy-${texture}-${direction}-${pose}`;
    ENEMY_ANIMATIONS[key] = { key, frames: Array.from({ length: count }, (_, i) => ({ key: texture, frame: row * 14 + start + i })),
      frameRate: pose === "death" ? 8 : 10, repeat: pose === "idle" || pose === "walk" ? -1 : 0 };
  }
type EnemyAnimationState = {
  readonly moving: boolean; readonly attacking: boolean; readonly hurt: boolean; readonly direction: Facing; readonly flashing: boolean; readonly dead?: boolean;
};
export function enemyAnimation(art: EnemyArt, state: EnemyAnimationState): EnemyAnimation {
  const pose = state.dead ? "death" : state.hurt ? "hit" : state.attacking ? "attack" : state.moving ? "walk" : "idle";
  const texture = art.ship || art.full ? `${art.base}${state.flashing ? "-white" : ""}-${state.direction}` : `${art.base}${state.flashing ? "-white" : ""}`;
  return ENEMY_ANIMATIONS[`enemy-${texture}-${pose}`];
}
