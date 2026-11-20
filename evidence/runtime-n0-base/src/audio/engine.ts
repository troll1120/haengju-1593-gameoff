import { EFFECTS, playEffect } from "./effects";
import type { EffectName } from "./effects";
import { Music, STEP } from "./music";
import type { Intensity } from "./music";
import { createMix, Synth } from "./synth";

const STORAGE = "haengju-audio-muted";
const HIT_CAP = 4;
const EFFECT_CAP = 12;
const FRAME_CAP = 3;
const MIN_GAP = .045;
const NORMALIZE_WINDOW = .1;
export type Scene = "title" | "battle";
export type AudioBus = "bgm" | "sfx";
function volumeStorage(bus: AudioBus, value?: number): number {
  if (typeof localStorage === "undefined") return value ?? 100;
  try {
    const key = `haengju-audio-${bus}-volume`;
    if (value !== undefined) localStorage.setItem(key, String(value));
    const stored = localStorage.getItem(key), level = stored === null ? 100 : Number(stored);
    return Number.isFinite(level) ? Math.max(0, Math.min(100, level)) : 100;
  } catch (error) {
    if (error instanceof DOMException && ["SecurityError", "QuotaExceededError"].includes(error.name)) return value ?? 100;
    throw error;
  }
}
// Battle layers join after 2, 5 and 8 minutes of unpaused play.
const LAYER_SECONDS = [120, 300, 480] as const;
type ActiveEffect = { readonly name: EffectName; readonly at: number; readonly until: number; readonly hit: boolean;
  readonly priority: boolean; readonly gain: GainNode; readonly frame: number };
function storage(value?: boolean): boolean {
  if (typeof localStorage === "undefined") return value ?? false;
  try {
    if (value !== undefined) localStorage.setItem(STORAGE, String(value));
    return localStorage.getItem(STORAGE) === "true";
  } catch (error) {
    if (error instanceof DOMException && ["SecurityError", "QuotaExceededError"].includes(error.name)) {
      return value ?? false;
    }
    throw error;
  }
}

/** Owns the gesture-gated realtime transport; offline rendering uses the same score. */
export class AudioEngine {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private bgmBus: GainNode | undefined;
  private readonly volumes = { bgm: volumeStorage("bgm"), sfx: volumeStorage("sfx") };
  private music: Music | undefined;
  private effects: Synth | undefined;
  private muted = storage();
  private threat: Intensity = 0;
  private scene: Scene = "title";
  private pulseAt = -Infinity;
  private pulses = 0;
  private battleSeconds = 0;
  private requested = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private epoch = 0;
  private nextAt = 0;
  private step = 0;
  private active: ActiveEffect[] = [];
  private readonly onsets = new Map<EffectName, number[]>();
  private coinStreak = 0;
  private frame: number | null = null;
  private frameVoices = 0;
  private recent: { readonly at: number; readonly gain: GainNode }[] = [];

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = createMix(this.context);
      this.master.gain.value = this.muted ? 0 : 1;
      this.effects = new Synth(this.context, this.master);
      this.effects.bus.gain.value = this.volumes.sfx / 100;
      this.bgmBus = this.context.createGain();
      this.bgmBus.gain.value = this.volumes.bgm / 100;
      this.bgmBus.connect(this.master);
      this.music = new Music(this.context, this.bgmBus);
      this.music.gain.gain.value = 0;
    }
    if (this.context.state === "suspended") await this.context.resume();
    if (this.requested && this.context.state === "running") this.begin();
  }

  start(): void {
    this.requested = true;
    if (this.context?.state === "running") this.begin();
  }

  private begin(): void {
    if (!this.context || !this.music || this.timer !== undefined) return;
    this.epoch = this.context.currentTime + .025;
    this.nextAt = this.epoch;
    this.step = 0;
    this.music.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.music.gain.gain.setTargetAtTime(.72, this.context.currentTime, .025);
    this.score();
    this.timer = setInterval(() => this.score(), 25);
  }

  private score(): void {
    if (!this.context || !this.music) return;
    const now = this.context.currentTime;
    if (this.nextAt < now - .2) {
      // Background tabs can throttle JS timers. Keep musical phase, skip expired notes.
      this.step = Math.ceil((now - this.epoch) / STEP);
      this.nextAt = this.epoch + this.step * STEP;
    }
    while (this.nextAt < now + .12) {
      if (this.scene === "title") this.music.title(this.step, this.nextAt);
      else this.music.step(this.step, this.nextAt, this.level());
      this.step++;
      this.nextAt = this.epoch + this.step * STEP;
    }
  }

  private level(): Intensity {
    const layer = LAYER_SECONDS.filter(seconds => this.battleSeconds >= seconds).length;
    return Math.max(layer, this.threat) as Intensity;
  }

  setScene(scene: Scene): void {
    if (scene === this.scene) return;
    if (scene === "title") this.cancelPending();
    this.scene = scene;
    this.battleSeconds = 0;
    if (this.timer === undefined || !this.context) return;
    this.epoch = this.context.currentTime + .025;
    this.nextAt = this.epoch;
    this.step = 0;
  }

  stop(): void {
    this.cancelPending();
    this.requested = false;
    this.scene = "title";
    this.pulses = 0;
    this.battleSeconds = 0;
    clearInterval(this.timer);
    this.timer = undefined;
    if (this.context && this.music) {
      this.music.gain.gain.setTargetAtTime(0, this.context.currentTime, .025);
    }
  }

  /** The game reports threat about twelve times a second in battle and once on the title, which tells the scenes apart. */
  setIntensity(value: Intensity): void {
    const now = performance.now() / 1000;
    const gap = now - this.pulseAt;
    this.pulseAt = now;
    this.pulses = gap < .5 ? this.pulses + 1 : 1;
    this.threat = value;
    if (this.pulses < 3) return;
    if (this.scene === "title") this.setScene("battle");
    else if (gap < .5) this.battleSeconds += gap;
  }

  setMuted(value: boolean): void {
    this.muted = value;
    storage(value);
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(value ? 0 : 1, this.context.currentTime, .015);
    }
  }

  setVolume(bus: AudioBus, value: number): void {
    const level = Math.max(0, Math.min(100, value));
    this.volumes[bus] = level;
    volumeStorage(bus, level);
    const gain = bus === "bgm" ? this.bgmBus : this.effects?.bus;
    if (gain && this.context) gain.gain.setTargetAtTime(level / 100, this.context.currentTime, .015);
  }

  previewSfx(): void {
    if (this.context?.state === "running" && this.effects && !this.muted)
      playEffect(this.effects, "coin", this.context.currentTime);
  }

  private discard(effect: ActiveEffect): void {
    const now = this.context?.currentTime ?? 0;
    effect.gain.gain.cancelScheduledValues(now);
    effect.gain.gain.setValueAtTime(0, now);
    effect.gain.disconnect();
    this.active = this.active.filter(other => other !== effect);
    this.recent = this.recent.filter(event => event.gain !== effect.gain);
    this.onsets.set(effect.name, (this.onsets.get(effect.name) ?? []).filter(at => at !== effect.at));
    if (effect.frame === this.frame) this.frameVoices--;
  }

  cancelPending(): void {
    const now = this.context?.currentTime ?? 0;
    for (const effect of this.active) if (effect.at > now) this.discard(effect);
  }

  play(name: EffectName, delaySeconds = 0): void {
    if (!Number.isFinite(delaySeconds) || delaySeconds < 0) throw new RangeError("SFX delay must be finite and non-negative");
    if (!this.context || !this.effects || this.context.state !== "running" || this.muted) return;
    if (this.scene === "title" && this.timer !== undefined) return;
    const recipe = EFFECTS[name];
    const now = this.context.currentTime;
    const at = now + delaySeconds;
    // The document timeline is shared by all rAF callbacks in a rendered frame,
    // unlike performance.now(), which advances during a long game update.
    const timelineTime = typeof document === "undefined" ? null : document.timeline.currentTime;
    const frame = typeof timelineTime === "number" ? timelineTime : Math.floor(performance.now() / (1000 / 60));
    if (frame !== this.frame) {
      this.frame = frame;
      this.frameVoices = 0;
    }
    this.active = this.active.filter(effect => {
      if (effect.until > now) return true;
      effect.gain.disconnect();
      return false;
    });
    const hit = "hit" in recipe && recipe.hit;
    const priority = "priority" in recipe && recipe.priority;
    const impact = "impact" in recipe && recipe.impact;
    const until = at + Math.max(recipe.duration, impact ? .26 : 0);
    const overlapping = this.active.filter(effect => effect.at < until && effect.until > at);
    const gap = Math.max(MIN_GAP, recipe.gap);
    const onsets = (this.onsets.get(name) ?? []).filter(onset => onset + gap > now);
    if (onsets.some(onset => at < onset + gap && onset < at + gap)
      || (!priority && overlapping.filter(effect => !effect.priority).length >= EFFECT_CAP)
      || (hit && overlapping.filter(effect => effect.hit).length >= HIT_CAP)) return;
    if (this.frameVoices >= FRAME_CAP) {
      const replaced = priority ? this.active.filter(effect => effect.frame === frame && !effect.priority).at(-1) : undefined;
      if (!replaced) return;
      // Already-started ordinary transients cannot be recalled, but their tails
      // and any delayed onset are silenced before admitting the priority cue.
      this.discard(replaced);
    }
    // Coins arriving back to back climb a whole tone each, up to an octave, then restart after a pause.
    if (name === "coin") this.coinStreak = at - Math.max(...(this.onsets.get(name) ?? [])) < .4 ? Math.min(6, this.coinStreak + 1) : 0;
    this.onsets.set(name, [...onsets, at]);
    this.frameVoices++;
    // Share the noise buffer and master path, but give each event its own gain.
    const voice = new Synth(this.context, this.effects.bus, this.effects.noiseBuffer);
    this.active.push({ name, at, until, hit, priority, gain: voice.bus, frame });
    this.recent = this.recent.filter(event => event.at + NORMALIZE_WINDOW > now);
    this.recent.push({ at, gain: voice.bus });
    for (const event of this.recent) {
      const count = this.recent.filter(other => Math.abs(other.at - event.at) < NORMALIZE_WINDOW).length;
      event.gain.gain.cancelScheduledValues(now);
      if (event.at < now) event.gain.gain.setTargetAtTime(1 / Math.sqrt(count), now, .005);
      else event.gain.gain.setValueAtTime(1 / Math.sqrt(count), event.at);
    }
    const pitch = (1 + (Math.random() * 2 - 1) * .03) * (name === "coin" ? 2 ** (this.coinStreak / 6) : 1);
    playEffect(voice, name, at, pitch);
    if (impact) voice.buk(at, .18, pitch);
  }

  state() {
    const now = this.context?.currentTime ?? 0;
    return {
      unlocked: !!this.context, running: this.context?.state === "running", muted: this.muted,
      intensity: this.level(), scene: this.scene, battleSeconds: this.battleSeconds, bgm: this.timer !== undefined,
      voices: this.active.filter(effect => effect.until > now).length,
      hitVoices: this.active.filter(effect => effect.hit && effect.until > now).length,
      bgmVolume: this.volumes.bgm, sfxVolume: this.volumes.sfx,
      bgmGain: this.bgmBus?.gain.value, sfxGain: this.effects?.bus.gain.value, masterGain: this.master?.gain.value,
    };
  }
}

export const audio = new AudioEngine();
if (typeof document !== "undefined") {
  const unlock = () => {
    void audio.unlock().then(() => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
    });
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);
}
