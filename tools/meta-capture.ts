// Real Chromium touch flow. Run against this checkout's Vite server.
import { launch, sleep } from "../scripts/review-browser";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const out = process.argv[2] ?? "out/meta-shots";
await mkdir(out, { recursive: true });
const profile = await mkdtemp(`${tmpdir()}/castle-meta-touch-`);
const phone = await launch("http://127.0.0.1:19506/?seed=144", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
async function until(expression: string, budget = 15000): Promise<void> {
  const deadline = Date.now() + budget;
  while (!await phone.evaluate(expression)) {
    if (Date.now() > deadline) throw new Error(`Touch flow timed out: ${expression}`);
    await sleep(100);
  }
}
async function playUntil(expression: string): Promise<void> {
  const deadline = Date.now() + 240000;
  while (!await phone.evaluate(expression)) {
    if (Date.now() > deadline) throw new Error("Fresh touch run exceeded four minutes");
    if (await phone.evaluate(`!document.querySelector("#choice").hidden && !!document.querySelector("#cards .card:not(.spinning)")`))
      await phone.tapElement("#cards .card:not(.spinning)");
    if (await phone.evaluate(`!!document.querySelector("#skills .skill.ready")`)) await phone.tapElement("#skills .skill.ready");
    await sleep(120);
  }
}
try {
  await until("Boolean(window.castleSample)");
  await phone.tapElement("#start"); await phone.tapElement("#story");
  await phone.tapElement('[data-start-general="권율"]');
  await until(`castleSample.snapshot().time > 0`);
  await playUntil(`castleSample.snapshot().phase === "lost"`);
  await until(`!document.querySelector("#result").hidden`);
  await until(`document.querySelector("#result-flip").classList.contains("revealed") && !document.querySelector("#result-flip").classList.contains("hailing")`);
  await phone.shot(`${out}/result.png`);
  const result = await phone.evaluate(`({seconds:castleSample.snapshot().time,phase:castleSample.snapshot().phase,cards:castleSample.snapshot().metrics.cards,skills:castleSample.snapshot().metrics.skills,meta:JSON.parse(localStorage.getItem("haengju1593-meta"))})`);
  await phone.tapElement("#result-upgrade");
  await phone.shot(`${out}/tree.png`);
  await phone.tapElement('[data-node="troops8"]');
  await phone.shot(`${out}/purchase-before.png`);
  if (!await phone.tapElement("#tree-purchase")) throw new Error("Purchase strip is not touchable");
  await phone.shot(`${out}/purchase.png`);
  const purchase = await phone.evaluate(`JSON.parse(localStorage.getItem("haengju1593-meta"))`);
  await phone.evaluate(`document.querySelector("#barracks-play").scrollIntoView({block:"center"})`);
  await phone.tapElement("#barracks-play");
  await playUntil(`castleSample.snapshot().squads.reduce((n,s)=>n+s.soldiers.length,0)>4 || castleSample.snapshot().phase === "lost"`);
  const next = await phone.evaluate(`({phase:castleSample.snapshot().phase,seconds:castleSample.snapshot().time,troops:castleSample.snapshot().squads.reduce((n,s)=>n+s.soldiers.length,0),caps:castleSample.snapshot().meta.caps})`);
  await phone.shot(`${out}/next-run.png`);
  const layout = await phone.evaluate(`({width:innerWidth,scrollWidth:document.scrollingElement.scrollWidth})`);
  await phone.view.navigate("http://127.0.0.1:19506/?seed=144");
  await until("Boolean(window.castleSample)");
  await phone.tapElement("#barracks-open");
  const branches = [];
  for (let index = 1; index <= 9; index++) {
    const selector = `.tree-branch:nth-child(${index})`;
    await phone.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center"})`);
    await phone.tapElement(selector);
    branches.push(await phone.evaluate(`({name:document.querySelector(".tree-heading h1").textContent,overflow:document.querySelector("#barracks").scrollWidth>document.querySelector("#barracks").clientWidth,smallTargets:[...document.querySelectorAll(".tree-node")].filter(e=>{const r=e.getBoundingClientRect();return r.width<44||r.height<44}).length})`));
    await phone.evaluate(`document.querySelector(".tree-nav button").scrollIntoView({block:"center"})`);
    await phone.tapElement(".tree-nav button");
  }
  await phone.view.cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await phone.view.navigate("http://127.0.0.1:19506/?seed=144");
  await until("Boolean(window.castleSample)");
  await phone.tapElement("#barracks-open");
  await phone.shot(`${out}/tree-desktop.png`);
  const desktop = await phone.evaluate(`({width:innerWidth,scrollWidth:document.scrollingElement.scrollWidth})`);
  await Bun.write(`${out}/touch.json`, JSON.stringify({ result, purchase, next, layout, branches, desktop, errors: phone.errors }, null, 2));
  console.log("CAPTURE_DONE " + JSON.stringify({ result, purchase, next, layout, branches, desktop, errors: phone.errors }));
} finally {
  phone.view.close(); await rm(profile, { recursive: true });
}
