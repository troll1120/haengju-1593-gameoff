// Captures the title settings panel in both languages at the review sizes: bun scripts/capture-settings-close.ts <out-dir> [tag]
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { previewResponse } from "./serve";

const out = resolve(process.argv[2] ?? "review/settings-close-1117");
const tag = process.argv[3] ?? "after";
const dist = process.env.CASTLE_TEST_DIST ?? resolve(import.meta.dir, "../review-dist");
// 390x800 is the phone hub: the mode iframe fills everything under the hub's 44px bar; 405x720 is the itch embed.
const sizes: [number, number][] = (process.env.CASTLE_SIZES ?? "390x844 405x720 1440x900 390x800").split(" ")
  .map(size => size.split("x").map(Number) as [number, number]);
await mkdir(out, { recursive: true });
const server = process.env.CASTLE_TEST_URL ? null : Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, dist) });
const url = process.env.CASTLE_TEST_URL ?? `http://127.0.0.1:${server!.port}/?seed=7`;
const report: Record<string, unknown>[] = [];
try {
  for (const [width, height] of sizes) {
    const profile = await mkdtemp(`${tmpdir()}/castle-close-`);
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const ready = (condition: string) => phone.evaluate(`new Promise((resolve,reject)=>{
      const end=performance.now()+30000;
      function check(){ if(${condition}) return requestAnimationFrame(()=>resolve(true));
        if(performance.now()>end) return reject(new Error("timeout: "+${JSON.stringify(condition)}));
        requestAnimationFrame(check); } check(); })`);
    const settled = async () => {
      await phone.evaluate("document.fonts.ready.then(() => true)");
      await ready(`!document.getAnimations().some(a => a.effect.getComputedTiming().iterations !== Infinity && (a.pending || a.playState === "running"))`);
    };
    try {
      for (const lang of ["ko", "en"]) {
        await phone.view.navigate(url);
        await phone.evaluate(`localStorage.setItem("haengju1593-lang", ${JSON.stringify(lang)})`);
        await phone.view.navigate(url);
        await ready("window.castleSample && !document.querySelector('#start').disabled");
        if (!await phone.tapElement("#title-settings")) throw new Error("settings button unreachable");
        await ready("!document.querySelector('#intro').hidden");
        await settled();
        const name = `${tag}-${width}x${height}-${lang}`;
        await phone.shot(`${out}/${name}.png`);
        const boxes = await phone.evaluate(`(() => {
          const box = s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); };
          return { intro: box('#intro'), close: box('#settings-close'), menu: box('#intro .menu'),
            tiles: [...document.querySelectorAll('#intro .menu button')].filter(e => !e.hidden).map(e => [e.id, ...box('#' + e.id)]),
            rows: ['bgm', 'sfx'].map(bus => ({ label: box('[for="volume-' + bus + '"]'), input: box('#volume-' + bus), output: box('#volume-' + bus + '-value') })) };
        })()`);
        report.push({ name, boxes, errors: phone.errors });
        console.log(name, JSON.stringify(boxes));
      }
    } finally {
      phone.view.close(); await rm(profile, { recursive: true, force: true });
    }
  }
  await Bun.write(`${out}/${tag}-boxes.json`, JSON.stringify(report, null, 1));
} finally { server?.stop(true); }
