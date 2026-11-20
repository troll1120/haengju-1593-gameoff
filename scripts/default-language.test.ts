import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";

test("a Korean browser starts in English and reopens in the Korean chosen in Settings", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, resolve(import.meta.dir, "../review-dist")),
  });
  const profile = await mkdtemp(`${tmpdir()}/castle-default-language-`);
  const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
  const url = `http://127.0.0.1:${server.port}/?seed=7&renderer=canvas`;
  const storageKey = "haengju1593-lang";
  const evidence = process.env.CASTLE_LANGUAGE_EVIDENCE;
  const ready = (condition: string) => phone.evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 20000;
    function frame() {
      if (${condition}) resolve(true);
      else if (performance.now() > deadline) reject(new Error("UI timeout: " + ${JSON.stringify(condition)}));
      else requestAnimationFrame(frame);
    }
    frame();
  })`);
  const tap = async (selector: string) => expect(await phone.tapElement(selector)).toBe(true);
  const shot = async (name: string) => {
    if (evidence) {
      await phone.evaluate("document.fonts.ready.then(() => true)");
      await phone.shot(`${evidence}/${name}.png`);
    }
  };
  try {
    await phone.view.cdp("Page.addScriptToEvaluateOnNewDocument", {
      source: "Object.defineProperty(navigator, 'language', { get: () => 'ko-KR' });",
    });
    await phone.view.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await phone.view.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await phone.view.navigate(url);
    const loaded = "window.castleSample && !document.querySelector('#start').disabled";
    await ready(loaded);
    expect(await phone.evaluate("navigator.language")).toBe("ko-KR");
    expect(await phone.evaluate(`localStorage.getItem("${storageKey}")`)).toBeNull();
    expect(await phone.evaluate("document.documentElement.lang")).toBe("en");
    expect(await phone.evaluate("document.querySelector('#start b').textContent")).toBe("Survival");
    await shot("01-title-en");

    await tap("#title-settings");
    expect(await phone.evaluate("document.querySelector('#menu-language').textContent")).toBe("English");
    await shot("02-settings-en");
    await tap("#toggle-lang");
    expect(await phone.evaluate(`localStorage.getItem("${storageKey}")`)).toBe("ko");
    expect(await phone.evaluate("document.querySelector('#menu-language').textContent")).toBe("한국어");
    await shot("04-settings-ko");

    await phone.view.navigate(url);
    await ready(loaded);
    expect(await phone.evaluate("document.documentElement.lang")).toBe("ko");
    expect(await phone.evaluate("document.querySelector('#start b').textContent")).toBe("서바이벌");
    await tap("#title-settings");
    await tap("#toggle-lang");
    await tap("#settings-close");
    await tap("#start");
    await ready("document.querySelector('[data-bph-start]')");
    await tap("[data-bph-start]");
    await passFirstBattleGuide(phone);
    await ready("!castleSample.snapshot().attract && castleSample.snapshot().time > 0");
    expect(await phone.evaluate("document.querySelector('#pause').getAttribute('aria-label')")).toBe("Menu");
    await shot("03-battle-hud-en");
  } finally {
    server.stop(true);
    await closeBrowser(phone.view, profile);
  }
}, 60000);
