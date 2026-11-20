// Review captures for generals fielding a personal full-body set, drawn from the textures the game actually loaded.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { bossContact, commanderFrame, LINEUP, setChecks, sheet } from "./review-general-fullsets-page";
import installed from "../review/general-fullsets-1116/installed-art.json";
import { BOSSES, FULL_BOSS_ART } from "../src/bosses";
import { bodyScale } from "../src/presentation";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { BPH_GENERALS } from "../src/bph-commanders";
import { ALLY_ANIMATIONS, allyArt } from "../src/ally-animation";
import { GENERAL_ART } from "../src/roster";

type Page = Awaited<ReturnType<typeof launch>>;
const root = resolve(import.meta.dir, ".."), out = Bun.argv[2] ?? `${root}/review/general-fullsets-1116`;
await mkdir(out, { recursive: true });
const REFERENCE = "sin_rip", PER_PAGE = 4;
const cell = (actor: string, direction: string, pose: string, index: number) =>
  ALLY_ANIMATIONS[`ally-full-${actor}-${direction}-${pose}`].frames[index].frame ?? -1;
const bodies = Object.entries(GENERAL_ART).filter(([, base]) => allyArt(base).full)
  .map(([general, base]) => ({ general, base, actor: allyArt(base).actor }));
const reference = bodies.filter(body => body.actor === REFERENCE), others = bodies.filter(body => body.actor !== REFERENCE);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, `${root}/review-dist`) });
const url = `http://127.0.0.1:${server.port}/?seed=7`;
function at(value: unknown, ...keys: readonly (string | number)[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) throw new Error(`Missing CDP object at ${key}`);
    current = Reflect.get(current, key);
  }
  return current;
}
function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("Missing CDP property list");
  return value;
}
const ready = (page: Page, condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
  const deadline=performance.now()+30000;function check(){
    if(${condition})return resolve(true);
    if(performance.now()>deadline)return reject(new Error("State timeout: "+${JSON.stringify(condition)}));
    requestAnimationFrame(check);
  }check();
})`);
/** The scene is not exported, so reach the Phaser game through the closure of the public snapshot function. */
async function bindGame(page: Page): Promise<void> {
  const fn = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" });
  const props = await page.view.cdp("Runtime.getProperties", { objectId: at(fn, "result", "objectId") });
  const scopesProperty = list(at(props, "internalProperties")).find(p => at(p, "name") === "[[Scopes]]");
  const scopes = await page.view.cdp("Runtime.getProperties", { objectId: at(scopesProperty, "value", "objectId") });
  for (const scope of list(at(scopes, "result"))) {
    if (at(scope, "name") === "length") continue;
    const vars = await page.view.cdp("Runtime.getProperties", { objectId: at(scope, "value", "objectId"), ownProperties: true });
    for (const variable of list(at(vars, "result"))) {
      if (at(variable, "value", "type") !== "object") continue;
      const id = at(variable, "value", "objectId");
      if (!id) continue;
      const result = await page.view.cdp("Runtime.callFunctionOn", { objectId: id, returnByValue: true,
        functionDeclaration: "function(){if(this.scene&&this.scene.getScene&&this.canvas){globalThis.__fullsetGame=this;return true}return false}" });
      if (at(result, "result", "value") === true) return;
    }
  }
  throw new Error("Could not find the Phaser game in the snapshot scope");
}
async function battle(general: string, play: (page: Page) => Promise<void>): Promise<void> {
  const profile = await mkdtemp(`${tmpdir()}/castle-fullsets-`);
  const page = await launch(url, profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
  try {
    const meta = freshMeta(), save = freshBphSave();
    save.unlockedGenerals = [...BPH_GENERALS]; meta.bph = save;
    await ready(page, "window.castleSample && document.querySelector('#start')");
    await page.evaluate(`localStorage.setItem("haengju1593-meta", ${JSON.stringify(JSON.stringify(meta))})`);
    await page.view.navigate(url);
    await ready(page, "window.castleSample && !document.querySelector('#start').disabled");
    await page.tapElement("#start");
    await ready(page, "document.querySelector('[data-bph-start]')");
    if (!await page.tapElement(`[aria-label="${general} 선택"]`)) throw new Error(`${general} cannot be selected`);
    await page.tapElement("[data-bph-start]");
    await passFirstBattleGuide(page);
    await ready(page, "!castleSample.snapshot().attract && !castleSample.snapshot().paused");
    await bindGame(page);
    await play(page);
    if (page.errors.length) throw new Error(page.errors.join("\n"));
  } finally {
    page.view.close(); await rm(profile, { recursive: true, force: true });
  }
}
const painted = (page: Page) => page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
type Clip = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
async function zoom(page: Page, clip: Clip, scale: number, path: string): Promise<void> {
  const x = Math.max(0, Math.min(390 - clip.width, clip.x)), y = Math.max(0, Math.min(844 - clip.height, clip.y));
  const shot = await page.view.cdp("Page.captureScreenshot", { format: "png", clip: { ...clip, x, y, scale } });
  const data = at(shot, "data");
  if (typeof data !== "string") throw new Error(`Missing zoomed capture: ${path}`);
  await Bun.write(path, Buffer.from(data, "base64"));
}
const evidence: Record<string, unknown> = { bodies };
try {
  const battles: unknown[] = [];
  for (const { general, actor } of [...reference, ...others].filter(body => BPH_GENERALS.some(name => name === body.general)))
    await battle(general, async page => {
      for (const [moment, frame] of [["windup", 1], ["attack", 2]] as const) {
        const seen = await page.evaluate(commanderFrame(actor, ["front", "back", "side"].map(direction => cell(actor, direction, "attack", frame))));
        if (at(seen, "scaleX") !== at(seen, "scaleY") || Math.abs(Number(at(seen, "scaleX"))) !== 1)
          throw new Error(`${general} is not drawn at the reference 1x scale: ${JSON.stringify(seen)}`);
        await page.shot(`${out}/battle-${actor}-${moment}-390x844.png`);
        await zoom(page, { x: Number(at(seen, "screen", "x")) - 60, y: Number(at(seen, "screen", "y")) - 60, width: 120, height: 120 },
          4, `${out}/battle-${actor}-${moment}-zoom4x.png`);
        battles.push({ general, actor, moment, seen });
        console.log(`FULLSET_BATTLE_OK=${actor} ${moment} ${String(at(seen, "texture"))} cell ${String(at(seen, "frame"))}`);
        await page.evaluate("__fullsetGame.loop.wake()");
      }
    });
  evidence.battles = battles;
  const bosses: unknown[] = [], bossIds = FULL_BOSS_ART.filter(id => id === "konishi" || id in installed.sets);
  await battle("권율", async page => {
    await ready(page, "castleSample.snapshot().enemyUnits.some(enemy => !enemy.boss && enemy.kind !== 'ship')");
    for (const [index, boss] of bossIds.entries()) {
      const chief = boss === "ukita";
      const seen = await page.evaluate(bossContact(boss, chief ? "ukita" : "samurai", BOSSES[boss].pattern, 880000 + index));
      if (at(seen, "scaleX") !== at(seen, "scaleY") || Math.abs(Number(at(seen, "scaleX"))) !== bodyScale(true, chief, true))
        throw new Error(`${boss} is not drawn at the full-body scale: ${JSON.stringify(seen)}`);
      await page.shot(`${out}/boss-${boss}-attack-390x844.png`);
      await zoom(page, { x: Number(at(seen, "screen", "x")) - 60, y: Number(at(seen, "screen", "y")) - 60, width: 120, height: 120 },
        4, `${out}/boss-${boss}-attack-zoom4x.png`);
      bosses.push({ boss, seen });
      console.log(`FULLSET_BOSS_OK=${boss} frame ${String(at(seen, "frame"))}`);
      await page.evaluate(`(() => { const foes = castleSample.snapshot().enemyUnits; foes.splice(foes.findIndex(enemy => enemy.id === ${880000 + index}), 1);
        __fullsetGame.loop.wake(); })()`);
    }
  });
  evidence.bosses = bosses;
  await battle("권율", async page => {
    const area = await page.evaluate(LINEUP), lineup: Record<string, unknown> = {};
    const clip = { x: Number(at(area, "x")), y: Number(at(area, "y")), width: Number(at(area, "width")), height: Number(at(area, "height")) };
    for (let start = 0, number = 1; start < others.length; start += PER_PAGE, number++) {
      await page.evaluate(`__fullsetLineup(${JSON.stringify([...reference, ...others.slice(start, start + PER_PAGE)])}, ${number})`);
      for (const [stance, strike, index] of [["idle", false, 0], ["attack", true, 2]] as const) {
        const rows = list(await page.evaluate(`__fullsetStance(${strike})`));
        for (const row of rows) {
          const actor = String(at(row, "actor")), direction = at(row, "direction");
          const expected = rows.find(other => at(other, "actor") === REFERENCE && at(other, "direction") === direction);
          if (at(row, "texture") !== `ally-sheet-${actor}` || Number(at(row, "frame")) !== cell(actor, String(direction), stance, index))
            throw new Error(`Wrong ${stance} frame: ${JSON.stringify(row)}`);
          for (const key of strike ? ["scaleX", "scaleY", "logical", "source"] : ["scaleX", "scaleY", "width", "height", "logical", "source", "anchor"])
            if (JSON.stringify(at(row, key)) !== JSON.stringify(at(expected, key)))
              throw new Error(`${actor} ${stance} ${key} differs from ${REFERENCE}: ${JSON.stringify(row)}`);
        }
        await painted(page);
        await page.shot(`${out}/lineup-${stance}-p${number}-390x844.png`);
        await zoom(page, clip, 3, `${out}/lineup-${stance}-p${number}-zoom3x.png`);
        lineup[`p${number}-${stance}`] = rows;
      }
    }
    evidence.lineup = lineup;
    const sets = await page.evaluate(setChecks(bodies.map(body => body.actor)));
    for (const { actor } of bodies) {
      for (const pose of list(at(sets, actor, "poses")))
        if (at(pose, "registered") !== at(pose, "count") || at(pose, "observed") !== at(pose, "count"))
          throw new Error(`Animation count mismatch: ${JSON.stringify(pose)}`);
      if (JSON.stringify(at(sets, actor, "feet")) !== JSON.stringify(at(sets, REFERENCE, "feet")))
        throw new Error(`${actor} foot rows differ from ${REFERENCE}: ${JSON.stringify(at(sets, actor, "feet"))}`);
    }
    evidence.sets = sets;
    for (const { actor } of bodies) {
      const picture = await page.evaluate(sheet(actor));
      if (typeof picture !== "string") throw new Error(`Missing 8x sheet for ${actor}`);
      await Bun.write(`${out}/sheet-8x-${actor}.png`, Buffer.from(picture, "base64"));
    }
  });
  await Bun.write(`${out}/runtime.json`, JSON.stringify(evidence, null, 2));
  console.log(`FULLSET_REVIEW_RESULT=PASS sets=${bodies.map(body => body.actor).join(",")}`);
} finally {
  server.stop(true);
}
