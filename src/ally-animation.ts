import { GENERAL_ART, SOLDIERS } from "./roster";
import { fullsetArt, SOLDIER_ALLY_ART } from "./fullset-art";
import type { Facing } from "./enemy-animation";
import { MOTION } from "./motion";
import type { AttackPhase } from "./motion";
import { BPH_CLASS_ART, BPH_UNIT_VARIANT_ART } from "./bph-art";
import type { Effect, Squad } from "./rules";

export const ALLY_TEXTURES = [...new Set([...Object.values(GENERAL_ART), ...SOLDIERS, ...Object.values(BPH_CLASS_ART).filter(base => base !== "panokseon"),
  ...BPH_UNIT_VARIANT_ART])];
/** Unit-sheet base -> personal full-body set under art/generals; Shin Rip and Gwak Jae-u (hero sheet) keep their sets' original folder names. */
const FULL_ALLY = new Map([["shin_rip", "sin_rip"], ["song_sanghyeon", "song_sanghyeon"], ["samyeong", "samyeong"],
  ["jeong_bal", "jeong_bal"], ["li_rusong", "li_rusong"], ["hwang_jin", "hwang_jin"], ["kim_simin", "kim_simin"],
  ["hero", "kwak_jaeu"], ["yi_sunsin", "yi_sunsin"], ["gwon_yul", "gwon_yul"], ["cheo_yeong", "cheo_yeong"],
  ["jo_heon", "jo_heon"], ["jeong_dam", "jeong_dam"], ["yeonggyu", "yeonggyu"], ["lee_jeongheon", "lee_jeongheon"],
  ...SOLDIER_ALLY_ART.map(actor => [actor, actor] as const)]);
export const FULL_ALLY_ART: readonly string[] = [...FULL_ALLY.values()];
export function allyArt(base: string): { readonly actor: string; readonly full: boolean } {
  const actor = FULL_ALLY.get(base);
  return actor ? { actor, full: true } : { actor: base, full: false };
}
type Frame = { readonly key: string; readonly frame?: number };
type Animation = { readonly key: string; readonly frames: readonly Frame[]; readonly frameRate: number; readonly repeat: number };
export const ALLY_ANIMATIONS: Record<string, Animation> = {};
for (const base of ALLY_TEXTURES) for (const pose of ["idle", "walk", "attack", "hit", "death"] as const) {
  const key = `ally-${base}-${pose}`, texture = pose === "hit" ? `${base}-hurt` : base;
  ALLY_ANIMATIONS[key] = { key, frames: (pose === "idle" ? [0] : [0, 1]).map(frame => ({ key: texture, frame })),
    frameRate: pose === "walk" ? 8 : 12, repeat: pose === "idle" || pose === "walk" ? -1 : 0 };
}
for (const actor of FULL_ALLY_ART) for (const [row, direction] of ["front", "back", "side"].entries()) {
  const { poses, columns } = fullsetArt(actor);
  let start = 0;
  for (const [pose, count] of Object.entries(poses)) {
    const key = `ally-full-${actor}-${direction}-${pose}`;
    ALLY_ANIMATIONS[key] = { key, frames: Array.from({ length: count }, (_, frame) => ({
      key: `ally-sheet-${actor}`, frame: row * columns + start + frame })),
      frameRate: pose === "hit" ? 20 : 8, repeat: pose === "idle" || pose === "walk" ? -1 : 0 };
    start += count;
  }
}
/** Personal bodies with drawn bow frames: art/generals/<actor>_bow_attack.webp, front/back/side rows of raise, draw, release, recover. */
export const BOW_ATTACK_ART: readonly string[] = ["yi_sunsin", "kwak_jaeu"];
export const THROW_ATTACK_ART: readonly string[] = ["song_sanghyeon"];
export const BOW_ATTACK_FRAMES = 4;
for (const actor of BOW_ATTACK_ART) for (const [row, direction] of ["front", "back", "side"].entries()) {
  const key = `ally-full-${actor}-${direction}-bow_attack`;
  ALLY_ANIMATIONS[key] = { key, frames: Array.from({ length: BOW_ATTACK_FRAMES }, (_, frame) => ({
    key: `ally-bow-${actor}`, frame: row * BOW_ATTACK_FRAMES + frame })), frameRate: 8, repeat: 0 };
}
for (const actor of THROW_ATTACK_ART) for (const [row, direction] of ["front", "back", "side"].entries()) {
  const key = `ally-full-${actor}-${direction}-throw_attack`;
  ALLY_ANIMATIONS[key] = { key, frames: Array.from({ length: 4 }, (_, frame) => ({
    key: `ally-throw-${actor}`, frame: row * 4 + frame })), frameRate: 8, repeat: 0 };
}
export function allyAnimation(base: string, state: { readonly moving: boolean; readonly attacking: boolean; readonly hurt: boolean; readonly down: boolean; readonly direction: Facing; readonly bow?: boolean }): Animation {
  const art = allyArt(base);
  const attack = art.full
    ? THROW_ATTACK_ART.includes(art.actor) ? "throw_attack" : state.bow && BOW_ATTACK_ART.includes(art.actor) ? "bow_attack" : "attack"
    : "attack";
  const pose = state.down ? "death" : state.hurt ? "hit" : state.attacking ? attack : state.moving ? "walk" : "idle";
  // Resting allies watch the approach below the castle, regardless of their last step.
  const direction = pose === "idle" ? "front" : state.direction;
  if (art.full) return ALLY_ANIMATIONS[`ally-full-${art.actor}-${direction}-${pose}`];
  return ALLY_ANIMATIONS[`ally-${base}-${pose}`];
}
/** The contact frame is selected by the actual shot/lunge event, never a free-running animation clock. */
export function allyAttackFrame(animation: Animation, phase: AttackPhase): Frame {
  const contact = Math.floor(animation.frames.length / 2);
  const recovery = Math.max(0, phase.sinceReleaseMs - (phase.contactMs ?? 0)) / (phase.recoveryMs ?? MOTION.lungeMs);
  const index = phase.sinceReleaseMs >= 0
    ? contact + Math.min(animation.frames.length - contact - 1, Math.floor(recovery * (animation.frames.length - contact)))
    : Math.min(contact - 1, Math.max(0, Math.floor(phase.windupProgress * contact)));
  return animation.frames[index];
}

export function isTabletHit(effect: Pick<Effect, "kind" | "projectile">, squads: readonly Pick<Squad, "id" | "general">[]): boolean {
  const shot = effect.projectile;
  return effect.kind === "hit" && shot?.kind === "arrow" && shot.source === "general"
    && squads.some(squad => squad.id === shot.by && squad.general === "송상현");
}
