import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { BPH_GENERALS } from "../src/bph-commanders";
import { BPH_PROFILES } from "../src/bph-data";
import installed from "../review/p10/art-wire/installed-assets.json";

const root = resolve(import.meta.dir, ".."), out = `${root}/review/p10/art-wire`;
await mkdir(out, { recursive: true });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, `${root}/review-dist`) });
const profile = await mkdtemp(`${tmpdir()}/castle-art-wire-`);
const phone = await launch(`http://127.0.0.1:${server.port}/?seed=144`, profile, 390, 844,
  ["--single-process", "--no-zygote", "--disable-gpu"]);
const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
  const end = performance.now() + 30000;
  const check = () => { if (${expression}) resolve(true); else if (performance.now() > end) reject(new Error("UI state timeout")); else requestAnimationFrame(check); }; check();
})`);
const evidence: unknown[] = [];
const painted = () => phone.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
try {
  await ready("window.castleSample && document.querySelector('#start')");
  const meta = freshMeta(), save = freshBphSave();
  save.unlockedGenerals = [...BPH_GENERALS];
  save.discovered = Object.keys(BPH_PROFILES);
  meta.bph = save;
  await phone.evaluate(`(() => { localStorage.setItem("haengju1593-meta", ${JSON.stringify(JSON.stringify(meta))}); location.reload(); })()`);
  await ready("window.castleSample && document.querySelector('#start')");
  await phone.tapElement("#start");
  await ready("document.querySelector('[data-bph-start]')");
  await phone.shot(`${out}/lobby-390x844.png`);
  evidence.push(await phone.evaluate(`Array.from(document.querySelectorAll('.bph-commander img')).map(i=>({src:i.src,loaded:i.complete&&i.naturalWidth>0}))`));
  await phone.evaluate(`Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="도감").click()`);
  await ready("document.querySelector('.bph-codex-slot')");
  for (const [id, file] of [["Hero1_Peasant", "uibyeong"], ["Hero6_Shotgun", "chongtong"], ["Hero4_Knight", "ming_cavalry"]]) {
    const selector = `[data-slot-id="${id}"]`;
    const found = await phone.evaluate(`(() => {
      let e=document.querySelector(${JSON.stringify(selector)});
      if (!e) e=Array.from(document.querySelectorAll('.bph-codex-slot')).find(e=>e.querySelector('img')?.src.includes('/${file}.png'));
      if (!e) throw new Error("Missing class ${file}");
      e.scrollIntoView({block:"center"}); return {id:e.dataset.slotId,src:e.querySelector('img').src};
    })()`);
    await painted(); await phone.shot(`${out}/codex-${file}-390x844.png`); evidence.push(found);
  }
  await phone.evaluate(`Array.from(document.querySelectorAll(".bph-codex nav button")).find(b=>b.textContent==="장수").click()`);
  await painted(); await phone.shot(`${out}/codex-generals-390x844.png`);
  await phone.evaluate(`document.querySelector(".bph-codex-body").scrollTop=9999`);
  await painted(); await phone.shot(`${out}/codex-generals-bottom-390x844.png`);
  await phone.evaluate(`document.querySelector(".bph-codex header button").click()`);
  await phone.tapElement('[aria-label="사명대사 선택"]');
  await phone.tapElement("[data-bph-start]");
  await passFirstBattleGuide(phone);
  await ready("castleSample.snapshot().time > 2");
  await phone.shot(`${out}/battle-samyeong-390x844.png`);
  // Exercise the retained roster and every approved class through the actual scene renderer.
  evidence.push(await phone.evaluate(`(() => {
    const s=castleSample.snapshot(), original=s.squads[0];
    const names=["사명대사","이순신","김시민","황진","신각","김여물"];
    s.squads.splice(0,s.squads.length,...names.map((general,i)=>({
      ...original, id:i, general, x:65+(i%3)*130, y:220+Math.floor(i/3)*320,
      soldiers:[], state:"ready", hp:99999, maxHp:99999, safeUntil:9999
    })));
    return {fixture:"art-only retained roster",names};
  })()`));
  await ready("castleSample.snapshot().squads.length === 6");
  await painted(); await phone.shot(`${out}/battle-all-generals-390x844.png`);
  const classProfiles = ["militia", "chongtong", "joseon_cavalry"].map(kind =>
    Object.values(BPH_PROFILES).find(p => p.classId === kind)?.id);
  await phone.evaluate(`(() => {
    const s=castleSample.snapshot(), leader=s.squads[0];
    leader.soldiers=${JSON.stringify(classProfiles)}.map((profileId,i)=>({
      id:900+i,kind:["spearman","hwacha","ming_cavalry"][i],tier:1,hp:10,maxHp:10,
      x:90+i*95,y:530,clock:0,strikeAt:0,aim:0,downUntil:0,emerging:false,
      bph:{profileId,birthProfileId:profileId,packId:"DeliveryBox",foil:false,giant:false,kills:0,stage:0,resultId:null,parentId:null,lifeId:1,cause:"pack"}
    }));
    s.bph.receipts.push({id:901,packId:"DeliveryBox",ordinal:1,cards:[{profileId:${JSON.stringify(classProfiles[0])},copies:1,foil:false,discovered:true}],frenzy:false,reason:"opening"});
  })()`);
  await ready("document.querySelector('.bph-receipt img')?.src.includes('uibyeong')");
  await phone.shot(`${out}/battle-classes-recruit-390x844.png`);
  for (const [classId, file] of [["chongtong", "chongtong"], ["joseon_cavalry", "ming_cavalry"]]) {
    const profileId = Object.values(BPH_PROFILES).find(p => p.classId === classId)?.id;
    await phone.evaluate(`(() => {
      const s=castleSample.snapshot(); s.bph.receipts.splice(0,s.bph.receipts.length,{
        id:${file === "chongtong" ? 902 : 903},packId:"DeliveryBox",ordinal:1,
        cards:[{profileId:${JSON.stringify(profileId)},copies:1,foil:false,discovered:true}],
        frenzy:false,reason:"opening"});
    })()`);
    await ready(`document.querySelector('.bph-receipt img')?.src.includes('${file}')`);
    await phone.shot(`${out}/recruit-${file}-390x844.png`);
  }
  await ready("castleSample.snapshot().enemyUnits.length > 0");
  await phone.evaluate(`(() => {
    const s=castleSample.snapshot(), enemy=s.enemyUnits[0];
    if (!enemy) throw new Error("Missing enemy fixture");
    s.enemyUnits.push({...enemy,id:999,kind:"cavalry",boss:false,elite:false,bossArt:undefined,
      x:190,y:610,hp:999,maxHp:999,ladder:false});
  })()`);
  await painted(); await phone.shot(`${out}/battle-cavalry-390x844.png`);
  for (const asset of installed.assets) {
    const response = await fetch(`http://127.0.0.1:${server.port}/art/units/${asset.id}.png`);
    const hash = new Bun.CryptoHasher("sha256").update(await response.bytes()).digest("hex");
    if (hash !== asset.sha256) throw new Error(`Old asset resolves: ${asset.id}`);
    evidence.push({ id: asset.id, resolvedSha256: hash, status: response.status });
  }
  evidence.push({ errors: phone.errors });
  await Bun.write(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2));
  if (phone.errors.length) throw new Error(phone.errors.join("\n"));
  console.log("ART_CAPTURE_EXIT=0");
} finally {
  phone.view.close(); server.stop(true); await rm(profile, { recursive: true });
}
