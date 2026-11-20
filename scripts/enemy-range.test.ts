import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

for (const [width, height] of [[390, 844], [1440, 900]]) {
  test(`enemy circle and lane casts retain the previous red fill at ${width}x${height}`, async () => {
    const root = resolve(import.meta.dir, "..");
    const out = resolve(process.env.CASTLE_RANGE_EVIDENCE ?? `${root}/review/enemy-range`);
    const label = process.env.CASTLE_RANGE_LABEL ?? "after";
    await mkdir(out, { recursive: true });
    const profile = await mkdtemp(`${out}/chrome-`);
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, `${root}/review-dist`) });
    const page = await launch(`http://127.0.0.1:${server.port}/?seed=7`, profile, width, height,
      ["--single-process", "--no-zygote", "--disable-gpu"]);
    const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
      const end=performance.now()+30000;
      requestAnimationFrame(function check(){
        if(${condition})resolve(true);
        else if(performance.now()>end)reject(new Error("Enemy range condition: "+${JSON.stringify(condition)}));
        else requestAnimationFrame(check);
      });
    })`);
    try {
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      expect(await page.tapElement("#start")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      expect(await page.tapElement("[data-bph-start]")).toBe(true);
      await passFirstBattleGuide(page);
      await ready("!castleSample.snapshot().paused && castleSample.snapshot().enemyUnits.length");
      // Existing public review state supplies a durable, naturally generated enemy cast.
      await page.evaluate(`(()=>{
        const s=castleSample.snapshot(), e=s.enemyUnits[0], q=s.squads[0];
        q.hp=q.maxHp=1e8;
        Object.assign(e,{boss:true,elite:false,kind:"samurai",
          x:q.x+35,y:q.y+15,hp:1e8,maxHp:1e8,speed:0,clock:1e8,skillClock:0,
          strikeAt:0,casting:0,prey:null,ladder:false,stun:0});
        delete e.cargo;
        delete e.pattern;
      })()`);
      await ready("castleSample.snapshot().telegraphs.length>0");
      const result = await page.evaluate(`new Promise(resolve=>{
        const s=castleSample.snapshot(), mark=s.telegraphs[0];
        // Keep the real cast geometry and freeze only its review deadline.
        mark.startedAt=s.time-30;mark.at=s.time+30;
        const lane={...mark,id:900001,skill:"salvo",shape:"lane",
          fromX:70,fromY:530,x:240,y:600,radius:22};
        s.telegraphs.push(lane);
        const context=document.querySelector("#arena canvas").getContext("2d");
        const original=context.fillRect;
        window.__enemyRangePixels=[];
        context.fillRect=function(x,y,w,h){
          if(w===4&&h===4)window.__enemyRangePixels.push({x,y,color:this.fillStyle,alpha:this.globalAlpha});
          return Reflect.apply(original,this,[x,y,w,h]);
        };
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          context.fillRect=original;
          const pixels=window.__enemyRangePixels.filter(p=>p.color==="#c34b35"||
            p.color.startsWith("rgba(195, 75, 53,"));
          const opacity=p=>(p.color.startsWith("rgba")?Number(p.color.slice(p.color.lastIndexOf(",")+1,-1)):1)*p.alpha;
          resolve({skill:mark.skill,shape:mark.shape,pixels:pixels.length,
            circle:pixels.some(p=>Math.hypot(p.x+2-mark.x,p.y+2-mark.y)<mark.radius),
            lane:pixels.some(p=>Math.hypot(p.x+2-155,p.y+2-565)<22),
            alpha:pixels.length>0&&pixels.every(p=>opacity(p)>=.52&&opacity(p)<=.54),
            styles:[...new Set(window.__enemyRangePixels.map(p=>p.color))],
            telegraphs:s.telegraphs.length,metrics:s.metrics.telegraphs});
        }));
      })`);
      await Bun.write(`${out}/${label}-${width}x${height}.json`, JSON.stringify({ result, errors: page.errors }, null, 2));
      expect(result).toMatchObject({ skill: "slam", shape: "circle", circle: true, lane: true, alpha: true });
      await page.shot(`${out}/${label}-${width}x${height}.png`);
      expect(page.errors).toEqual([]);
    } catch (error) {
      await page.shot(`${out}/${label}-${width}x${height}-failure.png`);
      const state = await page.evaluate(`(()=>{const s=castleSample.snapshot();return {
        time:s.time,paused:s.paused,phase:s.phase,enemy:s.enemyUnits[0],squad:s.squads[0],telegraphs:s.telegraphs};})()`);
      await Bun.write(`${out}/${label}-${width}x${height}-failure.json`, JSON.stringify({ errors: page.errors, state }, null, 2));
      throw error;
    } finally {
      page.view.close();
      server.stop(true);
      await rm(profile, { recursive: true });
    }
  }, 90000);
}
