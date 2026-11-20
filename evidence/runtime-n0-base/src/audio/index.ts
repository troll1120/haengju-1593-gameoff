// Public game contract: review/stage4-fable/audio-hooks.md.
import { audio } from "./engine";
import type { EffectName } from "./effects";

export type SfxName = EffectName;
/** One-shot effect at the event onset; optional audio-clock delay in seconds. */
export function playSfx(name: SfxName, delaySeconds = 0): void {
  audio.play(name, delaySeconds);
}
/** 0 calm, 1 mid-boss or siege warning, 2 siege, 3 final boss. */
export function setBgmIntensity(level: 0 | 1 | 2 | 3): void { audio.setIntensity(level); }
/** Starts or resumes the loop. Call it from a tap: browsers only start audio on a gesture. */
export function startBgm(): void { audio.start(); void audio.unlock(); }
/** Optional explicit override; otherwise the scene is inferred from setBgmIntensity calls. */
export function setBgmScene(scene: "title" | "battle"): void { audio.setScene(scene); }
export function stopBgm(): void { audio.stop(); }
/** Cancel future attack cues when the game pauses; music and sounding tails continue. */
export function cancelPendingSfx(): void { audio.cancelPending(); }
export function setMuted(value: boolean): void { audio.setMuted(value); }
export function setVolume(bus: "bgm" | "sfx", value: number): void { audio.setVolume(bus, value); }
export function previewSfx(): void { audio.previewSfx(); }
export const audioState = () => audio.state();
