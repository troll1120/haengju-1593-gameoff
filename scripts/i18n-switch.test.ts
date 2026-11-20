import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

test("pause, title, lobby and upgrade board switch ko to en to ko and retain the choice after reload", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, resolve(process.env.CASTLE_CODEX_DIST ?? resolve(import.meta.dir, "../review-dist"))),
  });
  const profile = await mkdtemp(`${tmpdir()}/castle-i18n-`);
  const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
  const url = `http://127.0.0.1:${server.port}/?seed=7`;
  const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
    const end = performance.now() + 30000;
    const check = () => {
      if (${expression}) requestAnimationFrame(() => resolve(true));
      else if (performance.now() > end) reject(new Error("UI timeout: " + ${JSON.stringify(expression)}));
      else requestAnimationFrame(check);
    }; check();
  })`);
  const text = (selector: string) => phone.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim()`);
  const tap = async (selector: string) => expect(await phone.tapElement(selector)).toBe(true);
  try {
    await phone.view.navigate(url);
    await phone.evaluate(`localStorage.setItem("haengju1593-lang", "ko")`);
    await phone.view.navigate(url);
    await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
    for (const lang of ["ko", "en", "ko"]) {
      await tap("#title-settings");
      if (await phone.evaluate("document.documentElement.lang") !== lang) await tap("#toggle-lang");
      expect(await text("#intro #toggle-lang b")).toBe(lang === "en" ? "Language" : "언어");
      expect(await text("#intro #toggle-sound b")).toBe(lang === "en" ? "Sound" : "소리");
      expect(await text("#intro #toggle-motion b")).toBe(lang === "en" ? "Shake" : "흔들림");
      expect(await text("#intro #toggle-flashes b")).toBe(lang === "en" ? "Flashes" : "번쩍임");
      expect(await phone.evaluate("document.querySelector('#intro #settings-close').getAttribute('aria-label')")).toBe(lang === "en" ? "Close" : "닫기");
      await tap("#settings-close");
      expect(await text("#start b")).toBe(lang === "en" ? "Survival" : "서바이벌");
      await tap("#start");
      await ready("document.querySelector('[data-bph-start]')");
      expect(await text(".bph-management h1")).toBe(lang === "en" ? "Battle Prep" : "출전 준비");
      await tap(".bph-actions button");
      await ready(`document.querySelector('[data-prep-tab="shared"]')`);
      expect(await phone.evaluate(`document.querySelector('.bph-actions button[aria-pressed="true"]').getAttribute("aria-label")`))
        .toBe(lang === "en" ? "Upgrades" : "강화");
      await tap('button[data-placement="_SkillTreeMain_Demo:23:15"]');
      expect(await text(".bph-placement-tooltip strong")).toMatch(lang === "en" ? /HP/i : /내성 체력/);
      await tap('.bph-actions button[aria-pressed="true"]');
      await tap(".bph-management header button");
    }
    await tap("#title-settings");
    await tap("#toggle-lang");
    await phone.view.navigate(url);
    await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
    expect(await phone.evaluate("document.documentElement.lang")).toBe("en");
    expect(await text("#start b")).toBe("Survival");
    await tap("#start");
    await ready("document.querySelector('[data-bph-start]')");
    await tap("[data-bph-start]");
    await passFirstBattleGuide(phone);
    await ready("!castleSample.snapshot().attract && castleSample.snapshot().time > 0");
    await tap("#pause");
    expect(await text("#resume b")).toBe("Resume");
    await tap("#toggle-lang");
    expect(await text("#resume b")).toBe("계속");
    const masteryLabel = () => phone.evaluate(`document.querySelector("#mastery-earned").getAttribute("aria-label")`);
    expect(String(await masteryLabel())).toMatch(/[가-힣]/);
    await tap("#toggle-lang");
    expect(await text("#resume b")).toBe("Resume");
    expect(String(await masteryLabel())).not.toMatch(/[가-힣]/);
    await tap("#resume");
    // The recruit pack shows only its art and price; its words live in the accessible name (owner DM 1794904059.845219).
    expect(await phone.evaluate(`document.querySelector(".bph-recruit-strip > .bph-recruit-cell").getAttribute("aria-label")`)).toMatch(/^Basic Recruit \d+$/);
    expect(String(await text(".bph-recruit-strip > .bph-recruit-cell"))).toMatch(/^\d+$/);
    expect(await phone.evaluate(`document.querySelector(".bph-recruit-strip").getAttribute("aria-label")`)).toContain("Recruit");
    expect(String(await text(".bph-recruit-strip"))).not.toContain("Recruit");
    expect(phone.errors).toEqual([]);
  } finally {
    phone.view.close(); server.stop(true);
    await rm(profile, { recursive: true });
  }
}, 120000);
