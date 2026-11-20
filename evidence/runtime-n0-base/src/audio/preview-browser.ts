import { encodeWav, renderPreview } from "./offline";
import { audio, AudioEngine } from "./engine";
import { audioState, playSfx, setBgmIntensity, setBgmScene, setMuted, startBgm, stopBgm } from "./index";
import { EFFECTS } from "./effects";
import type { EffectName } from "./effects";

/** Driven by trusted CDP mouse input, with Chrome's normal autoplay policy. */
export function prepareGestureCheck(): string {
  audio.start();
  if (audio.state().unlocked) throw new Error("Audio unlocked before the first gesture");
  return "LOCKED_READY";
}

export async function verifyGestureCheck(): Promise<string> {
  if (!audioState().running || !audioState().bgm) throw new Error("First tap did not start requested BGM");
  setBgmScene("battle");
  setBgmIntensity(3);
  playSfx("tick"); playSfx("tick");
  if (audioState().voices !== 1) throw new Error("Same-frame reel ticks bypassed the retrigger gap");
  for (const name of ["hit", "heavy", "crit", "wall"] as const) playSfx(name);
  if (audioState().voices !== 3 || audioState().hitVoices !== 2) throw new Error("Frame cap admitted more than three events");
  // Let the audio gap expire, then enter a new rendered frame.
  await new Promise<void>(resolve => setTimeout(() => requestAnimationFrame(() => resolve()), 70));
  playSfx("hit");
  playSfx("crit");
  playSfx("wall");
  if (audioState().hitVoices !== 4) throw new Error("Hit voice cap admitted an overlapping fifth impact");
  const names = Object.keys(EFFECTS).filter((name): name is EffectName => name in EFFECTS);
  for (const name of names) playSfx(name);
  const busy = audioState();
  if (busy.voices < 3 || busy.voices > 6 || busy.hitVoices > 4) throw new Error(`Voice admission failed: ${JSON.stringify(busy)}`);
  setMuted(true);
  if (!new AudioEngine().state().muted) throw new Error("Mute did not persist");
  const voices = audioState().voices;
  playSfx("roulette");
  if (audioState().voices !== voices) throw new Error("Muted effect was admitted");
  setMuted(false);
  if (new AudioEngine().state().muted) throw new Error("Unmute did not persist");
  stopBgm();
  if (audioState().bgm) throw new Error("BGM transport did not stop");
  startBgm();
  if (!audioState().bgm || audioState().intensity !== 3) throw new Error("BGM restart lost intensity");
  stopBgm();
  return "AUDIO_QA_OK first-tap, intensity-3, hit-cap-4, frame-cap-3, reel-hook, persistent-mute, stop-restart";
}

const kind = new URLSearchParams(location.search).get("kind") ?? "all";
if (kind !== "all" && kind !== "title" && kind !== "ramp" && kind !== "full") throw new Error(`Unknown preview kind ${kind}`);
const buffer = await renderPreview(kind);
const samples = buffer.getChannelData(0);
let peak = 0;
let energy = 0;
for (const sample of samples) {
  if (!Number.isFinite(sample)) throw new Error("Non-finite rendered audio");
  peak = Math.max(peak, Math.abs(sample));
  energy += sample * sample;
}
if (peak >= .99 || energy / samples.length < .00001) throw new Error("Clipped or silent preview");
const metrics = {
  duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels,
  peak, rms: Math.sqrt(energy / samples.length),
};
const response = await fetch("/preview.wav", {
  method: "POST", body: encodeWav(buffer), headers: { "x-audio-metrics": JSON.stringify(metrics) },
});
if (!response.ok) throw new Error(`WAV save failed: ${response.status}`);
document.body.textContent = JSON.stringify(metrics);
