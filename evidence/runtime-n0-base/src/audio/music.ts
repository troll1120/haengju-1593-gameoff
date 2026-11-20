import { Synth } from "./synth";

export type Intensity = 0 | 1 | 2 | 3;
export const BPM = 132;
export const STEP = 60 / BPM / 4;
export const LOOP_STEPS = 128;
const pitch = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
type Line = readonly (readonly [number, number, number])[];
// Eight bars of D pyeongjo pentatonic (D E G A B). A A' B A'' form: the dotted
// "long-long-short-short" opening figure repeats in bars 1, 3, 5, 7 so it sticks.
const HOOK: Line = [
  [0, 81, 3], [3, 81, 1], [4, 83, 2], [6, 81, 2], [8, 79, 4], [12, 76, 2], [14, 79, 2],
  [16, 81, 3], [19, 81, 1], [20, 86, 3], [23, 83, 1], [24, 81, 4], [28, 79, 4],
  [32, 81, 3], [35, 81, 1], [36, 83, 2], [38, 81, 2], [40, 79, 4], [44, 76, 2], [46, 74, 2],
  [48, 76, 3], [51, 79, 1], [52, 81, 3], [55, 79, 1], [56, 76, 4], [60, 74, 4],
  [64, 86, 3], [67, 86, 1], [68, 83, 2], [70, 81, 2], [72, 83, 4], [76, 81, 4],
  [80, 79, 3], [83, 79, 1], [84, 81, 2], [86, 83, 2], [88, 86, 4], [92, 88, 2], [94, 86, 2],
  [96, 81, 3], [99, 81, 1], [100, 83, 2], [102, 81, 2], [104, 79, 4], [108, 76, 2], [110, 79, 2],
  [112, 81, 3], [115, 79, 1], [116, 76, 2], [118, 74, 2], [120, 74, 6],
];
// The calm title melody: long breaths over the same pentatonic.
const TITLE: Line = [
  [0, 74, 12], [12, 76, 4], [16, 79, 12], [28, 81, 4], [32, 83, 8], [40, 81, 8],
  [48, 79, 12], [60, 76, 4], [64, 74, 8], [72, 76, 8], [80, 79, 8], [88, 81, 8],
  [96, 86, 10], [106, 83, 6], [112, 81, 8], [120, 74, 8],
];
const ROOTS = [50, 55, 50, 57, 50, 55, 57, 50] as const;

export class Music {
  readonly synth: Synth;
  readonly gain: GainNode;

  constructor(context: BaseAudioContext, destination: AudioNode) {
    this.gain = context.createGain();
    this.gain.gain.value = .72;
    this.gain.connect(destination);
    this.synth = new Synth(context, this.gain);
    const delay = context.createDelay(1);
    const feedback = context.createGain();
    const damp = context.createBiquadFilter();
    const wet = context.createGain();
    delay.delayTime.value = STEP * 3;
    feedback.gain.value = .22;
    damp.frequency.value = 2100;
    wet.gain.value = .16;
    this.synth.bus.connect(delay).connect(damp).connect(wet).connect(this.gain);
    damp.connect(feedback).connect(delay);
  }

  /** Calm title theme: slow reed melody, sparse gayageum arpeggio, one soft buk per two bars. */
  title(index: number, at: number): void {
    const step = index % LOOP_STEPS;
    const beat = step % 16;
    const root = ROOTS[Math.floor(step / 16)];
    const synth = this.synth;
    if (step % 32 === 0) synth.buk(at, .12);
    if (beat === 0) synth.tone({ hz: pitch(root - 12), seconds: STEP * 16, gain: .07, wave: "triangle", pan: -.1 }, at);
    if (beat % 4 === 0) {
      const note = [root + 12, root + 19, root + 24, root + 19][beat / 4];
      synth.pluck(pitch(note), at, STEP * 7, .055, beat < 8 ? -.35 : .35);
    }
    for (const [position, midi, duration] of TITLE) {
      if (position !== step) continue;
      synth.tone({ hz: pitch(midi) * .985, endHz: pitch(midi), seconds: STEP * duration * .95,
        gain: .07, wave: "triangle", reed: true, pan: .05 }, at);
      synth.pluck(pitch(midi - 12), at, STEP * 6, .06, -.15);
    }
  }

  /** Battle loop. Intensity layers in over a run: 0 base, 1 at 2 min, 2 at 5 min, 3 at 8 min. */
  step(index: number, at: number, intensity: Intensity): void {
    const step = index % LOOP_STEPS;
    const beat = step % 16;
    const root = ROOTS[Math.floor(step / 16)];
    const synth = this.synth;
    // Driving buk (low drum) pulse: boom . . . . ba boom, more syncopation as layers stack.
    const bukBeats = intensity >= 3 ? [0, 3, 6, 8, 11, 14] : intensity >= 2 ? [0, 6, 8, 14]
      : intensity >= 1 ? [0, 6, 8] : [0, 8];
    if (bukBeats.includes(beat)) synth.buk(at, beat === 0 ? (intensity === 3 ? .36 : .28) : .2);
    // Janggu deong / gideok / kung / deoreore, not a four-on-the-floor kit.
    if ([4, 10, 12].includes(beat) || (intensity >= 1 && [3, 7, 15].includes(beat))) {
      synth.janggu(at, beat === 4 || beat === 12);
    }
    if (intensity >= 2 && [6, 11, 13].includes(beat)) synth.janggu(at, false);
    if (intensity >= 3 && beat % 2 === 1) synth.janggu(at, false);
    if (intensity >= 2 && beat % 4 === 2) synth.kkwaenggwari(at, intensity === 3 ? .06 : .045);
    if (intensity >= 3 && beat % 4 === 1) synth.kkwaenggwari(at, .03);
    // Bass: sparse root, then an eighth-note drive, then a sixteenth-skipping pulse.
    if (beat === 0 || (intensity >= 1 && beat === 10)) {
      synth.tone({ hz: pitch(root - 12), seconds: STEP * 5, gain: .19, wave: "triangle", pan: -.12 }, at);
    }
    if (intensity >= 2 && beat % (intensity >= 3 ? 2 : 4) === 0) {
      synth.tone({ hz: pitch(root), seconds: STEP * .85, gain: .05, wave: "sawtooth", pan: .3 }, at);
    }
    for (const [position, midi, duration] of HOOK) {
      if (position !== step) continue;
      const hz = pitch(midi);
      // Gayageum plays the hook from the start; haegeum-like reed joins at layer 1.
      synth.pluck(hz, at, STEP * Math.max(duration, 3) * 1.15, .15, -.1);
      if (duration >= 4) {
        for (let tremolo = 2; tremolo < duration; tremolo += 2) {
          synth.pluck(hz, at + STEP * tremolo, STEP * 2.5, .07, -.1);
        }
      }
      if (intensity >= 1) {
        synth.tone({ hz: hz * .975, endHz: hz, seconds: STEP * duration * .9, gain: .085,
          wave: "triangle", reed: true, pan: .1 }, at);
      }
      if (intensity >= 2) {
        synth.tone({ hz: hz * 2, seconds: STEP * duration * .8, gain: .03, wave: "sine", reed: true, pan: .3 }, at);
      }
      if (intensity >= 3) {
        synth.pluck(pitch(midi - 5), at, STEP * 3, .07, .4);
        synth.pluck(hz * 2, at + STEP * .5, STEP * 2, .05, -.4);
      }
    }
    if (intensity >= 1 && beat % 4 === 2) {
      const arpeggio = [root + 12, root + 19, root + 24, root + 19][Math.floor(beat / 4)];
      synth.pluck(pitch(arpeggio), at, .2, .06, beat < 8 ? -.5 : .5);
    }
    if (intensity >= 2 && step % 32 === 0) {
      for (const ratio of [1, 1.48, 2.09, 2.71]) {
        synth.tone({ hz: 310 * ratio, endHz: 307 * ratio, seconds: 1.25,
          gain: .025 / ratio, wave: "sine", pan: .35 }, at);
      }
    }
    if (intensity >= 3 && step % 64 === 0) synth.noise(at, { seconds: .5, gain: .05, hz: 7000 });
  }
}
