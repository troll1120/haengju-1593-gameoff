import { expect, test } from "bun:test";
import { audio } from "./engine";
import { playSfx } from "./index";
import { Context } from "./engine-test-fixture";

test("public tick schedules one tick per event and optional kill delay is exactly 50 ms", async () => {
  const originalContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const timeline = { currentTime: 1000 };
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Context });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { timeline } });
  try {
    audio.setMuted(false);
    await audio.unlock();
    audio.setScene("battle");
    const context = Context.instances.at(-1);
    if (!context) throw new Error("Audio context fixture was not created");
    const before = context.oscillators.length;
    playSfx("tick");
    expect(context.oscillators.slice(before).flatMap(node => node.starts)).toEqual([1]);
    context.currentTime += .045; timeline.currentTime += 45;
    playSfx("tick");
    expect(context.oscillators.slice(before).flatMap(node => node.starts)).toEqual([1, 1.045]);
    playSfx("kill", .05);
    expect(context.oscillators.slice(-1).flatMap(node => node.starts)).toEqual([1.095]);
  } finally {
    audio.stop();
    for (const [key, descriptor] of [["AudioContext", originalContext], ["document", originalDocument]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
