import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "vite";
import { launch, passFirstBattleGuide } from "./review-browser";
import type { Point } from "./review-browser";

test("courtyard, former wall-gap and building taps do not purchase or open the classic panel, and a field tap on a ready general fires no skill", async () => {
  const root = resolve(process.env["PALISADE_SOURCE_ROOT"] ?? resolve(import.meta.dir, ".."));
  const temporary = await mkdtemp(`${tmpdir()}/castle-no-palisade-`);
  const evidence = resolve(process.env["PALISADE_EVIDENCE"] ?? `${temporary}/evidence`);
  await mkdir(evidence, { recursive: true });
  const server = await createServer({
    root, cacheDir: `${temporary}/vite`,
    server: { host: "127.0.0.1", port: 19585, strictPort: false },
    plugins: [{
      name: "observe-palisade-removal", enforce: "pre",
      transform(source, id) {
        if (id.split("?")[0] !== `${root}/src/main.ts`) return;
        return `${source}
          window.palisadeProbe = {
            draws: 0,
            prepare: () => {
              game.loop.sleep();
              run.time=2;run.gold=100;run.bph.save.coins=100;
              const scene=game.scene.getScene("castle"),draw=scene.painted.draw.bind(scene.painted);
              scene.painted.draw=(g,slug,...args)=>{
                if(slug==="palisade-crosses")window.palisadeProbe.draws++;
                return draw(g,slug,...args);
              };
              scene.cameras.main.preRender();
            },
            points: () => ({
              courtyard:{x:CENTER.x-9,y:CENTER.y-64},
              gap:{x:CENTER.x,y:fortRect(run.fort).top-8},
              barracks:buildings().barracks,forge:buildings().forge,
              infirmary:buildings().infirmary,general:run.squads[0]
            }),
            render: () => {
              const scene=game.scene.getScene("castle");
              scene.marks.clear();scene.bars.clear();scene.syncWalls(run);
              game.renderer.preRender();scene.sys.render(game.renderer);game.renderer.postRender();
            },
            enableBuildings: () => {run.meta.caps.drill=1;},
            readySkill: () => {
              const source=createRun(2);
              for(let i=0;i<300&&!source.enemies.length;i++)advance(source,.05);
              run.enemies.push({...source.enemies[0],x:CENTER.x,y:fortRect(run.fort).top-50});
              run.squads[0].skillClock=0;
            },
            project: point => {
              const p=game.scene.getScene("castle").cameras.main.matrix.transformPoint(point.x,point.y);
              const r=document.querySelector("#arena canvas").getBoundingClientRect();
              return {x:r.left+p.x/WIDTH*r.width,y:r.top+p.y/HEIGHT*r.height};
            }
          };`;
      },
    }],
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Missing server port");
  const page = await launch(`http://127.0.0.1:${address.port}/?seed=1593`,
    `${temporary}/chrome`, 390, 844,
    ["--single-process", "--no-zygote", "--disable-gpu", "--disable-extensions", "--disable-breakpad"]);
  const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
    const end=performance.now()+45000;
    requestAnimationFrame(function check(){
      if(${condition})resolve(true);
      else if(performance.now()>end)reject(new Error("Timeout: "+${JSON.stringify(condition)}));
      else requestAnimationFrame(check);
    });
  })`);
  const samples: unknown[] = [];
  async function tapPoint(name: string): Promise<void> {
    const point = await page.evaluate(`palisadeProbe.project(palisadeProbe.points()[${JSON.stringify(name)}])`);
    if (!point || typeof point !== "object" || !("x" in point) || !("y" in point) ||
        typeof point.x !== "number" || typeof point.y !== "number") throw new Error("Missing tap point");
    await page.tap({ x: point.x, y: point.y } satisfies Point);
  }
  try {
    await ready("window.castleSample?.snapshot().field && !document.querySelector('#start').disabled");
    expect(await page.tapElement("#start")).toBe(true);
    await ready("document.querySelector('[data-bph-start]')");
    expect(await page.tapElement("[data-bph-start]")).toBe(true);
    await passFirstBattleGuide(page);
    await ready("!castleSample.snapshot().attract && castleSample.snapshot().time>1");
    await page.evaluate("(palisadeProbe.prepare(),palisadeProbe.render())");
    await page.shot(`${evidence}/before-taps-390x844.png`);
    for (const name of ["courtyard", "gap"]) {
      const before = await page.evaluate("JSON.stringify(castleSample.snapshot().enemyUnits)");
      for (let tap = 0; tap < 3; tap++) await tapPoint(name);
      await page.evaluate("palisadeProbe.render()");
      await page.shot(`${evidence}/after-${name}-390x844.png`);
      const state = await page.evaluate(`(()=>{const s=castleSample.snapshot();return {
        gold:s.gold,bought:s.palisadesBought,palisades:s.palisades,draws:palisadeProbe.draws,rng:s.rng
      };})()`);
      samples.push({ name, state });
      expect(await page.evaluate("castleSample.snapshot().gold")).toBe(100);
      expect(await page.evaluate("castleSample.snapshot().palisadesBought")).toBe(0);
      expect(await page.evaluate("Object.values(castleSample.snapshot().palisades).every(p=>p.hp===0&&p.until===0)")).toBe(true);
      expect(await page.evaluate("JSON.stringify(castleSample.snapshot().enemyUnits)")).toBe(before);
      expect(await page.evaluate("palisadeProbe.draws")).toBe(0);
    }
    await page.evaluate("(()=>{const s=castleSample.snapshot();s.palisades.위.hp=220;s.palisades.위.until=26;})()");
    await page.evaluate("palisadeProbe.render()");
    await page.shot(`${evidence}/ignored-legacy-palisade-390x844.png`);
    expect(await page.evaluate("palisadeProbe.draws")).toBe(0);
    await page.evaluate("palisadeProbe.enableBuildings()");
    // Survival never opens the classic building panel, whatever building is tapped.
    for (const name of ["barracks", "forge", "infirmary"]) {
      await tapPoint(name);
      expect(await page.evaluate("document.querySelector('#building').hidden")).toBe(true);
    }
    await page.evaluate("palisadeProbe.readySkill()");
    // A general's skill fires only from his portrait button (owner DM 1794902302.558399, 442d7fe).
    await tapPoint("general");
    expect(await page.evaluate("castleSample.snapshot().metrics.skills[0]")).toBe(0);
    expect(await page.evaluate("castleSample.snapshot().gold")).toBe(100);
    expect(page.errors).toEqual([]);
    console.log("PALISADE_REMOVAL_UI_PASS", JSON.stringify(samples));
  } finally {
    await Bun.write(`${evidence}/evidence.json`, JSON.stringify({
      fixture: "Fresh seed1593 survival; frozen at t2 with 100G; building caps enabled only for retained legacy building interactions.",
      root, samples, errors: page.errors,
    }, null, 2));
    page.view.close();
    await server.close();
    await rm(temporary, { recursive: true });
  }
}, 120000);
