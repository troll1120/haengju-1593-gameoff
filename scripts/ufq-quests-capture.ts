import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES, prepareBphUpgrades } from "../src/bph-upgrades";
import { BPH_CODEX_SLOTS } from "../src/bph-codex-data";

await prepareBphUpgrades();
const output = resolve(process.env.UFQ_CAPTURE_DIR ?? "review/ufq/captures");
await mkdir(output, { recursive: true });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, resolve(process.env.UFQ_DIST ?? "gate-out/review-dist")) });
const profile = await mkdtemp(`${tmpdir()}/castle-ufq-quests-`);
const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
const url = `http://127.0.0.1:${server.port}/?seed=7`;
const ready = (condition: string) => phone.evaluate(`new Promise((resolve,reject) => {
  const end=performance.now()+30000;
  function frame() { if (${condition}) return requestAnimationFrame(()=>resolve(true));
    if(performance.now()>end) return reject(new Error(${JSON.stringify(condition)}));
    requestAnimationFrame(frame); } frame();
})`);
const tap = async (selector: string) => assert.equal(await phone.tapElement(selector), true, selector);
const evidence: unknown[] = [];
async function shot(name: string) {
  await phone.evaluate(`Promise.all(document.getAnimations().filter(a =>
    a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished))`);
  const layout = await phone.evaluate(`(() => {
    const selectors=[".bph-web-title",".bph-web-description",".bph-codex-label"];
    return { page:[document.documentElement.scrollWidth,innerWidth],
      text:selectors.flatMap(s=>[...document.querySelectorAll(s)].filter(e=>e.getBoundingClientRect().width)
        .map(e=>({text:e.textContent,width:e.clientWidth,scroll:e.scrollWidth,font:getComputedStyle(e).fontSize}))) };
  })()`);
  await phone.shot(`${output}/${name}.png`);
  evidence.push({ name, layout });
}
try {
  await phone.view.navigate(url);
  for (const lang of ["ko", "en"]) {
    const save = freshBphSave(7);
    save.dimension = 3;
    save.discovered = BPH_CODEX_SLOTS.map(slot => slot.id);
    save.purchasedPlacements = [...BPH_PLACEMENTS.values()].filter(p =>
      p.nodeId && BPH_UPGRADE_NODES[p.nodeId].type !== 4).map(p => p.id);
    const meta = { ...freshMeta(), version: 4, bph: save };
    await phone.evaluate(`(() => { localStorage.setItem("haengju1593-lang",${JSON.stringify(lang)});
      localStorage.setItem("haengju1593-meta",${JSON.stringify(JSON.stringify(meta))}); })()`);
    await phone.view.navigate(url);
    await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
    await tap("#barracks-open");
    await ready("document.querySelector('.bph-web-node')");
    for (const id of ["Q_DefeatSpikedMammoth", "Q_DefeatTroll", "Q_DefeatZombie2",
      "Q_DefeatOgre", "Q_DefeatBeast", "Q_DefeatNiro", "Q_DefeatWitch",
      "Q_DefeatRatlord", "Q_DefeatSpiderQueen", "Q_DefeatFrozenHead"]) {
      const placement = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === id);
      assert(placement, id);
      const selector = `[data-placement="${placement.id}"]`;
      await phone.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center",inline:"center"})`);
      await tap(selector);
      await ready("document.querySelector('.bph-web-detail details[open]')");
      await shot(`${lang}-quest-${id}`);
    }
    await phone.view.navigate(url);
    await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
    await tap("#codex-open");
    await ready("document.querySelector('.bph-codex-tabs')");
    await tap(".bph-codex-tabs button:nth-child(3)");
    await phone.evaluate(`document.querySelector('[data-codex-key="Boss1_Apogre"]').scrollIntoView({block:"start"})`);
    await shot(`${lang}-codex-enemies`);
    await phone.evaluate(`document.querySelector('[data-codex-key="Boss9_Final"]').scrollIntoView({block:"end"})`);
    await tap('[data-codex-key="Boss9_Final"]');
    await ready("document.querySelector('.bph-codex-page .bph-codex-x')");
    await shot(`${lang}-codex-final`);
    // Fresh chapter 1 battle, with no board fixture effects.
    const battleMeta = { ...freshMeta(), firstBattleGuide: true };
    await phone.evaluate(`localStorage.setItem("haengju1593-meta",${JSON.stringify(JSON.stringify(battleMeta))})`);
    await phone.view.navigate(url);
    await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
    await tap("#start");
    await ready("document.querySelector('[data-bph-start]')");
    await tap("[data-bph-start]");
    await passFirstBattleGuide(phone);
    await ready("castleSample.snapshot().time>=18");
    await tap("#pause");
    const battle = await phone.evaluate(`castleSample.snapshot().enemyUnits.map(e=>({id:e.bphProfileId,kind:e.kind,hp:e.hp}))`);
    await tap("#resume");
    await shot(`${lang}-chapter1-variety`);
    evidence.push({ lang, battle });
  }
  await Bun.write(`${output}/evidence.json`, JSON.stringify({ evidence, errors: phone.errors }, null, 2));
  assert.deepEqual(phone.errors, []);
  console.log(`CAPTURES_READY ${output}`);
} finally {
  phone.view.close(); server.stop(true);
  await rm(profile, { recursive: true, force: true });
}
