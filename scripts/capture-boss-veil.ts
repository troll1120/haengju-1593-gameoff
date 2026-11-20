import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build } from "vite";
import { confirmFirstResultUnlock, launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

const root = resolve(import.meta.dir, ".."), output = resolve(root, "review-fixtures/boss-veil");
const [out = "review/boss-veil"] = Bun.argv.slice(2);
await mkdir(out, { recursive: true });
const observer = `
window.veilProbe = {
  jump: at => {
    run.base = run.maxBase = 1e12;
    for (const squad of run.squads) { squad.hp = squad.maxHp = 1e8; for (const unit of squad.soldiers) unit.hp = unit.maxHp = 1e8; }
    run.time = at - .3; run.enemies = run.enemies.filter(enemy => enemy.boss);
    if (!run.endless) { const plan = veilPlan(run.bph.waveId), next = plan.findIndex(entry => entry.at >= at); run.bph.survival.cursor = next < 0 ? plan.length : next; }
  },
  slay: () => { for (const enemy of run.enemies.filter(enemy => enemy.boss)) { enemy.hp = .001; veilHit(run, enemy.id); } },
  entrances: () => feedback.bossEntrances,
  freezeOnVeil: after => new Promise((resolve, reject) => {
    const scene = game.scene.getScene("castle"), end = performance.now() + 15000;
    requestAnimationFrame(function frame() {
      const veil = scene.children.list.find(child => child.depth === LAYER.veil && child.alpha > .3);
      if (veil && feedback.bossEntrances > after) { game.loop.sleep(); resolve(true); }
      else if (performance.now() > end) reject(new Error("No boss veil"));
      else requestAnimationFrame(frame);
    });
  }),
  resume: () => game.loop.wake(),
  state: () => ({ time: run.time, phase: run.phase, endless: run.endless, zoom: game.scene.getScene("castle").cameras.main.zoom,
    scroll: [game.scene.getScene("castle").cameras.main.scrollX, game.scene.getScene("castle").cameras.main.scrollY],
    veil: (() => { const v = game.scene.getScene("castle").children.list.find(child => child.depth === LAYER.veil); return v ? { x: v.x, y: v.y, alpha: v.alpha, cameraFilter: v.cameraFilter } : null; })(),
    field: [WIDTH, HEIGHT], game: [game.scale.width, game.scale.height],
    canvas: document.querySelector("#arena canvas").getBoundingClientRect().toJSON(), viewport: [innerWidth, innerHeight] }),
};`;
await build({
  root, logLevel: "warn",
  build: { outDir: output, emptyOutDir: true, minify: false },
  plugins: [{
    name: "review-boss-veil-closure", enforce: "pre",
    transform(source, id) {
      if (id.split("?")[0] === `${root}/src/main.ts`)
        return `import { bphSurvivalPlan as veilPlan } from "./bph-survival";\nimport { hitBphEnemy as veilHit } from "./rules";\n${source}\n${observer}`;
    },
  }],
});
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: request => previewResponse(request, output) });
const log: Record<string, unknown>[] = [];
async function session(width: number, height: number): Promise<void> {
  const profile = await mkdtemp(`${tmpdir()}/castle-boss-veil-`);
  const page = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
  const ready = (condition: string, ms = 45000) => page.evaluate(`new Promise((resolve,reject)=>{
    const end=performance.now()+${ms};function check(){
      if(${condition})return resolve(true);
      if(performance.now()>end)return reject(new Error("State timeout: "+${JSON.stringify(condition)}));
      requestAnimationFrame(check);
    }check();
  })`);
  const entrance = async (name: string, at: number) => {
    const before = await page.evaluate("veilProbe.entrances()");
    await page.evaluate(`veilProbe.jump(${at})`);
    await page.evaluate(`veilProbe.freezeOnVeil(${before})`);
    const state = await page.evaluate("veilProbe.state()");
    await page.shot(`${out}/${width}x${height}-${name}.png`);
    log.push({ size: `${width}x${height}`, name, state });
    console.log(width, height, name, JSON.stringify(state));
    await page.evaluate("veilProbe.resume()");
  };
  try {
    await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
    await ready("window.castleSample && document.querySelector('#start') && !document.querySelector('#start').disabled");
    await page.tapElement("#start");
    await ready("document.querySelector('[data-bph-start]')");
    await page.tapElement("[data-bph-start]");
    await ready("castleSample.snapshot().phase==='playing' && !castleSample.snapshot().attract");
    await passFirstBattleGuide(page);
    await ready("!castleSample.snapshot().paused && castleSample.snapshot().time>1");
    for (const at of [180, 360, 540, 720, 810]) await entrance(`boss-${at}`, at);
    await page.evaluate("veilProbe.jump(900)");
    await page.evaluate("veilProbe.slay()");
    await ready("castleSample.snapshot().phase==='won'");
    await ready("document.querySelector('#result-unlock-modal[open]') || performance.now() - (window.veilWon ??= performance.now()) > 1500", 5000);
    if (await page.evaluate("Boolean(document.querySelector('#result-unlock-modal[open]'))")) await confirmFirstResultUnlock(page);
    if (!await page.tapElement("#result-endless")) throw new Error("Endless button is unreachable");
    await ready("castleSample.snapshot().phase==='playing' && castleSample.snapshot().endless");
    await entrance("endless-1080", 1080);
  } finally {
    page.view.close(); await rm(profile, { recursive: true, force: true });
  }
}
await session(320, 640);
await session(390, 844);
await session(1440, 900);
await writeFile(`${out}/capture.json`, JSON.stringify(log, null, 2));
server.stop(true);
