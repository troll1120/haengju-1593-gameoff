import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, sleep, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { BPH_UPGRADE_NODES } from "../src/bph-upgrade-data";
import { upgradeName, upgradeDescription } from "../src/bph-upgrade-presentation";

const out = resolve(import.meta.dir, "../review/p10/fix3");
await mkdir(out, { recursive: true });
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, resolve(import.meta.dir, "../review-dist")),
});
const profile = await mkdtemp(`${tmpdir()}/castle-fix3-`);
const phone = await launch(`http://127.0.0.1:${server.port}/?seed=144`, profile, 390, 844,
  ["--single-process", "--no-zygote", "--disable-gpu"]);
const until = async (expression: string) => {
  const deadline = Date.now() + 30000;
  while (!await phone.evaluate(expression)) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${expression}`);
    await sleep(50);
  }
};
const samples: unknown[] = [], inputs: unknown[] = [];
try {
  await until("Boolean(window.castleSample)");
  await phone.tapElement("#start");
  await until("Boolean(document.querySelector('[data-bph-start]'))");
  await phone.shot(`${out}/after-lobby.png`);
  await phone.evaluate(`Array.from(document.querySelectorAll("button")).find(b => b.textContent === "강화망").click()`);
  await until("Boolean(document.querySelector('.bph-web-node'))");
  await phone.shot(`${out}/after-upgrade-fresh.png`);
  const freshNodes = await phone.evaluate(`Array.from(document.querySelectorAll(".bph-web-node")).map(e=>e.getAttribute("aria-label"))`);
  await phone.evaluate(`document.querySelector(".bph-web-map").scrollTop += 600`);
  await phone.shot(`${out}/after-upgrade-fresh-pan.png`);
  await phone.evaluate(`Array.from(document.querySelectorAll("button")).find(b => b.textContent === "닫기").click()`);
  await phone.tapElement("[data-bph-start]");
  await passFirstBattleGuide(phone);
  await until("castleSample.snapshot().time > 0");
  await phone.shot(`${out}/after-battle.png`);
  const layout = await phone.evaluate(`(() => {
    const entries = [...document.querySelectorAll("#app button")].map(e => {
      const r = e.getBoundingClientRect();
      return { id: e.id || e.className, x:r.x, y:r.y, right:r.right, bottom:r.bottom, w:r.width, h:r.height };
    }).filter(r=>r.w && r.h);
    return {entries, overlaps: entries.flatMap((a,i)=>entries.slice(i+1).filter(b=>a.x<b.right && b.x<a.right && a.y<b.bottom && b.y<a.bottom).map(b=>[a.id,b.id]))};
  })()`);
  await phone.tapElement(".bph-recruit-strip > .bph-recruit-cell");
  inputs.push({ action: "recruit", time: await phone.evaluate("castleSample.snapshot().time") });
  await until(`document.querySelector(".bph-receipt:not(.bph-hire-reveal)") && !document.querySelector(".bph-receipt:not(.bph-hire-reveal)").hidden`);
  await phone.shot(`${out}/after-recruit.png`);
  await until(`document.querySelector(".bph-receipt:not(.bph-hire-reveal):is(.bph-cracking,.bph-landed)")`);
  if (await phone.evaluate(`Boolean(document.querySelector(".bph-receipt:not(.bph-hire-reveal).bph-cracking"))`)) {
    for (let hit = 0; hit < 3; hit++) await phone.tapElement(".bph-receipt:not(.bph-hire-reveal) .bph-reveal-art");
  }
  await phone.tapElement(".bph-receipt:not(.bph-hire-reveal) .bph-reveal-art");
  let lastSample = -1, nextShot = 20;
  const deadline = Date.now() + 240000;
  for (;;) {
    const state = await phone.evaluate(`(() => { const s=castleSample.snapshot(); return {
      time:s.time,phase:s.phase,kills:s.kills,wall:s.wall,fort:s.fort,gold:s.gold,
      skills:s.metrics.skills,ready:document.querySelector("#skills button")?.classList.contains("ready"),
      fresh:s.bph.save.purchasedPlacements.length
    }; })()`);
    if (!state || typeof state !== "object" || !("time" in state) || typeof state.time !== "number") throw new Error("Invalid snapshot");
    if (state.time >= lastSample + 1) { samples.push(state); lastSample = state.time; }
    if (state.time >= nextShot) { await phone.shot(`${out}/run-${nextShot}.png`); nextShot += 20; }
    if ("phase" in state && (state.phase === "lost" || state.phase === "won")) {
      await phone.shot(`${out}/run-result.png`);
      await Bun.write(`${out}/run1.json`, JSON.stringify({
        policy: "Fresh save, seed 144, recruit once at start, touch ready skill every 0.75 s; no injected save or battle state; normal speed",
        state, inputs, samples, freshNodes, layout, errors: phone.errors,
      }, null, 2));
      console.log(`RUN_RESULT ${JSON.stringify(state)}`);
      break;
    }
    if (Date.now() > deadline) throw new Error("Run did not end within four minutes");
    if ("ready" in state && state.ready) {
      await phone.tapElement("#skills button");
      inputs.push({ action: "skill", time: state.time });
    }
    await sleep(750);
  }
  await Bun.write(`${out}/node-text.json`, JSON.stringify(Object.values(BPH_UPGRADE_NODES).map(n => ({
    id:n.id,name:upgradeName(n),description:upgradeDescription(n),
  })), null, 2));
  if (phone.errors.length) throw new Error(phone.errors.join("\n"));
} finally {
  phone.view.close(); server.stop(true); await rm(profile, { recursive: true });
}
