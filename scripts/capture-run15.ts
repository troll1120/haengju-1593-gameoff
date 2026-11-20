import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build } from "vite";
import { confirmFirstResultUnlock, launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

const root = resolve(import.meta.dir, ".."), output = resolve(root, "review-fixtures/run15");
const [out = "review/run15"] = Bun.argv.slice(2);
await mkdir(out, { recursive: true });
const observer = `
window.run15Probe = {
  jump: at => {
    run.base = run.maxBase = 1e12;
    for (const squad of run.squads) { squad.hp = squad.maxHp = 1e8; for (const unit of squad.soldiers) unit.hp = unit.maxHp = 1e8; }
    const plan = run15Plan(run.bph.waveId);
    run.time = at - .5; run.enemies = run.enemies.filter(enemy => enemy.boss && enemy.hp > 0 && !run.endless);
    if (!run.endless) { const next = plan.findIndex(entry => entry.at >= at); run.bph.survival.cursor = next < 0 ? plan.length : next; }
  },
  slayBosses: () => { for (const enemy of run.enemies.filter(enemy => enemy.boss)) { enemy.hp = .001; run15Hit(run, enemy.id); } },
  fall: () => { run.base = 0; },
  state: () => ({ time: run.time, phase: run.phase, endless: run.endless,
    bosses: run.enemies.filter(enemy => enemy.boss).map(enemy => enemy.bphProfileId), clock: document.querySelector("#clock").textContent }),
};`;
await build({
  root, logLevel: "warn",
  build: { outDir: output, emptyOutDir: true, minify: false },
  plugins: [{
    name: "review-run15-closure", enforce: "pre",
    transform(source, id) {
      if (id.split("?")[0] === `${root}/src/main.ts`)
        return `import { bphSurvivalPlan as run15Plan } from "./bph-survival";\nimport { hitBphEnemy as run15Hit } from "./rules";\n${source}\n${observer}`;
    },
  }],
});
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: request => previewResponse(request, output) });
const log: Record<string, unknown>[] = [];
async function session(lang: "ko" | "en"): Promise<void> {
  const profile = await mkdtemp(`${tmpdir()}/castle-run15-`);
  const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
  const ready = (condition: string, ms = 45000) => phone.evaluate(`new Promise((resolve,reject)=>{
    const end=performance.now()+${ms};function check(){
      if(${condition})return resolve(true);
      if(performance.now()>end)return reject(new Error("State timeout: "+${JSON.stringify(condition)}));
      requestAnimationFrame(check);
    }check();
  })`);
  const shot = async (name: string) => {
    const state = await phone.evaluate("run15Probe.state()");
    await phone.shot(`${out}/${lang}-${name}.png`);
    log.push({ lang, name, state });
    console.log(lang, name, JSON.stringify(state));
  };
  try {
    await phone.view.navigate(`http://127.0.0.1:${server.port}`);
    await phone.evaluate(`localStorage.setItem("haengju1593-lang", ${JSON.stringify(lang)})`);
    await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
    await ready("window.castleSample && document.querySelector('#start') && !document.querySelector('#start').disabled");
    await phone.tapElement("#start");
    await ready("document.querySelector('[data-bph-start]')");
    await phone.tapElement("[data-bph-start]");
    await ready("castleSample.snapshot().phase==='playing' && !castleSample.snapshot().attract");
    await passFirstBattleGuide(phone);
    await ready("!castleSample.snapshot().paused && castleSample.snapshot().time>1");
    await shot("hud-target");
    for (const at of [180, 540, 810]) {
      await phone.evaluate(`run15Probe.jump(${at})`);
      await ready(`castleSample.snapshot().time>=${at}+1.5`);
      await shot(`boss-${at}`);
    }
    await phone.evaluate("run15Probe.jump(900)");
    await ready("castleSample.snapshot().time>=901 && castleSample.snapshot().phase==='playing'");
    await shot("overtime-finals-remain");
    await phone.evaluate("run15Probe.slayBosses()");
    await ready("castleSample.snapshot().phase==='won'");
    await shot("win-endless-button");
    await ready("!document.querySelector('#result-endless').hidden");
    await ready("document.querySelector('#result-unlock-modal[open]') || performance.now() - (window.run15Won ??= performance.now()) > 1500", 5000);
    if (await phone.evaluate("Boolean(document.querySelector('#result-unlock-modal[open]'))")) await confirmFirstResultUnlock(phone);
    await shot("win-endless-button-after-unlock");
    if (!await phone.tapElement("#result-endless")) throw new Error("Endless button is unreachable");
    await ready("castleSample.snapshot().phase==='playing' && castleSample.snapshot().time>903");
    await shot("endless-hud");
    await phone.evaluate("run15Probe.jump(1080)");
    await ready("castleSample.snapshot().time>=1081.5");
    await shot("endless-boss-1080");
    await phone.evaluate("run15Probe.fall()");
    await ready("castleSample.snapshot().phase==='lost' && !document.querySelector('#result').hidden && document.querySelector('#screen-flash').hidden && getComputedStyle(document.querySelector('#result')).opacity === '1' && getComputedStyle(document.querySelector('#result')).scale === '1'", 15000);
    await shot("endless-record");
  } finally {
    phone.view.close(); await rm(profile, { recursive: true, force: true });
  }
}
await session("ko");
await session("en");
await writeFile(`${out}/capture.json`, JSON.stringify(log, null, 2));
server.stop(true);
