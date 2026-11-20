import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { BPH_GENERALS } from "../src/bph-commanders";

// Display fixture: unlock all commanders with zero purchases. Not progression evidence.
const output = resolve(process.argv[2] ?? "review/skill-growth-copy");
const variant = process.argv[3] ?? "after";
await mkdir(output, { recursive: true });
const save = freshBphSave();
save.unlockedGenerals = [...BPH_GENERALS];
const fixture = { ...freshMeta(), version: 4, bph: save };
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, resolve("dist")),
});
const records: unknown[] = [];
try {
  for (const lang of ["ko", "en"]) {
    const profile = `${output}/profile-${variant}-${lang}`;
    const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const ready = async (condition: string) => {
      await phone.evaluate(`new Promise((resolve, reject) => {
        const deadline = performance.now() + 20000;
        function check() {
          if (${condition}) resolve(true);
          else if (performance.now() > deadline) reject(new Error(${JSON.stringify(condition)}));
          else requestAnimationFrame(check);
        } check();
      })`);
    };
    const capture = async (name: string, selector: string) => {
      await ready(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      await phone.evaluate(`Promise.all(document.getAnimations().filter(a =>
        a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished))`);
      const info = await phone.evaluate(`(() => {
        const hint = document.querySelector(${JSON.stringify(selector)});
        const r = hint.getBoundingClientRect();
        const controls = [...document.querySelectorAll(".bph-management header button, .bph-commanders button, .bph-actions button, [data-bph-start]")];
        return { text: hint.textContent, viewport: [innerWidth, innerHeight],
          hint: { x:r.x, y:r.y, width:r.width, height:r.height,
            scrollWidth:hint.scrollWidth, clientWidth:hint.clientWidth,
            scrollHeight:hint.scrollHeight, clientHeight:hint.clientHeight },
          visible: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          controls: controls.map(e => { const b=e.getBoundingClientRect();
            return {label:e.getAttribute("aria-label") || e.textContent,x:b.x,y:b.y,width:b.width,height:b.height}; }) };
      })()`);
      await phone.shot(`${output}/${variant}-${lang}-${name}-390x844.png`);
      records.push({ lang, name, info, errors: [...phone.errors] });
      console.log(`CAPTURE ${variant}-${lang}-${name} ${JSON.stringify(info)}`);
    };
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      await phone.view.navigate(url);
      await ready("Boolean(window.castleSample)");
      await phone.evaluate(`(() => {
        localStorage.setItem("haengju1593-lang", ${JSON.stringify(lang)});
        localStorage.setItem("haengju1593-meta", ${JSON.stringify(JSON.stringify(fixture))});
        return true;
      })()`);
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      if (!await phone.tapElement("#start")) throw new Error("Start missing");
      await ready('Boolean(document.querySelector(".bph-commanders button"))');
      for (const [index] of BPH_GENERALS.entries()) {
        const commander = `.bph-commanders button:nth-child(${index + 1})`;
        if (!await phone.tapElement(commander)) throw new Error("Commander missing");
        await capture(`general-${index}-preparation`, ".bph-management-body > .skill-growth-line");
        if (!await phone.tapElement(".bph-actions button")) throw new Error("Upgrade missing");
        await ready('Boolean(document.querySelector(".bph-web-effect"))');
        if (!await phone.tapElement(".bph-web-effect")) throw new Error("Upgrade detail missing");
        await capture(`general-${index}-upgrade-detail`, ".bph-web-detail .skill-growth-line");
        if (!await phone.tapElement('.bph-actions button[aria-pressed="true"]')) throw new Error("Back missing");
        await ready('!document.querySelector(".bph-web")');
      }
    } finally {
      phone.view.close();
      await rm(profile, { recursive: true, force: true });
    }
  }
  await Bun.write(`${output}/${variant}-manifest.json`, JSON.stringify({
    fixture: "All eight commanders unlocked in saved state; zero purchases. Display fixture, not natural progression.",
    browser: "scripts/review-browser.ts; dedicated profile; --disable-frame-rate-limit",
    records,
  }, null, 2));
  console.log("SKILL_GROWTH_CAPTURE_COMPLETE");
} finally {
  server.stop(true);
}
