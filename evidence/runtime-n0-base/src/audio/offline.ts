import { EFFECTS, playEffect } from "./effects";
import type { EffectName } from "./effects";
import { Music, STEP } from "./music";
import type { Intensity } from "./music";
import { createMix, Synth } from "./synth";

/** The same instruments and score as gameplay, rendered by the browser's WebAudio engine. */
export type PreviewKind = "all" | "title" | "ramp" | "full";

/** Thirty seconds of music alone: the title theme, the 0-3 layer ramp, or full intensity. */
async function renderMusic(kind: Exclude<PreviewKind, "all">): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(2, 48000 * 30, 48000);
  const music = new Music(context, createMix(context));
  for (let step = 0; step * STEP < 29.5; step++) {
    const at = step * STEP + .05;
    if (kind === "title") music.title(step, at);
    else music.step(step, at, kind === "full" ? 3 : Math.min(3, Math.floor(at / 7.5)) as Intensity);
  }
  music.gain.gain.setValueAtTime(.72, 29.4);
  music.gain.gain.linearRampToValueAtTime(0, 30);
  return context.startRendering();
}

export async function renderPreview(kind: PreviewKind = "all"): Promise<AudioBuffer> {
  if (kind !== "all") return renderMusic(kind);
  const context = new OfflineAudioContext(2, 48000 * 60, 48000);
  const master = createMix(context);
  const music = new Music(context, master);
  const effects = new Synth(context, master);
  for (let step = 0; step * STEP < 51.5; step++) {
    const at = step * STEP + .05;
    const intensity: Intensity = at < 12 ? 0 : at < 24 ? 1 : at < 36 ? 2 : 3;
    music.step(step, at, intensity);
  }
  music.gain.gain.setValueAtTime(.72, 51.5);
  music.gain.gain.linearRampToValueAtTime(0, 52);
  const showcase: readonly EffectName[] = [
    "hit", "heavy", "crit", "arrow", "rocket", "blast", "volley", "shield", "charge",
    "telegraph", "land", "wall", "coin", "magnet", "card", "roulette", "horn",
    "impact", "hurt", "down", "block", "levelup", "pick", "evolve", "prize",
  ];
  showcase.forEach((name, i) => {
    const at = 2 + i * 1.9;
    playEffect(effects, name, at);
    if ("impact" in EFFECTS[name]) effects.buk(at, .18);
  });
  playEffect(effects, "win", 52.2);
  playEffect(effects, "lose", 56);
  return context.startRendering();
}

export function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const bytes = new ArrayBuffer(44 + buffer.length * channels * 2);
  const view = new DataView(bytes);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, bytes.byteLength - 44, true);
  const samples = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  for (let frame = 0; frame < buffer.length; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, samples[channel][frame]));
      view.setInt16(44 + (frame * channels + channel) * 2,
        Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
  }
  return bytes;
}
