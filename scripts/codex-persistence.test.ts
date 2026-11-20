import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide, sleep } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";

test("unbought runtime discoveries and reward receipts persist across two real reloads", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, resolve(process.env.CASTLE_CODEX_DIST ?? "dist")),
  });
  const profile = await mkdtemp(`${tmpdir()}/castle-codex-reload-`);
  const phone = await launch("about:blank", profile, 390, 844,
    ["--single-process", "--no-zygote", "--disable-gpu"]);
  const url = `http://127.0.0.1:${server.port}/?seed=7`;
  const evidence = process.env.CASTLE_CODEX_EVIDENCE;
  const persisted = `JSON.parse(localStorage.getItem("haengju1593-meta")).bph`;
  const memory = `castleSample.snapshot().bph.save`;
  async function until(expression: string): Promise<void> {
    const deadline = Date.now() + 30000;
    while (!await phone.evaluate(expression)) {
      if (Date.now() >= deadline) throw new Error(`Browser condition timed out: ${expression}`);
      await sleep(30);
    }
  }
  type Stop = {
    readonly found: unknown; readonly foundPersisted: unknown; readonly changes: number; readonly writes: number;
    readonly paused: boolean; readonly memory: unknown; readonly persisted: unknown; readonly time: number;
  };
  /**
   * Battle steps advance at most 0.1 s per rendered frame (main.ts accumulator) and seed 7 finds Monster1_Raider 0.2 s of
   * battle after Monster1_Caveling. So the page itself watches every frame from before the battle starts and taps the real
   * pause control inside the frame `frames` after `condition` first holds: no battle step can run between the check and
   * the pause, however slow the host is.
   */
  async function start(condition: string, frames: number): Promise<Stop> {
    await until(`Boolean(window.castleSample) && !document.querySelector("#start").disabled && !document.querySelector("#app").classList.contains("loading")`);
    expect(await phone.tapElement("#start")).toBe(true);
    await until(`Boolean(document.querySelector("[data-bph-start]"))`);
    await phone.evaluate(`(() => { window.codexStop = new Promise((resolve, reject) => {
      const state = save => ({ discovered: [...save.discovered], rewards: structuredClone(save.codexRewards), totalOpened: save.totalOpened });
      const stored = () => state(${persisted});
      const signature = save => [save.discovered.length, save.codexRewards?.claimed.length ?? 0, save.codexRewards?.pendingGold ?? 0].join(":");
      const end = performance.now() + 30000;
      let found, foundPersisted, writes = 0, after = 0, last = "", changes = 0;
      (function frame() {
        const snapshot = window.castleSample?.snapshot(), save = snapshot?.bph?.save;
        if (save && found === undefined && snapshot.phase === "playing" && (${condition})) {
          found = state(save); foundPersisted = stored(); writes = window.codexAccountWrites.length; last = signature(save);
        } else if (found !== undefined) {
          after++;
          if (signature(save) !== last) { changes++; last = signature(save); }
        }
        if (found !== undefined && after >= ${frames}) {
          document.querySelector("#pause").click();
          const paused = castleSample.snapshot();
          resolve({ found, foundPersisted, changes, writes: window.codexAccountWrites.length - writes,
            paused: paused.paused, memory: state(paused.bph.save), persisted: stored(), time: paused.time });
        } else if (performance.now() > end) reject(new Error("Pause condition timed out: " + ${JSON.stringify(condition)}));
        else requestAnimationFrame(frame);
      })();
    }); return true; })()`);
    expect(await phone.tapElement("[data-bph-start]")).toBe(true);
    await until(`castleSample.snapshot().phase === "playing"`);
    await passFirstBattleGuide(phone);
    return await phone.evaluate(`window.codexStop`) as Stop;
  }
  const rewardState = (source: string) => `(() => {
    const save = ${source};
    return { discovered: save.discovered, rewards: save.codexRewards, totalOpened: save.totalOpened };
  })()`;
  try {
    // Observe the existing save boundary; never inject game state or call keepMeta.
    await phone.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.codexAccountWrites = [];
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === "haengju1593-meta") window.codexAccountWrites.push(value);
        return setItem.call(this, key, value);
      };
    ` });
    await phone.view.navigate(url);
    // The first monster found is saved in its own frame with its receipt, and the page taps pause inside that same
    // frame, so the next monster (0.2 s of battle later) can never reach the account before the comparison.
    const first = await start(`save.discovered.some(id => id.startsWith("Monster"))`, 0);
    expect(first.found).toEqual({ discovered: ["general:권율", "Monster1_Caveling"],
      rewards: { version: 1, claimed: ["discovery:Monster1_Caveling"], pendingGold: 0 }, totalOpened: 0 });
    expect(first.foundPersisted).toEqual(first.found);
    expect(first.memory).toEqual(first.found);
    expect([first.writes, first.changes]).toEqual([0, 0]);
    expect(first.paused).toBe(true);
    expect(first.persisted).toEqual(first.memory);
    // From that stop the test owns the frame clock and steps a fixed 60 frames (1 s of battle, past the next
    // discovery). The account is written once per frame whose discoveries or receipts changed, and never otherwise.
    await phone.evaluate(`new Promise(resolve => {
      const native = requestAnimationFrame.bind(window); window.__codexNative = native; window.__codexQueue = [];
      window.requestAnimationFrame = callback => window.__codexQueue.push(callback);
      native(() => native(() => resolve(true)));
    })`);
    await phone.evaluate(`(() => {
      window.__codexRealNow = performance.now.bind(performance); window.__codexClock = window.__codexRealNow();
      Object.defineProperty(performance, "now", { configurable: true, value: () => window.__codexClock });
    })()`);
    expect(await phone.tapElement("#resume")).toBe(true);
    const stepped = await phone.evaluate(`(() => {
      const save = () => castleSample.snapshot().bph.save;
      const signature = s => [s.discovered.length, s.codexRewards?.claimed.length ?? 0, s.codexRewards?.pendingGold ?? 0].join(":");
      const writes = window.codexAccountWrites.length;
      let last = signature(save()), changes = 0;
      for (let frame = 0; frame < 60; frame++) {
        window.__codexClock += 1000 / 60;
        for (const callback of window.__codexQueue.splice(0)) callback(window.__codexClock);
        if (signature(save()) !== last) { changes++; last = signature(save()); }
      }
      document.querySelector("#pause").click();
      const s = castleSample.snapshot();
      return { changes, writes: window.codexAccountWrites.length - writes, paused: s.paused, time: s.time,
        discovered: [...s.bph.save.discovered] };
    })()`);
    await phone.evaluate(`(() => {
      const offset = window.__codexClock - window.__codexRealNow(), real = window.__codexRealNow, native = window.__codexNative;
      Object.defineProperty(performance, "now", { configurable: true, value: () => real() + offset });
      window.requestAnimationFrame = callback => native(time => callback(time + offset));
      for (const callback of window.__codexQueue.splice(0)) native(time => callback(time + offset));
    })()`);
    expect(stepped).toMatchObject({ paused: true });
    expect(Reflect.get(Object(stepped), "discovered")).toContain("Monster1_Raider");
    expect(Number(Reflect.get(Object(stepped), "changes"))).toBeGreaterThanOrEqual(1);
    expect(Reflect.get(Object(stepped), "writes")).toBe(Reflect.get(Object(stepped), "changes"));
    // Reloads must give back exactly what the account held when the battle stopped.
    const before = await phone.evaluate(rewardState(memory));
    expect(await phone.evaluate(rewardState(persisted))).toEqual(before);
    expect(await phone.evaluate(rewardState(memory))).toEqual(before);
    if (evidence) {
      await Bun.write(`${evidence}/first-stop.json`, JSON.stringify({ first, stepped }, null, 2));
      await Bun.write(`${evidence}/before-reload.json`, JSON.stringify(before, null, 2));
      await phone.shot(`${evidence}/no-purchase-before-reload.png`);
    }

    for (let reload = 1; reload <= 2; reload++) {
      await phone.view.cdp("Page.reload", { ignoreCache: true });
      await until(`Boolean(window.castleSample) && !castleSample.snapshot().bph`);
      expect(await phone.evaluate(rewardState(persisted))).toEqual(before);
      const stop = await start(`snapshot.time > 0`, 0);
      expect([stop.paused, stop.writes]).toEqual([true, 0]);
      expect(stop.memory).toEqual(before);
      expect(await phone.evaluate(rewardState(memory))).toEqual(before);
      expect(await phone.evaluate(rewardState(persisted))).toEqual(before);
      // New starts reset the combat purse; the already-paid discovery is not paid again.
      expect(await phone.evaluate(`castleSample.snapshot().gold`)).toBe(3);
      if (evidence) await Bun.write(`${evidence}/reload-${reload}.json`,
        JSON.stringify(await phone.evaluate(rewardState(persisted)), null, 2));
    }
    expect(phone.errors).toEqual([]);
  } finally {
    server.stop(true);
    await closeBrowser(phone.view, profile);
  }
}, 120000);
