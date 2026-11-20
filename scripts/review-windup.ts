import { mkdir } from "node:fs/promises";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { soldier } from "../src/rules";
import { PALETTE } from "../src/presentation";

const [label = "before", build = "/tmp/castle-windup-before"] = Bun.argv.slice(2);
const out = `/tmp/castle-windup-evidence/${label}`;
await mkdir(out, { recursive: true });
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: request => previewResponse(request, build) });
function at(value: unknown, ...keys: readonly (string | number)[]): unknown {
  let result = value;
  for (const key of keys) {
    if (typeof result !== "object" || result === null) throw new Error(`Missing ${key}`);
    result = Reflect.get(result, key);
  }
  return result;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Missing CDP list");
  return value;
}
try {
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const page = await launch("about:blank", `${out}/profile-${width}`, width, height);
    const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
      const end=performance.now()+30000;function check(){if(${condition})return resolve(true);
      if(performance.now()>end)return reject(new Error(${JSON.stringify(condition)}));requestAnimationFrame(check)}check()})`);
    try {
      await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,timers:true}));` });
      await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      await page.tapElement("#start");
      if (label === "old") {
        if (await page.rect("#story")) await page.tapElement("#story");
        await ready("document.querySelector('[data-start-general]')");
        await page.tapElement('[data-start-general="권율"]');
      } else {
        await ready("document.querySelector('[data-bph-start]')");
        await page.tapElement("[data-bph-start]");
      }
      await passFirstBattleGuide(page);
      await ready("castleSample.snapshot().time>2");
      const fn = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" });
      const props = await page.view.cdp("Runtime.getProperties", { objectId: at(fn, "result", "objectId") });
      const scopesProperty = list(at(props, "internalProperties")).find(p => at(p, "name") === "[[Scopes]]");
      const scopes = await page.view.cdp("Runtime.getProperties", { objectId: at(scopesProperty, "value", "objectId") });
      let bound = false;
      for (const scope of list(at(scopes, "result"))) {
        if (at(scope, "name") === "length") continue;
        const vars = await page.view.cdp("Runtime.getProperties", { objectId: at(scope, "value", "objectId"), ownProperties: true });
        for (const variable of list(at(vars, "result"))) {
          if (at(variable, "value", "type") !== "object") continue;
          const id = at(variable, "value", "objectId");
          if (!id) continue;
          const result = await page.view.cdp("Runtime.callFunctionOn", { objectId: id, returnByValue: true,
            functionDeclaration: "function(){if(this.scene&&this.scene.getScene&&this.canvas){globalThis.__windupGame=this;return true}return false}" });
          if (at(result, "result", "value") === true) { bound = true; break; }
        }
        if (bound) break;
      }
      if (!bound) throw new Error("Phaser game not found");
      const fixture = (["spearman", "archer", "hwacha", "monk", "ming_cavalry", "panokseon"] as const)
        .filter(kind => label !== "old" || kind !== "panokseon").map(kind => soldier(kind));
      await page.evaluate(`(()=>{
        const game=__windupGame,scene=game.scene.getScene("castle"),s=castleSample.snapshot(),q=s.squads[0];
        game.loop.stop();window.__windupScene=scene;window.__windupRun=s;
        s.enemies=[];s.enemyUnits=[];s.time=10;q.state="guard";q.x=195;q.y=160;q.hp=q.maxHp*.7;
        scene.positions.clear();if(scene.heads)scene.heads.clear();scene.foes.forEach(sprite=>sprite.setVisible(false));
        q.soldiers=${JSON.stringify(fixture)}.map((u,i)=>({...u,id:10000+i,x:65+(i%3)*130,y:260+Math.floor(i/3)*340,
          hp:u.maxHp*.7,emerging:false,clock:.6,strikeAt:11}));
        q.strikeAt=11;q.clock=.6;s.squads.splice(1);
        scene.troops.forEach(t=>{t.leader.sprite.destroy();t.troopers.forEach(u=>u.sprite.destroy())});
        scene.troops=[scene.muster(q,"")];scene.entered.clear();
        [scene.troops[0].leader,...scene.troops[0].troopers].forEach(t=>t.windFor=1000);
        window.__draws=[];let paint=0;
        const style=scene.bars.fillStyle.bind(scene.bars),rect=scene.bars.fillRect.bind(scene.bars);
        scene.bars.fillStyle=function(color,...args){paint=color;return style(color,...args)};
        scene.bars.fillRect=function(x,y,w,h){__draws.push({paint,x,y,w,h});return rect(x,y,w,h)};
      })()`);
      const states = [];
      for (const progress of [0, .5, 1, -1]) {
        const state = await page.evaluate(`(()=>{
          const scene=__windupScene,s=__windupRun,q=s.squads[0];
          s.time=${progress < 0 ? 11.1 : 10 + progress};
          q.strikeAt=${progress < 0 ? 0 : 11};
          q.soldiers.forEach(u=>u.strikeAt=q.strikeAt);
          scene.bars.clear();if(scene.healthBoxes)scene.healthBoxes.length=0;__draws.length=0;
          const combat=JSON.stringify({...s,feedback:undefined});
          scene.syncTroops(s);
          if(JSON.stringify({...s,feedback:undefined})!==combat)throw new Error("Drawing changed combat state or RNG");
          scene.game.renderer.preRender();scene.game.scene.render(scene.game.renderer);scene.game.renderer.postRender();
          return {progress:${progress},gold:__draws.filter(d=>d.paint===${PALETTE.gold}),draws:__draws,boxes:scene.healthBoxes};
        })()`);
        states.push(state);
        await page.shot(`${out}/${width}x${height}-${progress}.png`);
      }
      await Bun.write(`${out}/${width}x${height}.json`, JSON.stringify({ states, errors: page.errors }, null, 2));
      if (label === "after" || label === "red") {
        const gold = states.map(s => at(s, "gold"));
        if (list(gold[0]).length !== 7 || list(gold[1]).length !== 7 || list(gold[2]).length !== 7 || list(gold[3]).length !== 0)
          throw new Error("Windup bars must exist for all seven units and hide after release");
        for (let i = 0; i < 7; i++) {
          const widths = gold.slice(0, 3).map(g => at(list(g)[i], "w"));
          if (widths[0] !== 0 || typeof widths[1] !== "number" || typeof widths[2] !== "number" || widths[1] <= 0 || widths[2] !== 2 * widths[1])
            throw new Error(`Unit ${i} did not fill 0 -> .5 -> 1`);
        }
      }
      console.log(`CAPTURE_PASS ${label} ${width}x${height}`);
    } finally { page.view.close(); }
  }
} finally { server.stop(true); }
