import { expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { advance, CASTS, createRun } from "../src/rules";
import type { Skill, Telegraph } from "../src/rules";
import { guardPoint, setFieldSize } from "../src/geometry";
import { launch, passFirstBattleGuide } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";

function isSkill(value: string): value is Skill { return Object.hasOwn(CASTS, value); }

/** Generate review data through the real seeded cast producer, including its real deadline. */
function castFixture(skill: Skill): Telegraph {
  const run = createRun(7), squad = run.squads[0], at = guardPoint(0, "아래", 40);
  Object.assign(squad, { x: at.x, y: at.y, targetX: at.x, targetY: at.y, clock: 1e9, skillClock: 1e9 });
  squad.soldiers = [];
  run.xp = -1e9; run.spawnBudget = -1e9; run.commandClock = 1e9;
  const enemy = { ...run.enemies[0], boss: true, elite: false, kind: "samurai" as const,
    x: at.x + 24, y: at.y, hp: 1e8, maxHp: 1e8, speed: 0, clock: 1e9, skillClock: 0, casting: 0, stun: 0 };
  delete enemy.pattern; delete enemy.bossArt; delete enemy.cargo; delete enemy.miniboss;
  switch (skill) {
    case "spear-thrust": case "spin-slash": enemy.miniboss = skill; break;
    case "gunner": case "cavalry": case "siege": case "ninja": case "decree": enemy.pattern = skill; break;
    case "fire": enemy.bossArt = "kobayakawa"; enemy.enraged = true; enemy.casts = 0; break;
    case "ladder": enemy.bossArt = "kato_yoshiaki"; enemy.enraged = true; enemy.casts = 0; break;
    case "shield": enemy.bossArt = "wakizaka"; enemy.enraged = true; enemy.casts = 0; break;
    case "salvo": enemy.bossArt = "konishi"; enemy.enraged = true; enemy.casts = 0; break;
    case "ram": {
      squad.state = "down"; squad.downUntil = 1e9;
      Object.assign(enemy, guardPoint(0, "아래", 0));
      break;
    }
    case "slam": break;
  }
  run.enemies = [enemy];
  advance(run, 1 / 30);
  const mark = run.telegraphs[0];
  expect(mark?.skill).toBe(skill);
  expect(mark?.radius).toBe(CASTS[skill].radius);
  expect(mark.at - mark.startedAt).toBeCloseTo(CASTS[skill].windup);
  return mark;
}

for (const reduced of [false, true]) {
  test(`all enemy ranges preserve geometry and remain visible above effects, reduced motion ${reduced}`, async () => {
    const root = resolve(import.meta.dir, "..");
    const out = resolve(root, "review/enemy-range-360");
    await mkdir(out, { recursive: true });
    const profile = await mkdtemp(`${out}/chrome-`);
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, `${root}/review-dist`) });
    const page = await launch("about:blank", profile, 390, 844);
    const label = `${process.env.CASTLE_RANGE_LABEL ?? "after"}-${reduced ? "reduced" : "normal"}`;
    const results: unknown[] = [];
    try {
      await page.view.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
      await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
      const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
        const end=performance.now()+30000;
        requestAnimationFrame(function check(){
          if(${condition})resolve(true);else if(performance.now()>end)reject(new Error("Range fixture not ready"));
          else requestAnimationFrame(check);
        });
      })`);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      await page.evaluate(`(()=>{
        const ui=new WeakMap();window.__rangeUiTextures=ui;
        const textures=Phaser.Textures.TextureManager.prototype, addCanvas=textures.addCanvas;
        textures.addCanvas=function(key,canvas,...args){
          if(key.startsWith("gauge:"))ui.set(canvas,key);
          return Reflect.apply(addCanvas,this,[key,canvas,...args]);
        };
        const texts=Phaser.GameObjects.Text.prototype, updateText=texts.updateText;
        texts.updateText=function(...args){
          window.__rangeScene=this.scene;
          const result=Reflect.apply(updateText,this,args);
          if(this.depth>=1100&&/^[0-9]+$/.test(this.text))ui.set(this.canvas,"damage-number:"+this.texture.key);
          return result;
        };
      })()`);
      expect(await page.tapElement("#start")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      expect(await page.tapElement("[data-bph-start]")).toBe(true);
      await passFirstBattleGuide(page);
      await ready("!castleSample.snapshot().paused && castleSample.snapshot().enemyUnits.length");
      const field = await page.evaluate(`castleSample.snapshot().field`);
      if (typeof field !== "object" || field === null || !("width" in field) || !("height" in field)
        || typeof field.width !== "number" || typeof field.height !== "number") throw new TypeError("Missing field dimensions");
      setFieldSize(field.width, field.height);
      await page.evaluate(`(()=>{
        const s=castleSample.snapshot();
        for(const e of s.enemyUnits)Object.assign(e,{stun:1e9,hp:1e8,maxHp:1e8});
        for(const q of s.squads){q.hp=q.maxHp=1e8;q.clock=q.skillClock=1e9;q.soldiers.length=0;}
        s.telegraphs.length=0;
      })()`);
      if (process.env.CASTLE_RANGE_MUTATE === "ground")
        await page.evaluate("void window.__rangeScene.danger.setDepth(8)");
      if (process.env.CASTLE_RANGE_MUTATE === "tie")
        await page.evaluate("void window.__rangeScene.danger.setDepth(1099)");
      for (const skill of Object.keys(CASTS).filter(isSkill)) {
        const mark = castFixture(skill);
        const result = await page.evaluate(`new Promise(resolve=>{
          const s=castleSample.snapshot(), mark=${JSON.stringify(mark)}, duration=mark.at-mark.startedAt;
          mark.startedAt=s.time-duration*.25;mark.at=mark.startedAt+duration;
          s.telegraphs.length=0;s.telegraphs.push(mark);
          // A bullet, a flaming arrow and a rocket sit on the warning for the sampled frame, so their painted tails
          // cross it every run instead of only when live shots happen to fly past.
          const crossing=[["bullet",false,-6],["arrow",true,0],["rocket",false,6]].map(([kind,flaming,dy])=>({id:s.nextId++,kind,flaming,
            x:mark.x,y:mark.y+dy,toX:mark.x+400,toY:mark.y+dy,speed:1,target:0,damage:0}));
          s.shots.push(...crossing);
          // A real healing sprite at once()'s maximum depth must not cover the warning.
          const healing=window.__rangeScene.add.sprite(mark.x,mark.y,"heal",0).setScale(2).setDepth(1099);
          const c=document.querySelector("#arena canvas").getContext("2d"), original=c.fillRect, drawImage=c.drawImage, clearRect=c.clearRect;
          let cells=[], samples=new Map(), ui=[];
          c.clearRect=function(x,y,w,h){
            if(x===0&&y===0&&w===c.canvas.width&&h===c.canvas.height){cells=[];samples.clear();ui=[];}
            return Reflect.apply(clearRect,this,[x,y,w,h]);
          };
          const uiRect=(x,y,w,h,key)=>{
            const t=c.getTransform(), a=new DOMPoint(x,y).matrixTransform(t), b=new DOMPoint(x+w,y+h).matrixTransform(t);
            ui.push({key,left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y)});
          };
          // Only identified gauges (unit/general health, the general attack bar under it, the castle core bar) and numeric UI text may cover a safety range.
          c.drawImage=function(image,...args){
            const key=window.__rangeUiTextures.get(image);
            if(samples.size&&key){
              const dest=args.length===8?args.slice(4):args;
              uiRect(dest[0],dest[1],dest[2]??image.width,dest[3]??image.height,key);
            }
            return Reflect.apply(drawImage,this,[image,...args]);
          };
          c.fillRect=function(x,y,w,h){
            if(w===4&&h===4&&this.fillStyle.startsWith("rgba(195, 75, 53,")){
              const alpha=Number(this.fillStyle.slice(this.fillStyle.lastIndexOf(",")+1,-1))*this.globalAlpha;
              cells.push({x,y,alpha});
              if(x>=0&&y>=0&&x+1<c.canvas.width&&y+1<c.canvas.height)
                samples.set(x+","+y,{x,y,alpha,before:[...this.getImageData(x+1,y+1,1,1).data]});
            } else if(samples.size&&((w===40&&h===5)||(w===38&&h===3)||(w===22&&h===4)||(w===20&&h===2)||(w===40&&h===4)||(w===38&&h===2)||(w===56&&h===5)||(w===54&&h===3)))uiRect(x,y,w,h,"health-bar");
            return Reflect.apply(original,this,[x,y,w,h]);
          };
          requestAnimationFrame(()=>requestAnimationFrame(()=>{
            c.fillRect=original;c.drawImage=drawImage;c.clearRect=clearRect;
            const a=mark.shape==="lane"?{x:mark.fromX,y:mark.fromY}:mark;
            const dx=mark.x-a.x,dy=mark.y-a.y,len=dx*dx+dy*dy,expected=[];
            for(let y=Math.floor((Math.min(a.y,mark.y)-mark.radius)/4)*4;y<=Math.max(a.y,mark.y)+mark.radius;y+=4)
              for(let x=Math.floor((Math.min(a.x,mark.x)-mark.radius)/4)*4;x<=Math.max(a.x,mark.x)+mark.radius;x+=4){
                const t=len?Math.max(0,Math.min(1,((x+2-a.x)*dx+(y+2-a.y)*dy)/len)):0;
                if(Math.hypot(x+2-a.x-t*dx,y+2-a.y-t*dy)<=mark.radius)expected.push(x+","+y);
              }
            const drawn=[...new Set(cells.map(p=>p.x+","+p.y))].sort();
            const fieldSamples=[...samples.values()].filter(p=>!ui.some(r=>p.x+1>=r.left&&p.x+1<r.right&&p.y+1>=r.top&&p.y+1<r.bottom));
            const hidden=fieldSamples.filter(p=>{
              const after=[...c.getImageData(p.x+1,p.y+1,1,1).data];
              const predicted=p.before.slice(0,3).map((v,i)=>Math.round(v*(1-p.alpha)+[195,75,53][i]*p.alpha));
              return !predicted.every((v,i)=>Math.abs(v-after[i])<=2);
            });
            healing.destroy();
            const live=castleSample.snapshot().shots,crossed=crossing.filter(shot=>live.includes(shot)).length;
            for(const shot of crossing){const at=live.indexOf(shot);if(at>=0)live.splice(at,1);}
            resolve({skill:mark.skill,radius:mark.radius,duration,geometry:JSON.stringify(drawn)===JSON.stringify(expected.sort()),
              crossed,alphas:[...new Set(cells.map(p=>p.alpha))],visible:fieldSamples.length>0&&hidden.length===0,hidden:hidden.length,
              samples:samples.size,uiSamples:samples.size-fieldSamples.length,uiKeys:[...new Set(ui.map(r=>r.key))],
              hiddenExamples:hidden.slice(0,5)});
          }));
        })`);
        results.push(result);
        await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
        await page.shot(`${out}/${label}-${skill}-390x844.png`);
        await ready("castleSample.snapshot().telegraphs.length===0");
        expect(await page.evaluate("castleSample.snapshot().telegraphs.length")).toBe(0);
      }
      await Bun.write(`${out}/${label}.json`, JSON.stringify({ results, errors: page.errors }, null, 2));
      for (const result of results) {
        expect(result).toMatchObject({ geometry: true, visible: true, crossed: 3 });
        if (reduced) expect(result).toMatchObject({ alphas: [.525] });
      }
      expect(page.errors).toEqual([]);
    } finally {
      server.stop(true); await closeBrowser(page.view, profile);
    }
  }, 120000);
}
