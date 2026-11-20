import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";

const root = resolve(import.meta.dir, "..");
const evidence = process.env["UNLOCK_EVIDENCE"];
const session = reviewBrowserSession(["--single-process", "--no-zygote", "--disable-gpu"]);
let server: ReturnType<typeof Bun.serve>, temporary: string, url: string;
beforeAll(async () => {
  temporary = await mkdtemp(`${tmpdir()}/castle-unlock-backfill-`);
  if (evidence) await mkdir(evidence, { recursive: true });
  server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, `${root}/review-fixtures/unlock-backfill`) });
  url = `http://127.0.0.1:${server.port}/?seed=1593`;
}, 60000);
afterAll(async () => {
  await session.close();
  server?.stop(true);
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

for (const [width, height] of [[390, 844], [1440, 900]]) {
  test(`load, codex and shop backfill independently without repeated celebrations at ${width}`, async () => {
    const page = await session.open(width, height);
    const ready = (condition: string, timeoutMs = 45000) => page.evaluate(`new Promise((resolve,reject)=>{
      const deadline=performance.now()+${timeoutMs};
      function frame(){
        if(${condition})resolve(true);
        else if(performance.now()>deadline)reject(new Error("Timeout: "+${JSON.stringify(condition)}));
        else requestAnimationFrame(frame);
      } frame();
    })`);
    const confirm = async (name: string, counter: string) => {
      await ready("document.querySelector('#result-unlock-modal img')?.complete");
      expect(await page.evaluate("document.querySelector('#result-unlock-name').textContent")).toBe(`${name} 해금`);
      expect(await page.evaluate("document.querySelector('#result-unlock-counter').textContent")).toBe(counter);
      expect(await page.tapElement("#result-unlock-modal button")).toBe(true);
    };
    try {
      await page.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled", 120000);
      const initial = freshMeta(); initial.bph = freshBphSave(88);
      initial.runs = 1; initial.bestSeconds = 60; initial.bossesReached = 1;
      await page.evaluate(`(() => {
        localStorage.setItem('haengju1593-meta', ${JSON.stringify(JSON.stringify(initial))});
        localStorage.setItem('haengju1593-lang', 'ko');
      })()`);
      await page.view.navigate(url);
      await ready("window.unlockMilestones && window.castleSample && document.querySelector('#result-unlock-modal[open]')");
      await confirm("신립", "1/2");
      await confirm("김시민", "2/2");
      expect(await page.evaluate("document.querySelector('#result-unlock-modal')")).toBeNull();
      expect(await page.evaluate("JSON.parse(localStorage.getItem('haengju1593-meta')).bph"))
        .toMatchObject({ unlockedGenerals: ["권율", "신립", "김시민"], rng: 88, totalOpened: 0 });

      await page.evaluate("unlockMilestones.kill()");
      expect(await page.tapElement("#codex-open")).toBe(true);
      await ready("document.querySelector('.bph-codex')");
      await confirm("곽재우", "1/1");
      await page.evaluate("[...document.querySelectorAll('.bph-codex-tabs button')].find(e=>e.textContent==='장수').click()");
      expect(await page.tapElement('[data-codex-key="general:권율"]')).toBe(true);
      expect(await page.evaluate("document.querySelector('.bph-codex-page').textContent")).toContain("처음부터 사용 가능");
      expect(await page.tapElement('[data-codex-key="general:김시민"]')).toBe(true);
      expect(await page.evaluate("document.querySelector('[data-codex-key=\"general:김시민\"]').dataset.discovered")).toBe("true");
      expect(await page.evaluate("document.querySelector('.bph-codex-page').textContent")).toContain("김시민");
      expect(await page.evaluate("document.querySelector('.bph-codex-page').textContent")).toContain("보스 1단계까지 도달 (1/1)");
      expect(await page.evaluate("document.querySelector('.bph-codex-page').textContent.includes('미해금')")).toBe(false);
      if (evidence) await page.shot(`${evidence}/unlocked-codex-${width}.png`);
      expect(await page.tapElement('[data-codex-key="general:황진"]')).toBe(true);
      expect(await page.evaluate("document.querySelector('.bph-codex-page').textContent")).toContain("60/240");
      if (evidence) await page.shot(`${evidence}/backfill-codex-${width}.png`);
      expect(await page.tapElement(".bph-codex-head .bph-back")).toBe(true);
      expect(await page.evaluate("document.querySelector('#result-unlock-modal')")).toBeNull();

      await page.evaluate("unlockMilestones.runs()");
      expect(await page.tapElement("#start")).toBe(true);
      await ready("document.querySelector('.bph-management')");
      await confirm("이순신", "1/1");
      expect(await page.tapElement(".bph-management header .bph-back")).toBe(true);
      expect(await page.evaluate("document.querySelector('#result-unlock-modal')")).toBeNull();
      await page.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      expect(await page.evaluate("document.querySelector('#result-unlock-modal')")).toBeNull();
      expect(await page.evaluate("JSON.parse(localStorage.getItem('haengju1593-meta')).bph"))
        .toMatchObject({ unlockedGenerals: ["권율", "신립", "김시민", "곽재우", "이순신"], rng: 88, totalOpened: 0 });
      expect(page.errors).toEqual([]);
      console.log("BACKFILL_PASS", width, temporary);
    } catch (error) {
      console.error("BACKFILL_CONTEXT", width, page.errors, await page.evaluate(`({
        sample: Boolean(window.castleSample),
        startDisabled: document.querySelector('#start')?.disabled,
        body: document.body.textContent.slice(-1200)
      })`));
      if (evidence) await page.shot(`${evidence}/backfill-failure-${width}.png`);
      throw error;
    } finally { await session.reset(); }
  }, 180000);
}
