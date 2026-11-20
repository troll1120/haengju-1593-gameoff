import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { audio, AudioEngine } from "./engine";
import type { EffectName } from "./effects";
import { Context } from "./engine-test-fixture";
import type { Node } from "./engine-test-fixture";

const originalContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const timeline = { currentTime: 1000 };
const engines: AudioEngine[] = [];
let values: Map<string, string>;
let random: ReturnType<typeof spyOn<Math, "random">>;

beforeEach(() => {
  Context.instances = [];
  values = new Map();
  timeline.currentTime = 1000;
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Context });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { timeline } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } });
  random = spyOn(Math, "random").mockReturnValue(.5);
});

afterEach(() => {
  for (const engine of engines) engine.stop();
  engines.length = 0;
  audio.stop();
  audio.setMuted(false);
  random.mockRestore();
  for (const [key, descriptor] of [
    ["AudioContext", originalContext], ["document", originalDocument], ["localStorage", originalStorage],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function setup() {
  const engine = new AudioEngine();
  engines.push(engine);
  await engine.unlock();
  const context = Context.instances.at(-1);
  if (!context) throw new Error("Audio context fixture was not created");
  engine.setScene("battle");
  return { engine, context };
}

function advance(context: Context, seconds: number): void {
  context.currentTime += seconds;
  timeline.currentTime += seconds * 1000;
}

function eventGain(engine: AudioEngine, context: Context, name: EffectName, delay = 0): Node {
  const count = context.gains.length;
  engine.play(name, delay);
  expect(context.gains.length).toBeGreaterThan(count);
  const gain = context.gains[count];
  if (!gain) throw new Error("Audio event did not create a voice");
  return gain;
}

test("all impact sources start at event onset while BGM is between beats", async () => {
  const { engine, context } = await setup();
  engine.start();
  advance(context, .071);
  const tones = context.oscillators.length, noises = context.noises.length;
  engine.play("heavy");
  // Heavy's tone/noise and its buk tone/noise must all start together.
  expect(context.oscillators.slice(tones).flatMap(node => node.starts)).toEqual([context.currentTime, context.currentTime]);
  expect(context.noises.slice(noises).flatMap(node => node.starts)).toEqual([context.currentTime, context.currentTime]);
  expect(engine.state().bgm).toBe(true);
});

test("same-name minimum gap is 45 ms and longer recipe gaps remain enforced", async () => {
  const { engine, context } = await setup();
  engine.play("tick");
  advance(context, .044);
  engine.play("tick");
  expect(context.oscillators).toHaveLength(1);
  advance(context, .001);
  engine.play("tick");
  expect(context.oscillators).toHaveLength(2);
  engine.play("coin");
  const count = context.oscillators.length;
  advance(context, .099);
  engine.play("coin");
  expect(context.oscillators).toHaveLength(count);
  advance(context, .002);
  engine.play("coin");
  expect(context.oscillators).toHaveLength(count + 3);
});

test("frame cap replaces ordinary cues for priority and resets at the next rendered frame", async () => {
  const { engine, context } = await setup();
  engine.play("arrow");
  engine.play("coin");
  const replaced = eventGain(engine, context, "block");
  engine.play("hurt");
  expect(engine.state().voices).toBe(3);
  // An audio clock advance during one long render callback cannot reset the frame.
  context.currentTime += .02;
  engine.play("horn");
  expect(engine.state().voices).toBe(3);
  expect(replaced.disconnected).toBe(true);
  expect(replaced.gain.value).toBe(0);
  engine.play("land");
  engine.play("win");
  expect(engine.state().voices).toBe(3);
  const count = context.oscillators.length;
  engine.play("drum");
  expect(context.oscillators).toHaveLength(count);
  timeline.currentTime += 16.667;
  engine.play("telegraph");
  expect(engine.state().voices).toBe(4);
});

test("100 ms admission window normalizes new and earlier event gains together", async () => {
  const { engine, context } = await setup();
  const first = eventGain(engine, context, "arrow");
  expect(first.gain.value).toBe(1);
  advance(context, .04);
  const second = eventGain(engine, context, "block");
  expect(first.gain.value).toBeCloseTo(1 / Math.sqrt(2), 10);
  expect(second.gain.value).toBeCloseTo(1 / Math.sqrt(2), 10);
  advance(context, .059);
  const third = eventGain(engine, context, "coin");
  for (const gain of [first, second, third]) expect(gain.gain.value).toBeCloseTo(1 / Math.sqrt(3), 10);
  advance(context, .042);
  const fourth = eventGain(engine, context, "card");
  expect(fourth.gain.value).toBeCloseTo(1 / Math.sqrt(2), 10);
  expect(third.gain.value).toBeCloseTo(1 / Math.sqrt(2), 10);
  // Expired groups disconnect and all event synths reuse the original noise buffers.
  expect(first.disconnected).toBe(true);
  expect(context.buffers).toBe(2);
  advance(context, .101);
  expect(eventGain(engine, context, "hurt").gain.value).toBe(1);
});

test("delayed cue gaps voice overlap and normalization use scheduled onset", async () => {
  const { engine, context } = await setup();
  const prepare = eventGain(engine, context, "prepare", .5);
  const kill = eventGain(engine, context, "kill", .05);
  expect(prepare.gain.events.at(-1)).toEqual({ value: 1, at: 1.5 });
  expect(kill.gain.events.at(-1)).toEqual({ value: 1, at: 1.05 });
  const impact = eventGain(engine, context, "hit", .49);
  expect(prepare.gain.events.at(-1)?.value).toBeCloseTo(1 / Math.sqrt(2), 10);
  expect(impact.gain.events.at(-1)).toEqual({ value: 1 / Math.sqrt(2), at: 1.49 });
  expect(kill.gain.events.at(-1)?.value).toBe(1);
  advance(context, .05);
  const count = context.oscillators.length;
  engine.play("prepare", .45);
  expect(context.oscillators).toHaveLength(count);
  // Four future hits must not block a non-overlapping immediate hit.
  const future = await setup();
  for (const name of ["hit", "heavy", "wall"] as const) future.engine.play(name, 1);
  advance(future.context, .001);
  future.engine.play("heavy", 1.09);
  const before = future.context.oscillators.length;
  future.engine.play("crit");
  expect(future.context.oscillators.length).toBe(before + 3);
  expect(future.engine.state().hitVoices).toBe(5);
});

test("four hit groups and twelve ordinary groups retain their existing caps", async () => {
  const { engine, context } = await setup();
  for (const name of ["hit", "heavy", "crit"] as const) engine.play(name);
  advance(context, .06);
  engine.play("wall");
  engine.play("hit");
  expect(engine.state().hitVoices).toBe(4);

  const other = await setup();
  for (const [index, name] of (["shield", "rocket", "blast", "volley", "charge", "magnet",
    "prize", "down", "levelup", "evolve", "roulette", "drum", "land", "horn", "telegraph"] as const).entries()) {
    if (index % 3 === 0) advance(other.context, .001);
    other.engine.play(name);
  }
  // Eleven ordinary + four priority; one ordinary fills the remaining slot.
  advance(other.context, .001);
  other.engine.play("impact");
  expect(other.engine.state().voices).toBe(16);
  other.engine.play("arrow");
  expect(other.engine.state().voices).toBe(16);
  other.engine.play("win");
  expect(other.engine.state().voices).toBe(17);
});

test("pitch jitter is bounded by three percent while coin streak still rises and resets", async () => {
  const { engine, context } = await setup();
  random.mockReturnValue(0);
  engine.play("coin");
  expect(context.oscillators[0]?.frequency.events[0]?.value).toBeCloseTo(440 * .97, 10);
  advance(context, .101);
  random.mockReturnValue(1);
  engine.play("coin");
  expect(context.oscillators[3]?.frequency.events[0]?.value).toBeCloseTo(440 * 2 ** (1 / 6) * 1.03, 10);
  advance(context, .401);
  engine.play("coin");
  expect(context.oscillators[6]?.frequency.events[0]?.value).toBeCloseTo(440 * 1.03, 10);
});

test("locked, suspended, title and muted calls do not consume admission or create contexts", async () => {
  const engine = new AudioEngine();
  engines.push(engine);
  engine.play("heavy");
  expect(Context.instances).toHaveLength(0);
  engine.start();
  await engine.unlock();
  const context = Context.instances[0];
  if (!context) throw new Error("Audio context fixture was not created");
  expect(context.resumes).toBe(1);
  expect(engine.state().bgm).toBe(true);
  const count = context.oscillators.length;
  engine.play("heavy");
  expect(context.oscillators).toHaveLength(count);
  engine.setScene("battle");
  context.state = "suspended";
  engine.play("heavy");
  expect(engine.state().voices).toBe(0);
  await engine.unlock();
  expect(Context.instances).toHaveLength(1);
  engine.setMuted(true);
  engine.play("heavy");
  expect(engine.state().voices).toBe(0);
  expect(new AudioEngine().state().muted).toBe(true);
  expect(context.gains[0]?.gain.value).toBe(0);
  engine.setMuted(false);
  engine.play("heavy");
  expect(engine.state().voices).toBe(1);
  expect(context.gains[0]?.gain.value).toBe(1);
  expect(new AudioEngine().state().muted).toBe(false);
  engine.stop();
  expect(engine.state().bgm).toBe(false);
});

test("invalid delay values are rejected at the public audio boundary", async () => {
  const { engine } = await setup();
  for (const delay of [-.01, Infinity, NaN]) expect(() => engine.play("hit", delay)).toThrow(RangeError);
  expect(engine.state().voices).toBe(0);
});

test("music and effects gains persist independently through mute and reload", async () => {
  const { engine } = await setup();
  engine.setVolume("bgm", 23);
  expect(engine.state()).toMatchObject({ bgmVolume: 23, sfxVolume: 100, bgmGain: .23, sfxGain: 1 });
  engine.setVolume("sfx", 61);
  expect(engine.state()).toMatchObject({ bgmVolume: 23, sfxVolume: 61, bgmGain: .23, sfxGain: .61 });
  engine.setMuted(true);
  expect(engine.state()).toMatchObject({ masterGain: 0, bgmGain: .23, sfxGain: .61 });
  engine.setMuted(false);
  expect(engine.state()).toMatchObject({ masterGain: 1, bgmGain: .23, sfxGain: .61 });
  const reloaded = await setup();
  expect(reloaded.engine.state()).toMatchObject({ bgmVolume: 23, sfxVolume: 61, bgmGain: .23, sfxGain: .61 });
});

test("out of order windups preserve all distinct onsets and reject either neighbouring duplicate", async () => {
  const { engine, context } = await setup();
  engine.play("prepare", .22);
  engine.play("prepare", .14);
  engine.play("prepare", .16);
  advance(context, .001);
  engine.play("prepare", .199);
  expect(context.oscillators.flatMap(node => node.starts)).toEqual([1 + .22, 1 + .14]);
});

test("pause and scene boundaries cancel future cues and release their retrigger stamps", async () => {
  for (const boundary of ["pause", "stop", "title"] as const) {
    const { engine, context } = await setup();
    const pending = eventGain(engine, context, "prepare", .22);
    switch (boundary) {
      case "pause": engine.cancelPending(); break;
      case "stop": engine.stop(); break;
      case "title": engine.setScene("title"); break;
    }
    engine.play("prepare", .22);
    expect(pending.disconnected).toBe(true);
    expect(context.oscillators.flatMap(node => node.starts)).toEqual([1.22, 1.22]);
    expect(engine.state().voices).toBe(1);
  }
});
