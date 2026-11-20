import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chaosArena, chaosEnemy } from "../src/chaos-test-fixture";
import { advance } from "../src/rules";
import { passFirstBattleGuide, reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";

const out = resolve(Bun.argv[2] ?? "/tmp/general-body-bow-evidence");
await mkdir(out, { recursive: true });
const server = Bun.serve({ port: 0, hostname: "127.0.0.1",
  fetch: request => previewResponse(request, resolve("dist")) });
const browser = reviewBrowserSession();
function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) throw new Error(`Missing ${key}`);
  return Reflect.get(value, key);
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected CDP list");
  return value;
}
try {
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const page = await browser.open(width, height);
    await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", {
      source: 'localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,timers:true}));',
    });
    await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
    const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
      const end=performance.now()+30000;function check(){if(${condition})return resolve(true);
      if(performance.now()>end)return reject(new Error(${JSON.stringify(condition)}));requestAnimationFrame(check)}check()})`);
    await ready("window.castleSample && !document.querySelector('#start').disabled");
    await page.tapElement("#start");
    await ready("document.querySelector('[data-bph-start]')");
    await page.tapElement("[data-bph-start]");
    await passFirstBattleGuide(page);
    await ready("castleSample.snapshot().time>1");
    const fn = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" });
    const props = await page.view.cdp("Runtime.getProperties", { objectId: field(field(fn, "result"), "objectId") });
    const scopesProperty = list(field(props, "internalProperties")).find(p => field(p, "name") === "[[Scopes]]");
    const scopes = await page.view.cdp("Runtime.getProperties", { objectId: field(field(scopesProperty, "value"), "objectId") });
    let bound = false;
    for (const scope of list(field(scopes, "result"))) {
      if (field(scope, "name") === "length") continue;
      const vars = await page.view.cdp("Runtime.getProperties", { objectId: field(field(scope, "value"), "objectId"), ownProperties: true });
      for (const variable of list(field(vars, "result"))) {
        if (field(field(variable, "value"), "type") !== "object") continue;
        const objectId = field(field(variable, "value"), "objectId");
        if (typeof objectId !== "string") continue;
        const result = await page.view.cdp("Runtime.callFunctionOn", {
          objectId, returnByValue: true,
          functionDeclaration: "function(){if(this.scene&&this.scene.getScene&&this.canvas){globalThis.__bowGame=this;return true}return false}",
        });
        if (field(field(result, "result"), "value") === true) { bound = true; break; }
      }
      if (bound) break;
    }
    if (!bound) throw new Error("Phaser game not found");
    await page.evaluate(`(()=>{__bowGame.loop.stop();globalThis.__bowScene=__bowGame.scene.getScene("castle");return true})()`);
    const results = [];
    for (const [general, gap, slug] of [
      ["이순신", 100, "yi-bow"], ["곽재우", 100, "gwak-bow"], ["이순신", 30, "yi-sword"],
    ] as const) {
      const run = chaosArena(general, 0), squad = run.squads[0];
      squad.x = squad.homeX = squad.targetX = 125;
      squad.y = squad.homeY = squad.targetY = 230;
      squad.clock = 0;
      const target = chaosEnemy(run, squad.x + gap, squad.y);
      advance(run, 1 / 30);
      const preparation = JSON.stringify(run);
      let effects = advance(run, .1);
      effects = advance(run, .1);
      effects = advance(run, .05);
      // The arrow is captured after it has cleared the bow, before contact.
      if (squad.basicAttack === "arrow") advance(run, .05);
      const release = JSON.stringify(run);
      for (const [phase, fixture, lead, since] of [["raise", preparation, .18, 1e9], ["draw", preparation, .04, 1e9],
        ["release", release, 0, 50], ["recover", release, 0, 120]] as const) {
        const evidence = await page.evaluate(`(()=>{
          const scene=__bowScene,s=${fixture},q=s.squads[0],e=s.enemies[0];
          scene.positions.clear();scene.entered.clear();scene.bars.clear();scene.healthBoxes.length=0;
          scene.troops.forEach(t=>{t.leader.sprite.destroy();t.troopers.forEach(u=>u.sprite.destroy())});
          scene.foes.forEach(sprite=>sprite.destroy());scene.foes.clear();scene.strides.clear();
          scene.troops=[scene.muster(q,"")];
          const t=scene.troops[0].leader;t.windFor=${general === "이순신" && gap <= 46 ? 220 : 200};
          t.strikeAt=scene.time.now-${since};t.hurtAt=-1e9;t.aimX=e.x;t.aimY=e.y;
          if(q.strikeAt>0)s.time=q.strikeAt-${lead};
          const before=JSON.stringify(s);
          scene.syncFoes(s);scene.syncTroops(s);scene.syncShots(s);
          if(q.basicAttack==="melee"&&${phase === "release"})scene.melee(e.x,e.y,false);
          const f=t.sprite.frame;
          scene.game.renderer.preRender();scene.game.scene.render(scene.game.renderer);scene.game.renderer.postRender();
          if(before!==JSON.stringify(s))throw new Error("Rendering changed combat bytes");
          return {general:q.general,attack:q.basicAttack,rng:s.rng,shots:s.shots.map(a=>({kind:a.kind,x:a.x,y:a.y})),
            body:{x:t.sprite.x,y:t.sprite.y},frame:{texture:f.texture.key,index:f.name},viewport:[innerWidth,innerHeight]};
        })()`);
        await page.shot(`${out}/${width}x${height}-${slug}-${phase}.png`);
        results.push({ slug, phase, target: target.id, effects, evidence });
      }
    }
    await Bun.write(`${out}/${width}x${height}.json`, JSON.stringify({ results, errors: page.errors }, null, 2));
    if (page.errors.length) throw new Error(page.errors.join("\n"));
    await browser.reset();
  }
} finally {
  await browser.close();
  server.stop(true);
}
console.log("CAPTURE_ALL exit=0");
