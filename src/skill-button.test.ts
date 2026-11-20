import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { chaosArena, chaosEnemy } from "./chaos-test-fixture";
import { feedbackChannels } from "./presentation";
import { useSkill } from "./rules";
import { skillButtonCast } from "./skill-button";

type Timer = { id: ReturnType<typeof setTimeout>; at: number; callback: () => void; cancelled: boolean };
let now = 0, timers: Timer[] = [];
let setTimer: ReturnType<typeof spyOn<typeof globalThis, "setTimeout">>;
let clearTimer: ReturnType<typeof spyOn<typeof globalThis, "clearTimeout">>;

beforeEach(() => {
  now = 0; timers = [];
  setTimer = spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, delay: number) => {
    const id = (timers.length + 1) as unknown as ReturnType<typeof setTimeout>;
    timers.push({ id, at: now + delay, callback, cancelled: false });
    return id;
  }) as typeof setTimeout);
  clearTimer = spyOn(globalThis, "clearTimeout").mockImplementation(id => {
    const timer = timers.find(timer => timer.id === id);
    if (timer) timer.cancelled = true;
  });
});

afterEach(() => {
  setTimer.mockRestore(); clearTimer.mockRestore();
});

function advance(ms: number): void {
  now += ms;
  for (const timer of timers) if (!timer.cancelled && timer.at <= now) {
    timer.cancelled = true; timer.callback();
  }
}

function fixture() {
  const run = chaosArena("권율", 1);
  chaosEnemy(run, 195, 100);
  const cast = useSkill(run, 0);
  expect(cast.length).toBeGreaterThan(0);
  const animations: { frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
  let cancelled = 0;
  const button = {
    style: { outline: "" },
    getAnimations: () => [
      { id: "skill-cast", cancel() { cancelled++; } },
      { id: "ready", cancel() { throw Error("Ready animation must survive"); } },
    ],
    animate(frames: Keyframe[], options: KeyframeAnimationOptions) { animations.push({ frames, options }); },
  } as unknown as HTMLElement;
  return { run, cast, button, animations, cancelled: () => cancelled };
}

test("motion-off success holds a fixed outline for exactly 120ms", () => {
  const { button, cast, animations } = fixture();
  skillButtonCast(button, cast, feedbackChannels(true, false, false));
  expect(button.style.outline).toBe("2px solid var(--gold-light)");
  expect(animations).toHaveLength(0);
  advance(119);
  expect(button.style.outline).toBe("2px solid var(--gold-light)");
  advance(1);
  expect(button.style.outline).toBe("");
});

test("reduced motion keeps a short plain outline without a transform or flash", () => {
  const { button, cast, animations } = fixture();
  skillButtonCast(button, cast, feedbackChannels(false, false, true));
  expect(button.style.outline).toBe("2px solid currentColor");
  expect(animations).toHaveLength(0);
  advance(120);
  expect(button.style.outline).toBe("");
});

test("flashes off retains the pop with motion on and a plain response with motion off", () => {
  const { button, cast, animations } = fixture();
  skillButtonCast(button, cast, feedbackChannels(false, true, false));
  expect(animations).toEqual([{ frames: [{ transform: "scale(.92)" }, { transform: "scale(1)" }],
    options: { id: "skill-cast", duration: 120, easing: "ease-out" } }]);
  expect(button.style.outline).toBe("");
  expect(timers).toHaveLength(0);
  skillButtonCast(button, cast, feedbackChannels(true, true, false));
  expect(button.style.outline).toBe("2px solid currentColor");
  expect(animations).toHaveLength(1);
  advance(120);
  expect(button.style.outline).toBe("");
});

test("rapid successful casts restart the hold and stale cleanup cannot clear the newer outline", () => {
  const { button, cast, run, cancelled } = fixture();
  skillButtonCast(button, cast, { motion: false, flash: true });
  advance(80);
  run.squads[0].skillClock = 0;
  const nextCast = useSkill(run, 0);
  expect(nextCast.length).toBeGreaterThan(0);
  skillButtonCast(button, nextCast, { motion: false, flash: false });
  expect(timers[0].cancelled).toBe(true);
  timers[0].callback();
  expect(button.style.outline).toBe("2px solid currentColor");
  advance(119);
  expect(button.style.outline).toBe("2px solid currentColor");
  advance(1);
  expect(button.style.outline).toBe("");
  expect(cancelled()).toBe(2);
});

test("switching to a moving response invalidates older outline cleanup", () => {
  const { button, cast, animations } = fixture();
  skillButtonCast(button, cast, { motion: false, flash: false });
  skillButtonCast(button, cast, { motion: true, flash: false });
  expect(timers[0].cancelled).toBe(true);
  expect(button.style.outline).toBe("");
  expect(animations).toHaveLength(1);
  timers[0].callback();
  expect(button.style.outline).toBe("");
  expect(animations).toHaveLength(1);
});

test("a rejected cooldown cast neither restarts nor cancels the accepted response", () => {
  const { button, cast, run, animations, cancelled } = fixture();
  skillButtonCast(button, cast, { motion: false, flash: false });
  advance(80);
  const rejected = useSkill(run, 0);
  expect(rejected).toEqual([]);
  skillButtonCast(button, rejected, { motion: true, flash: true });
  expect(timers).toHaveLength(1);
  expect(timers[0].cancelled).toBe(false);
  expect(cancelled()).toBe(1);
  expect(animations).toHaveLength(0);
  advance(40);
  expect(button.style.outline).toBe("");
});

test("no-target rejection never creates a success response", () => {
  const { button, animations, cancelled } = fixture();
  const run = chaosArena("권율", 1);
  const rejected = useSkill(run, 0);
  expect(rejected).toEqual([]);
  skillButtonCast(button, rejected, { motion: false, flash: true });
  expect(button.style.outline).toBe("");
  expect(timers).toHaveLength(0);
  expect(animations).toHaveLength(0);
  expect(cancelled()).toBe(0);
});

test("outline lifetimes are independent for different skill buttons", () => {
  const first = fixture(), second = fixture();
  skillButtonCast(first.button, first.cast, { motion: false, flash: false });
  advance(60);
  skillButtonCast(second.button, second.cast, { motion: false, flash: false });
  advance(60);
  expect(first.button.style.outline).toBe("");
  expect(second.button.style.outline).toBe("2px solid currentColor");
  advance(60);
  expect(second.button.style.outline).toBe("");
});
