import { afterAll, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { reviewBrowserSession, passFirstBattleGuide } from "./review-browser";
import type { Point } from "./review-browser";
import { previewResponse } from "./serve";

const session = reviewBrowserSession(["--single-process", "--no-zygote", "--disable-gpu", "--disable-extensions", "--disable-breakpad"]);
afterAll(() => session.close());

test("BPH command pointer follows off-centre taps and moves during the boss camera zoom", async () => {
  const root = resolve(import.meta.dir, "..");
  const evidence = process.env["J6_EVIDENCE"];
  const label = process.env["J6_LABEL"] ?? "check";
  if (evidence) await mkdir(evidence, { recursive: true });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, `${root}/review-fixtures/pointer`) });
  const page = await session.open();
  await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=1593`);
  const samples: unknown[] = [];
  const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
    const end=performance.now()+45000;
    requestAnimationFrame(function frame(){
      if(${condition})resolve(true);
      else if(performance.now()>end)reject(new Error("Timeout: "+${JSON.stringify(condition)}));
      else requestAnimationFrame(frame);
    });
  })`);
  async function project(world: Point): Promise<Point> {
    const point = await page.evaluate(`j6PointerProbe.project(${JSON.stringify(world)})`);
    if (!point || typeof point !== "object" || !("x" in point) || !("y" in point) ||
      typeof point.x !== "number" || typeof point.y !== "number") throw new Error("Missing projected tap point");
    return { x: point.x, y: point.y };
  }
  async function check(world: Point, event: string): Promise<void> {
    const actual = await page.evaluate("j6PointerProbe.pointer()");
    const zoom = await page.evaluate("j6PointerProbe.camera().zoom");
    samples.push({ event, zoom, expected: world, actual });
    console.log("J6_POINTER", JSON.stringify(samples.at(-1)));
    expect(await page.evaluate(`Math.abs(j6PointerProbe.pointer().x-${world.x})`)).toBeLessThan(1);
    expect(await page.evaluate(`Math.abs(j6PointerProbe.pointer().y-${world.y})`)).toBeLessThan(1);
  }
  try {
    await ready("window.castleSample?.snapshot().field && window.j6PointerProbe && !document.querySelector('#start').disabled");
    expect(await page.tapElement("#start")).toBe(true);
    await ready("document.querySelector('[data-bph-start]')");
    expect(await page.tapElement("[data-bph-start]")).toBe(true);
    await passFirstBattleGuide(page);
    await ready("castleSample.snapshot().time>2 && castleSample.snapshot().enemyUnits.length");
    await page.evaluate("j6PointerProbe.freeze()");
    const tap = { x: 60, y: 140 }, move = { x: 300, y: 210 };
    await page.tap(await project(tap));
    await check(tap, "unzoomed-pointerdown");
    await page.evaluate(`(()=>{
      j6PointerProbe.resume();
      const s=castleSample.snapshot(),e=s.enemyUnits[0],q=s.squads[0];
      q.hp=q.maxHp=1e8;
      s.enemyUnits.splice(0,s.enemyUnits.length,{...e,id:90001,boss:true,bossArt:"konishi",
        kind:"ukita",x:q.x+25,y:q.y+5,hp:1e7,maxHp:1e7,speed:0,clock:1e6,skillClock:1e6});
    })()`);
    await page.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    await page.evaluate(`(()=>{
      const s=castleSample.snapshot(),e=s.enemyUnits.find(e=>e.id===90001);
      const peak=j6PointerProbe.freezeAtBossPeak();
      e.hp=.01;e.shielded=false;
      for(const q of s.squads){q.clock=0;for(const u of q.soldiers)u.clock=0;}
      return peak;
    })()`);
    expect(await page.evaluate("j6PointerProbe.camera().zoom")).toBeCloseTo(1.025, 4);
    const down = await project(tap);
    await page.view.cdp("Input.dispatchTouchEvent", { type: "touchStart",
      touchPoints: [{ x: Math.round(down.x), y: Math.round(down.y), id: 1 }] });
    await check(tap, "zoomed-pointerdown");
    const moved = await project(move);
    await page.view.cdp("Input.dispatchTouchEvent", { type: "touchMove",
      touchPoints: [{ x: Math.round(moved.x), y: Math.round(moved.y), id: 1 }] });
    await check(move, "zoomed-pointermove");
    await page.view.cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect(page.errors).toEqual([]);
  } finally {
    if (evidence) {
      await page.shot(`${evidence}/${label}.png`);
      await Bun.write(`${evidence}/${label}.json`, JSON.stringify({ samples, errors: page.errors }, null, 2));
    }
    await session.reset();
    server.stop(true);
  }
}, 90000);
