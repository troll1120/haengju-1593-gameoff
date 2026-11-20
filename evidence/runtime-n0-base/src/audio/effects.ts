import { Synth } from "./synth";

type Tone = { readonly hz: number; readonly endHz?: number; readonly seconds: number;
  readonly gain: number; readonly wave?: OscillatorType; readonly at?: number };
type Hiss = { readonly seconds: number; readonly gain: number; readonly hz: number; readonly at?: number };
type Recipe = { readonly duration: number; readonly gap: number; readonly hit?: boolean;
  readonly impact?: boolean; readonly priority?: boolean; readonly tones?: readonly Tone[]; readonly noise?: readonly Hiss[] };
const rise = (notes: readonly number[], step: number, gain = .13): readonly Tone[] =>
  notes.map((hz, i) => ({ hz, at: i * step, seconds: .24, gain, wave: "triangle" }));

export const EFFECTS = {
  prepare: { duration: .05, gap: .045,
    tones: [{ hz: 620, endHz: 1050, seconds: .03, gain: .035, wave: "triangle" }] },
  kill: { duration: .1, gap: .045,
    tones: [{ hz: 780, endHz: 390, seconds: .075, gain: .065, wave: "triangle" }],
    noise: [{ seconds: .04, gain: .045, hz: 1600 }] },
  hit: { duration: .12, gap: .055, hit: true,
    tones: [{ hz: 480, endHz: 150, seconds: .055, gain: .12, wave: "triangle" }],
    noise: [{ seconds: .045, gain: .14, hz: 2400 }] },
  heavy: { duration: .23, gap: .085, hit: true, impact: true,
    tones: [{ hz: 170, endHz: 55, seconds: .16, gain: .32 }],
    noise: [{ seconds: .12, gain: .22, hz: 600 }] },
  crit: { duration: .27, gap: .1, hit: true, impact: true,
    tones: [{ hz: 1800, endHz: 2500, seconds: .08, gain: .11, wave: "triangle" },
      { hz: 180, endHz: 48, seconds: .2, gain: .32 }],
    noise: [{ seconds: .07, gain: .2, hz: 4200 }] },
  arrow: { duration: .13, gap: .06,
    tones: [{ hz: 1400, endHz: 390, seconds: .09, gain: .035, wave: "triangle" }],
    noise: [{ seconds: .09, gain: .095, hz: 5300 }] },
  rocket: { duration: .32, gap: .13,
    tones: [{ hz: 150, endHz: 820, seconds: .27, gain: .09, wave: "sawtooth" }],
    noise: [{ seconds: .29, gain: .16, hz: 1400 }] },
  blast: { duration: .65, gap: .16, impact: true,
    tones: [{ hz: 120, endHz: 28, seconds: .58, gain: .42 }],
    noise: [{ seconds: .48, gain: .38, hz: 410 }, { seconds: .11, gain: .16, hz: 3300 }] },
  volley: { duration: .9, gap: .45, impact: true,
    tones: [{ hz: 180, endHz: 42, at: .25, seconds: .55, gain: .35 }],
    noise: [0, .08, .16].map(at => ({ at, seconds: .16, gain: .18, hz: 2300 })) },
  shield: { duration: .9, gap: .45,
    tones: [...rise([587.33, 880, 1174.66], .06, .15),
      { hz: 293.66, seconds: .8, gain: .12, wave: "triangle" }],
    noise: [{ seconds: .2, gain: .09, hz: 3600 }] },
  charge: { duration: .65, gap: .4, impact: true,
    tones: [{ hz: 146.83, endHz: 587.33, seconds: .42, gain: .16, wave: "sawtooth" },
      { hz: 880, endHz: 440, at: .23, seconds: .25, gain: .09, wave: "triangle" }],
    noise: [{ seconds: .35, gain: .16, hz: 1900 }] },
  telegraph: { duration: .7, gap: .4, priority: true,
    tones: [0, .19, .38].map(at => ({ hz: 146.83, endHz: 138.59, at, seconds: .16, gain: .15, wave: "sawtooth" })) },
  land: { duration: .85, gap: .3, impact: true, priority: true,
    tones: [{ hz: 100, endHz: 24, seconds: .75, gain: .48 }],
    noise: [{ seconds: .6, gain: .38, hz: 300 }, { seconds: .13, gain: .2, hz: 1800 }] },
  wall: { duration: .25, gap: .13, hit: true,
    tones: [{ hz: 115, endHz: 62, seconds: .2, gain: .23 }],
    noise: [{ seconds: .12, gain: .18, hz: 470 }] },
  coin: { duration: .23, gap: .1,
    tones: [{ hz: 440, endHz: 1760, seconds: .12, gain: .035, wave: "sine" },
      { hz: 2093, seconds: .14, gain: .08 },
      { hz: 3139, at: .025, seconds: .14, gain: .045 }] },
  magnet: { duration: .55, gap: .17,
    tones: [...rise([1174.66, 1567.98, 1760, 2349.32], .065, .08),
      { hz: 440, endHz: 1760, seconds: .32, gain: .035, wave: "sine" }] },
  card: { duration: .25, gap: .08,
    tones: [{ hz: 450, endHz: 980, seconds: .085, gain: .11, wave: "triangle" },
      { hz: 1760, at: .065, seconds: .12, gain: .07 }],
    noise: [{ seconds: .05, gain: .09, hz: 2900 }] },
  tick: { duration: .055, gap: .045,
    tones: [{ hz: 1450, endHz: 900, seconds: .028, gain: .09, wave: "triangle" }] },
  prize: { duration: .7, gap: .3, impact: true, tones: rise([880, 1174.66, 1760], .085) },
  horn: { duration: 1.65, gap: 1.4, priority: true,
    tones: [{ hz: 146.83, endHz: 144.5, seconds: 1.5, gain: .15, wave: "sawtooth" },
      { hz: 220, endHz: 216, at: .06, seconds: 1.4, gain: .09, wave: "sawtooth" },
      { hz: 73.415, seconds: 1.55, gain: .2 }] },
  win: { duration: 2.3, gap: 2, priority: true,
    tones: [...rise([587.33, 659.25, 783.99, 880, 1174.66], .14, .18),
      { hz: 587.33, at: .7, seconds: 1.35, gain: .17, wave: "triangle" },
      { hz: 880, at: .7, seconds: 1.35, gain: .11, wave: "triangle" }] },
  lose: { duration: 2.4, gap: 2, priority: true,
    tones: [587.33, 523.25, 440, 293.66].map((hz, i) =>
      ({ hz, endHz: hz * .98, at: i * .3, seconds: .95, gain: .16, wave: "triangle" })) },
  hurt: { duration: .22, gap: .15, tones: [{ hz: 330, endHz: 130, seconds: .18, gain: .1 }] },
  down: { duration: .7, gap: .5, tones: [{ hz: 440, endHz: 110, seconds: .65, gain: .15, wave: "triangle" }] },
  block: { duration: .22, gap: .12, tones: [{ hz: 1760, seconds: .16, gain: .1, wave: "triangle" }] },
  levelup: { duration: .7, gap: .4, tones: rise([587.33, 783.99, 880, 1174.66], .09),
    noise: [{ seconds: .045, gain: .12, hz: 2900 }] },
  pick: { duration: .3, gap: .12,
    tones: [{ hz: 450, endHz: 980, seconds: .085, gain: .11, wave: "triangle" },
      ...rise([783.99, 1174.66], .065, .09)],
    noise: [{ seconds: .04, gain: .08, hz: 2900 }] },
  evolve: { duration: .85, gap: .7,
    tones: [{ hz: 293.66, endHz: 1174.66, seconds: .4, gain: .11, wave: "sawtooth" },
      ...rise([1174.66, 1567.98, 1760], .11, .12)] },
  impact: { duration: .4, gap: .1, impact: true,
    tones: [{ hz: 100, endHz: 32, seconds: .32, gain: .38 }] },
  drum: { duration: .7, gap: .5, impact: true, priority: true,
    tones: [{ hz: 88, endHz: 34, seconds: .5, gain: .46 }, { hz: 176, endHz: 66, at: .14, seconds: .3, gain: .26 }],
    noise: [{ seconds: .09, gain: .22, hz: 520 }, { at: .14, seconds: .06, gain: .14, hz: 420 }] },
  roulette: { duration: 1.26, gap: 1.3 },
} satisfies Record<string, Recipe>;

export type EffectName = keyof typeof EFFECTS;

export function playEffect(synth: Synth, name: EffectName, at: number, pitch = 1): void {
  const recipe: Recipe = EFFECTS[name];
  for (const note of recipe.tones ?? []) synth.tone({ ...note, hz: note.hz * pitch, endHz: note.endHz === undefined ? undefined : note.endHz * pitch }, at + (note.at ?? 0));
  for (const noise of recipe.noise ?? []) synth.noise(at + (noise.at ?? 0), { ...noise, hz: noise.hz * pitch });
  if (name === "roulette") {
    // 12 rapid ticks, exactly three spaced "ddik"s, then a bass-and-metal stop punch.
    for (const time of [0, .04, .08, .12, .16, .20, .24, .28, .32, .36, .40, .44, .62, .81, 1.02]) {
      synth.tone({ hz: (time < .5 ? 1450 : 1100) * pitch, endHz: 720 * pitch,
        seconds: time < .5 ? .035 : .065, gain: .12, wave: "triangle" }, at + time);
    }
    synth.tone({ hz: 135 * pitch, endHz: 42 * pitch, seconds: .1, gain: .38 }, at + 1.16);
    synth.noise(at + 1.16, { seconds: .045, gain: .12, hz: 380 * pitch });
    synth.tone({ hz: 2349.32 * pitch, seconds: .1, gain: .15, wave: "triangle" }, at + 1.16);
  }
}
