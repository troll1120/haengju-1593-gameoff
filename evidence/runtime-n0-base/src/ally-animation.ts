import { GENERAL_ART, SOLDIERS } from "./roster";
import { GENERAL_POSES, GENERAL_SHEET_COLUMNS } from "./enemy-animation";
import type { Facing } from "./enemy-animation";
import { MOTION } from "./motion";
import type { AttackPhase } from "./motion";
import { BPH_CLASS_ART } from "./bph-art";

export const ALLY_TEXTURES = [...new Set([...Object.values(GENERAL_ART), ...SOLDIERS, ...Object.values(BPH_CLASS_ART).filter(base => base !== "panokseon")])];
/** Unit-sheet base -> personal full-body set under art/generals; Shin Rip and Gwak Jae-u (hero sheet) keep their sets' original folder names. */
const FULL_ALLY = new Map([["shin_rip", "sin_rip"], ["song_sanghyeon", "song_sanghyeon"], ["samyeong", "samyeong"],
  ["jeong_bal", "jeong_bal"], ["li_rusong", "li_rusong"], ["hwang_jin", "hwang_jin"], ["kim_simin", "kim_simin"],
  ["hero", "kwak_jaeu"], ["yi_sunsin", "yi_sunsin"], ["gwon_yul", "gwon_yul"], ["cheo_yeong", "cheo_yeong"],
  ["jo_heon", "jo_heon"], ["jeong_dam", "jeong_dam"], ["yeonggyu", "yeonggyu"]]);
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
  let start = 0;
  for (const [pose, count] of Object.entries(GENERAL_POSES)) {
    const key = `ally-full-${actor}-${direction}-${pose}`;
    ALLY_ANIMATIONS[key] = { key, frames: Array.from({ length: count }, (_, frame) => ({
      key: `ally-sheet-${actor}`, frame: row * GENERAL_SHEET_COLUMNS + start + frame })),
      frameRate: pose === "hit" ? 20 : 8, repeat: pose === "idle" || pose === "walk" ? -1 : 0 };
    start += count;
  }
}
export function allyAnimation(base: string, state: { readonly moving: boolean; readonly attacking: boolean; readonly hurt: boolean; readonly down: boolean; readonly direction: Facing }): Animation {
  const pose = state.down ? "death" : state.hurt ? "hit" : state.attacking ? "attack" : state.moving ? "walk" : "idle";
  const art = allyArt(base);
  if (art.full) return ALLY_ANIMATIONS[`ally-full-${art.actor}-${state.direction}-${pose}`];
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
