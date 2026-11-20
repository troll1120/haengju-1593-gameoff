import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chaosArena, chaosEnemy } from "../src/chaos-test-fixture";
import { setFieldSize } from "../src/geometry";
import { passFirstBattleGuide, reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";

const [build, folder, label] = Bun.argv.slice(2);
assert(build && folder && (label === "before" || label === "after"),
  "Usage: bun scripts/capture-overlay-cleanup.ts <build-dir> <output-dir> <before|after>");
const out = resolve(folder), dist = resolve(build);
await mkdir(out, { recursive: true });
const server = Bun.serve({
  port: 0, hostname: "127.0.0.1", fetch: request => previewResponse(request, dist),
});
const browser = reviewBrowserSession();

try {
  const page = await browser.open(390, 844);
  await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: 'localStorage.setItem("haengju1593", JSON.stringify({story:true,muted:true,firstBattleGuide:true}));',
  });
  await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
  const ready = (condition: string) => page.evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 45000;
    function check() {
      if (${condition}) return resolve(true);
      if (performance.now() > deadline) return reject(new Error(${JSON.stringify(condition)}));
      requestAnimationFrame(check);
    }
    check();
  })`);
  await ready("window.castleSample && document.querySelector('#start:not([disabled])')");
  assert(await page.tapElement("#start"));
  await ready("document.querySelector('[data-bph-start]')");
  assert(await page.tapElement("[data-bph-start]"));
  await passFirstBattleGuide(page);
  await ready("castleSample.snapshot().time > 1 && !castleSample.snapshot().paused");
  const field = await page.evaluate("castleSample.snapshot().field");
  assert(field && typeof field === "object" && "width" in field && "height" in field &&
    typeof field.width === "number" && typeof field.height === "number");
  const { width, height } = field;
  setFieldSize(width, height);

  // Like capture-round10, recover the actual compiled game and run from the snapshot closure.
  type Property = { readonly name: string; readonly value?: { readonly objectId?: string; readonly type?: string } };
  const properties = async (objectId: string) =>
    await page.view.cdp("Runtime.getProperties", { objectId, ownProperties: true }) as {
      readonly result: readonly Property[]; readonly internalProperties?: readonly Property[];
    };
  const snapshot = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" }) as {
    readonly result: { readonly objectId: string };
  };
  const scopes = (await properties(snapshot.result.objectId)).internalProperties
    ?.find(property => property.name === "[[Scopes]]")?.value?.objectId;
  assert(scopes, "Snapshot scopes missing");
  for (const scope of (await properties(scopes)).result) {
    if (!scope.value?.objectId) continue;
    for (const binding of (await properties(scope.value.objectId)).result) {
      if (binding.value?.type !== "object" || !binding.value.objectId) continue;
      await page.view.cdp("Runtime.callFunctionOn", {
        objectId: binding.value.objectId, returnByValue: true,
        functionDeclaration: `function() {
          if (this?.scene?.getScene && this.canvas) globalThis.__overlayGame = this;
          if (Array.isArray(this?.squads) && Array.isArray(this.enemies) && this.metrics && this.bph)
            globalThis.__overlayRun = this;
          return true;
        }`,
      });
    }
    if (await page.evaluate("Boolean(globalThis.__overlayGame && globalThis.__overlayRun)")) break;
  }
  assert(await page.evaluate(`(() => {
    if (!globalThis.__overlayGame || !globalThis.__overlayRun) return false;
    __overlayGame.loop.stop();
    const scene = globalThis.__overlayScene = __overlayGame.scene.getScene("castle");
    let now = scene.time.now + 2000, rng = 144;
    Math.random = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
    const dt = 1000 / 30;
    globalThis.__overlayFrame = (count, simulate = false) => {
      for (let i = 0; i < count; i++) {
        now += dt;
        scene.time.update(now, dt);
        scene.tweens.update(now, dt);
        scene.children.list.forEach(child => child.anims?.update(now, dt));
        scene.update(now, simulate ? dt : 0);
      }
      const renderer = __overlayGame.renderer;
      renderer.preRender();
      __overlayGame.scene.render(renderer);
      renderer.postRender();
    };
    return true;
  })()`), "Live game and run bindings missing");

  const portrait = (general: "이순신" | "곽재우") => JSON.stringify(`#skills button[data-general="${general}"]`);
  const install = async (general: "이순신" | "곽재우") => {
    const run = chaosArena(general, 1), squad = run.squads[0];
    squad.x = squad.homeX = squad.targetX = width * .3;
    squad.y = squad.homeY = squad.targetY = 210;
    const enemy = chaosEnemy(run, width * .55, 270);
    enemy.hp = enemy.maxHp = 1e9;
    assert(await page.evaluate(`(() => {
      const scene = __overlayScene, fixture = ${JSON.stringify(run)};
      scene.uniqueSkillView?.clear();
      scene.skillStage?.clear();
      scene.positions.clear();
      scene.entered.clear();
      scene.aim.cancel();
      scene.troops.forEach(troop => {
        troop.leader.sprite.destroy();
        troop.troopers.forEach(unit => { unit.sprite.destroy(); unit.prism?.destroy(); });
      });
      scene.troops = [];
      for (const foe of scene.foes.values()) foe.destroy();
      scene.foes.clear();
      scene.strides.clear();
      for (const missile of scene.missiles.values()) missile.destroy();
      scene.missiles.clear();
      for (const animation of document.querySelector("#cut-in").getAnimations({subtree:true})) animation.cancel();
      document.querySelector("#cut-in").hidden = true;
      const battle = __overlayRun.bph;
      for (const key of Object.keys(battle)) delete battle[key];
      Object.assign(battle, fixture.bph);
      fixture.bph = battle;
      for (const key of Object.keys(__overlayRun)) delete __overlayRun[key];
      Object.assign(__overlayRun, fixture);
      scene.accumulator = 0;
      scene.frames = 4;
      scene.hitStopUntil = 0;
      __overlayFrame(1);
      scene.entered.clear();
      return Boolean(document.querySelector(${portrait(general)} + ".ready:not([disabled])"));
    })()`), `${general} portrait is not ready`);
  };
  const cast = (general: "이순신" | "곽재우") => page.evaluate(`(() => {
    const button = document.querySelector(${portrait(general)});
    const before = __overlayRun.metrics.skills[0];
    button.click();
    return __overlayRun.metrics.skills[0] - before;
  })()`);
  const aimCommands = () => page.evaluate("__overlayScene.aimRing.commandBuffer.length");
  const freezeBanner = (ms: number) => page.evaluate(`(() => {
    for (const animation of document.querySelector("#cut-in").getAnimations({subtree:true})) {
      if (animation.effect.getComputedTiming().iterations === Infinity) continue;
      animation.pause();
      animation.currentTime = ${ms};
    }
    return true;
  })()`);

  await install("이순신");
  assert.equal(await page.evaluate("__overlayRun.chaos?.level"), 1, "Yi fixture must be Lv1");
  assert.equal(await cast("이순신"), 1, "Yi portrait click must cast exactly once");
  assert.equal(await page.evaluate(`__overlayRun.chaosSkills?.events.some(event =>
    event.kind === "ships" && event.level === 1)`), true, "Yi must schedule a Lv1 turtle-ship cast");
  await freezeBanner(180);
  await page.evaluate("(() => { __overlayFrame(15, true); return true; })()");
  assert.equal(await page.evaluate(`__overlayScene.children.list.some(child =>
    child.texture?.key === "geobukseon" && child.visible && child.alpha > 0)`), true,
    "The manual turtle-ship sprite must be visible in the captured frame");
  await page.shot(`${out}/yisunsin-${label}.png`);

  if (label === "after") {
    await install("곽재우");
    const startAim = async () => {
      await page.evaluate(`(() => {
        const x = __overlayRun.squads[0].x, aim = __overlayScene.aim;
        aim.touch({ x: x + 60, y: 170 });
        aim.drag({ x: x + 80, y: 160 }, 1);
        __overlayFrame(1);
        return true;
      })()`);
      const commands = await aimCommands();
      assert(typeof commands === "number" && commands > 0, "TapAim did not draw into the graphics buffer");
      return commands;
    };
    await startAim();
    await page.evaluate(`__overlayGame.canvas.dispatchEvent(new TouchEvent("touchcancel", { bubbles: true }))`);
    assert.equal(await aimCommands(), 0, "Canvas touchcancel did not clear the displayed ring immediately");
    await page.evaluate("(() => { __overlayFrame(1); return true; })()");
    assert.equal(await aimCommands(), 0, "The cancelled ring redrew");

    const aiming = await startAim();
    await page.shot(`${out}/ambush-aiming.png`);
    assert.equal(await cast("곽재우"), 1, "Gwak portrait click must cast exactly once");
    const immediate = await aimCommands();
    assert.equal(immediate, 0, "Successful Gwak cast did not immediately clear the displayed ring");
    assert.equal(await page.evaluate(`__overlayRun.chaosSkills?.events.some(event => event.kind === "militia")`), true,
      "Gwak portrait click did not start an ambush");
    await freezeBanner(180);
    await page.evaluate("(() => { __overlayFrame(1); return true; })()");
    const postRender = await aimCommands();
    assert.equal(postRender, 0, "The ring redrew when the cast was rendered");
    await page.shot(`${out}/ambush-after-cast.png`);
    console.log("AMBUSH_AIM_COMMANDS", { aiming, immediate, postRender, cancelled: 0 });
  }
  for (const message of page.errors) console.log("BROWSER_DIAGNOSTIC", message);
  const unexpected = page.errors.filter(message =>
    label !== "after" || message !== 'warning: Texture "%s" has no frame "%s" uibyeong 14');
  assert.deepEqual(unexpected, []);
} finally {
  try { await browser.close(); } finally { server.stop(true); }
}
console.log("OVERLAY_CLEANUP_CAPTURES_DONE", label);
