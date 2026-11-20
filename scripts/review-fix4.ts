import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { BPH_GENERALS } from "../src/bph-commanders";
import { BPH_PROFILES } from "../src/bph-data";
import { BPH_UPGRADE_NODES } from "../src/bph-upgrade-data";
import { upgradeName, upgradeDescription } from "../src/bph-upgrade-presentation";

const out = process.env.FIX4_OUT ?? resolve(import.meta.dir, "../review/p10/fix4");
await mkdir(out, { recursive: true });
const profile = await mkdtemp(`${tmpdir()}/castle-fix4-`);
const server = process.env.FIX4_URL ? undefined : Bun.serve({ hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, resolve(import.meta.dir, "../review-dist")) });
const url = process.env.FIX4_URL ?? `http://127.0.0.1:${server?.port}/`;
const phone = await launch(url, profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
  const end=performance.now()+30000;
  const check=()=>{if(${expression})resolve(true);else if(performance.now()>end)reject(new Error("UI state timeout"));else requestAnimationFrame(check)};check();
})`);
try {
  await ready("window.castleSample && document.querySelector('#start')");
  const meta = freshMeta(), save = freshBphSave();
  save.unlockedGenerals = [...BPH_GENERALS];
  save.discovered = Object.keys(BPH_PROFILES);
  meta.bph = save;
  await phone.evaluate(`(() => {localStorage.setItem("haengju1593-meta",${JSON.stringify(JSON.stringify(meta))});location.reload()})()`);
  await ready("window.castleSample && document.querySelector('#start')");
  await phone.tapElement("#start");
  await ready("document.querySelector('[data-bph-start]')");
  await phone.tapElement('[aria-label="신립 선택"]');
  await phone.tapElement("[data-bph-start]");
  await passFirstBattleGuide(phone);
  await ready("castleSample.snapshot().enemyUnits?.length > 0");
  const fixture = await phone.evaluate(`(() => {
    const s=castleSample.snapshot(), leader=s.squads[0], enemy=s.enemyUnits[0];
    leader.x=110;leader.y=390;leader.hp=99999;leader.maxHp=99999;leader.safeUntil=99999;
    leader.soldiers=[{
      id:900,kind:"ming_cavalry",tier:1,hp:99999,maxHp:99999,x:135,y:510,
      clock:0,strikeAt:-999,aim:0,downUntil:0,emerging:false,
      bph:{profileId:"Hero5_Dino",birthProfileId:"Hero5_Dino",packId:"DeliveryBox",foil:false,giant:false,kills:0,stage:0,resultId:null,parentId:null,lifeId:1,cause:"pack"}
    }];
    s.enemyUnits.splice(0,s.enemyUnits.length,{...enemy,id:999,kind:"cavalry",boss:false,elite:false,
      bossArt:undefined,x:300,y:510,hp:99999,maxHp:99999,ladder:false,pattern:undefined});
    return {time:s.time,ally:leader.soldiers[0],enemy:s.enemyUnits[0]};
  })()`);
  await phone.evaluate(`new Promise(resolve => {
    const end=castleSample.snapshot().time+0.3;
    const check=()=>{if(castleSample.snapshot().time>end)resolve(true);else requestAnimationFrame(check)};check();
  })`);
  await phone.shot(`${out}/public-cavalry-390x844.png`);
  const nodes = Object.values(BPH_UPGRADE_NODES).map(node => ({
    id: node.id, name: upgradeName(node), description: upgradeDescription(node),
  }));
  await Bun.write(`${out}/node-text.json`, JSON.stringify(nodes, null, 2));
  await Bun.write(`${out}/capture-evidence.json`, JSON.stringify({ url, viewport: [390, 844], fixture, errors: phone.errors }, null, 2));
  if (phone.errors.length) throw new Error(phone.errors.join("\n"));
  console.log("CAPTURE_EXIT=0");
} finally {
  phone.view.close();
  server?.stop(true);
  await rm(profile, { recursive: true });
}
