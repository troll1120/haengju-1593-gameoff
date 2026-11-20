import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { BPH_CODEX_CLASSES } from "../src/bph-codex-page";
import { BPH_PROFILES } from "../src/bph-data";
import { createBphRun } from "../src/bph-session";
import { freshMeta } from "../src/meta";
import { addBphProfile } from "../src/bph-combat";

/** Codex and battle captures of every per-unit sheet and the prism shimmer, from a preview build in review-dist. */
const root = resolve(import.meta.dir, ".."), out = `${root}/out/unit-variants`;
await mkdir(out, { recursive: true });
const profile = await mkdtemp(`${tmpdir()}/castle-unit-variants-`);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, `${root}/review-dist`) });
const page = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
  const end=performance.now()+30000;function frame(){if(${condition})return requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)));
  if(performance.now()>end)return reject(new Error(${JSON.stringify(condition)}));requestAnimationFrame(frame)}frame()})`);
const captures: string[] = [], checks: unknown[] = [];
const FOIL = new Set(["Hero2_Knight", "Hero6_Shotgun", "Hero3_Portal", "Hero9_Supernova"]);
function field(value: unknown, ...keys: readonly (string | number)[]): unknown {
  let result = value;
  for (const key of keys) {
    if (typeof result !== "object" || result === null) throw new Error(`Missing CDP ${key}`);
    result = Reflect.get(result, key);
  }
  return result;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Missing CDP list");
  return value;
}
async function zoom(file: string, clip: { x: number; y: number; width: number; height: number }, scale: number): Promise<void> {
  const shot = await page.view.cdp("Page.captureScreenshot", { format: "png", clip: { ...clip, scale } });
  await Bun.write(file, Buffer.from(String(field(shot, "data")), "base64")); captures.push(file);
}
const settled = `Promise.all([...document.querySelectorAll(".bph-codex-screen img")].filter(i=>i.src).map(i=>i.decode()))`;
async function detail(id: string, file: string): Promise<void> {
  await page.evaluate(`document.querySelector('[data-codex-key="${id}"]').click()`);
  await ready(`document.querySelector(".bph-codex-page")?.dataset.view===${JSON.stringify(id)}`);
  await ready(`[...document.querySelectorAll(".bph-codex-page .bph-codex-prism")].every(i=>i.complete&&i.naturalWidth>0)`);
  await page.evaluate(settled);
  await page.evaluate(`document.querySelector(".bph-codex-evolution").scrollIntoView({block:"center"})`);
  await ready("true");
  await page.shot(file); captures.push(file);
  const box = await page.evaluate(`(()=>{const r=document.querySelector(".bph-codex-evolution").getBoundingClientRect();
    return {x:Math.max(0,r.x-4),y:Math.max(0,r.y-4),width:r.width+8,height:r.height+8}})()`) as { x: number; y: number; width: number; height: number };
  await zoom(file.replace(".png", "-zoom.png"), box, 3);
  checks.push(await page.evaluate(`(()=>({detail:${JSON.stringify(id)},width:innerWidth,
    evolution:[...document.querySelectorAll(".bph-codex-evolution li")].map(li=>({name:li.querySelector("strong").textContent,
      texture:li.querySelector(".bph-codex-art")?.dataset.texture,prism:!!li.querySelector(".bph-codex-prism"),
      animation:li.querySelector(".bph-codex-prism")?getComputedStyle(li.querySelector(".bph-codex-prism")).animationName:null}))}))()`));
}
try {
  await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,timers:true}));` });
  for (const [width, height] of [[390, 844], [1440, 1000]]) {
    await page.view.resize(width, height);
    await page.view.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 390 });
    await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7&codex=all`);
    await ready(`document.querySelector(".bph-codex-card") && !document.querySelector("#app").classList.contains("loading")`);
    for (const [index, classId] of BPH_CODEX_CLASSES.entries()) {
      await page.tapElement(`.bph-codex-classes button:nth-child(${index + 1})`);
      await ready(`document.querySelector(".bph-codex-classes button:nth-child(${index + 1})").getAttribute("aria-selected")==="true"`);
      await page.evaluate(`document.querySelector(".bph-codex-grid").scrollTop=0`);
      await page.evaluate(settled);
      const file = `${out}/codex-${classId}-${width}.png`;
      await page.shot(file); captures.push(file);
      checks.push(await page.evaluate(`(()=>({classId:${JSON.stringify(classId)},width:innerWidth,
        cards:[...document.querySelector(".bph-codex-grid").children].map(card=>({id:card.dataset.codexKey,
          texture:card.querySelector(".bph-codex-art").dataset.texture,
          loaded:[...card.querySelectorAll("img")].every(i=>i.complete&&i.naturalWidth>0)})),
        overflow:document.documentElement.scrollWidth>innerWidth}))()`));
    }
    await page.tapElement(".bph-codex-classes button:nth-child(1)");
    await detail("Hero1_Squire", `${out}/codex-squire-promotions-${width}.png`);
  }
  await page.view.resize(390, 844);
  await page.view.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.view.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7&codex=all`);
  await ready(`document.querySelector(".bph-codex-card") && !document.querySelector("#app").classList.contains("loading")`);
  await detail("Hero_Skeleton", `${out}/codex-summon-promotion-reduced-motion-390.png`);
  await page.view.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });

  await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
  await ready(`window.castleSample && !document.querySelector("#start").disabled`);
  await page.tapElement("#start");
  await ready(`document.querySelector("[data-bph-start]")`);
  await page.tapElement("[data-bph-start]");
  await passFirstBattleGuide(page);
  await ready(`castleSample.snapshot().time>1`);
  const fn = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" });
  const props = await page.view.cdp("Runtime.getProperties", { objectId: field(fn, "result", "objectId") });
  const scopeProperty = list(field(props, "internalProperties")).find(p => field(p, "name") === "[[Scopes]]");
  const scopes = await page.view.cdp("Runtime.getProperties", { objectId: field(scopeProperty, "value", "objectId") });
  let bound = false;
  for (const scope of list(field(scopes, "result"))) {
    if (field(scope, "name") === "length") continue;
    const vars = await page.view.cdp("Runtime.getProperties", { objectId: field(scope, "value", "objectId"), ownProperties: true });
    for (const variable of list(field(vars, "result"))) {
      if (field(variable, "value", "type") !== "object") continue;
      const id = field(variable, "value", "objectId");
      if (!id) continue;
      const result = await page.view.cdp("Runtime.callFunctionOn", { objectId: id, returnByValue: true,
        functionDeclaration: "function(){if(this.scene&&this.scene.getScene&&this.canvas){globalThis.__variantGame=this;return true}return false}" });
      if (field(result, "result", "value") === true) { bound = true; break; }
    }
    if (bound) break;
  }
  if (!bound) throw new Error("Phaser game not found");
  const fixture = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  const ordered = [...Object.values(BPH_PROFILES)].sort((a, b) => BPH_CODEX_CLASSES.indexOf(a.classId) - BPH_CODEX_CLASSES.indexOf(b.classId));
  for (const unit of ordered) addBphProfile(fixture,
    { profileId: unit.id, copies: 1, foil: FOIL.has(unit.id), discovered: false }, { packId: "DeliveryBox", cause: "pack" });
  const render = (label: string, advanceMs: number) => page.evaluate(`(()=>{
    const game=__variantGame,scene=game.scene.getScene("castle"),s=castleSample.snapshot();
    scene.time.now+=${advanceMs};
    const before=JSON.stringify({...s,feedback:undefined});scene.syncTroops({...s,enemies:s.enemyUnits});
    if(before!==JSON.stringify({...s,feedback:undefined}))throw new Error("Rendering changed battle or RNG bytes");
    scene.game.renderer.preRender();scene.game.scene.render(scene.game.renderer);scene.game.renderer.postRender();
    const troopers=scene.troops.flatMap(t=>t.troopers);
    return {render:${JSON.stringify(label)},battleUnchanged:true,
      textures:troopers.map(t=>t.sprite.texture.key),
      prisms:troopers.filter(t=>t.prism?.visible).map(t=>({texture:t.prism.texture.key,frame:t.prism.frame.name,alpha:+t.prism.alpha.toFixed(2)}))};
  })()`);
  await page.evaluate(`(()=>{
    const game=__variantGame,scene=game.scene.getScene("castle"),s=castleSample.snapshot(),q=s.squads[0];
    game.loop.stop();s.enemyUnits.length=0;q.state="guard";q.x=195;q.y=600;
    scene.positions.clear();scene.foes.forEach(sprite=>sprite.setVisible(false));
    q.soldiers=${JSON.stringify(fixture.squads[0].soldiers)}.map((u,i)=>({...u,id:10000+i,x:32+(i%7)*54,y:90+Math.floor(i/7)*46,
      hp:u.maxHp,emerging:false,strikeAt:0,clock:1e9}));
    s.squads.splice(1);scene.troops.forEach(t=>{t.leader.sprite.destroy();t.troopers.forEach(u=>{u.sprite.destroy();u.prism?.destroy()})});
    scene.troops=[scene.muster(q,"")];scene.entered.clear();scene.bars.clear();scene.healthBoxes.length=0;
  })()`);
  checks.push(await render("phase-a", 0));
  await page.shot(`${out}/battle-all-variants-390x844.png`); captures.push(`${out}/battle-all-variants-390x844.png`);
  await zoom(`${out}/battle-zoom-a.png`, { x: 0, y: 60, width: 390, height: 340 }, 3);
  checks.push(await render("phase-b", 3 * 140));
  await zoom(`${out}/battle-zoom-b.png`, { x: 0, y: 60, width: 390, height: 340 }, 3);
  if (page.errors.length) throw new Error(JSON.stringify(page.errors));
  await Bun.write(`${out}/captures.json`, JSON.stringify({ captures, checks, errors: page.errors }, null, 2));
  console.log(`UNIT_VARIANT_CAPTURES_PASS ${captures.length} captures ${out}`);
} finally {
  page.view.close(); server.stop(true); await rm(profile, { recursive: true, force: true });
}
