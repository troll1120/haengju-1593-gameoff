// Dense-crowd proof that head bars stay on their own unit (owner 2026-11-18: bars may overlap, they must not climb away).
// Packs allied soldiers, their general and wounded enemies into clumps in the dev unit sandbox, whose manual clock keeps the
// frame still, then reads every bar the renderer drew for the captured frame and compares it with the slot on its own
// unit's head.
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { reviewBrowserSession } from "./review-browser";

const [folder, label = "after", mode = "measure"] = Bun.argv.slice(2);
if (!folder) throw new Error("An evidence folder is required");
if (mode !== "measure" && mode !== "assert") throw new Error("The mode is measure or assert");
const out = resolve(folder), VIEWPORT = [390, 844] as const;
await mkdir(out, { recursive: true });

/** `side` picks the open strip left (-1) or right (1) of the fort; the counts fill one clump there. */
const SCENES = [
  { name: "ally-crowd", side: -1, soldiers: 32, enemies: 3 },
  { name: "enemy-crowd", side: 1, soldiers: 6, enemies: 18 },
] as const;
/** Seconds of the attack clock the gauges are filled against. */
const SWING = 1.2;
/** One drawn bar: `y` is the slot on its own unit's head, `drawnY` where the renderer put it. */
type Bar = { side: "ally" | "enemy"; unit: string; bar: "hp" | "attack"; headX: number; headY: number;
  x: number; y: number; w: number; h: number; drawnY: number; share: number };
type Frame = { field: { width: number; height: number }; canvas: { x: number; y: number; width: number; height: number };
  generals: number; soldiers: number; enemies: number; bars: Bar[] };

const arrange = (scene: typeof SCENES[number]) => `(async () => {
  const { addBphProfile } = await import("/src/bph-combat.ts");
  const { createRun } = await import("/src/rules.ts");
  const geometry = await import("/src/geometry.ts");
  castleSample.sandbox.start("권율");
  const run = castleSample.sandbox.run(), squad = run.squads[0], wall = geometry.fortRect(run.fort);
  if (run.squads.length !== 1 || squad.state === "down") throw new Error("The sandbox no longer starts with one standing general");
  const scene = ${JSON.stringify(scene)};
  const at = { x: Math.round(scene.side < 0 ? wall.left / 2 : (wall.right + geometry.WIDTH) / 2), y: geometry.CENTER.y + 70 };
  const foot = () => squad.soldiers.filter(unit => unit.perch === undefined && unit.kind !== "panokseon");
  for (let pack = 0; foot().length < scene.soldiers; pack++) {
    if (pack > 16) throw new Error("Recruits did not join the squad");
    addBphProfile(run, { profileId: pack % 2 ? "Hero1_Barbarian" : "Hero1_Squire", copies: Math.min(8, scene.soldiers - foot().length),
      foil: false, discovered: false }, { packId: "Pack1_Basic" });
  }
  const health = [.3, .55, .8, 1, .45, .7, .25, 1];
  foot().forEach((unit, index) => Object.assign(unit, {
    x: at.x + (index % 6 - 2.5) * 9 + (Math.floor(index / 6) % 2 ? 4 : 0), y: at.y + (Math.floor(index / 6) - 2.5) * 10,
    emerging: false, hp: unit.maxHp * health[index % health.length], clock: ${SWING}, strikeAt: 0 }));
  Object.assign(squad, { x: at.x, y: at.y + 4, hp: squad.maxHp * .55, clock: ${SWING}, strikeAt: 0 });
  const foe = createRun(144).enemies[0], wounds = [.35, .6, .8, .5, .25, .7];
  run.enemies = Array.from({ length: scene.enemies }, (_, index) => {
    const x = at.x + (scene.enemies > 3 ? (index % 5 - 2) * 10 + (Math.floor(index / 5) % 2 ? 5 : 0) : [-14, 13, 3][index]);
    const y = at.y + (scene.enemies > 3 ? (Math.floor(index / 5) - 1.5) * 11 : [6, -9, 21][index]);
    return { ...foe, id: run.nextId++, kind: "yari", x, y, goalX: x, goalY: y, hp: 100 * wounds[index % wounds.length], maxHp: 100,
      speed: 0, elite: false, boss: false, wave: false, clock: 1e9, strikeAt: 0, prey: null, stun: 1e9, skillClock: 1e9 };
  });
  return { at, wall };
})()`;
/** The gauge fills from the clock the renderer last saw reset, so the clocks drop only after one frame has drawn them full. */
const CHARGE = `(() => {
  const squad = castleSample.sandbox.run().squads[0], fill = [1, .35, .6, .8, 1, .5, .9, .25];
  squad.clock = ${SWING} * .3;
  squad.soldiers.forEach((unit, index) => { unit.clock = ${SWING} * (1 - fill[index % fill.length]); });
  return true;
})()`;
const PROBE = `(async () => {
  const { restingHealthAnchor } = await import("/src/sprite-health.ts");
  const { PALETTE } = await import("/src/presentation.ts");
  const scene = globalThis.__barScene, graphics = scene.bars, round = Math.round;
  let fills = [], colour = -1;
  const fillStyle = graphics.fillStyle, fillRect = graphics.fillRect, clear = graphics.clear;
  graphics.fillStyle = function (value, alpha) { colour = value; return fillStyle.call(this, value, alpha); };
  graphics.fillRect = function (x, y, w, h) { fills.push({ colour, x, y, w, h }); return fillRect.call(this, x, y, w, h); };
  graphics.clear = function () { fills = []; colour = -1; return clear.call(this); };
  // Every unit bar is three fills: the outline, the dark track inset by one pixel, then the coloured share.
  const drawn = () => {
    const bars = [];
    for (let index = 0; index + 2 < fills.length; index++) {
      const edge = fills[index], track = fills[index + 1], share = fills[index + 2];
      // The castle core uses the same fill pattern at width 56; only unit head bars are 22 or 40.
      if (edge.w !== 22 && edge.w !== 40) continue;
      if (edge.colour !== PALETTE.outline || track.colour !== PALETTE.dark || track.x !== edge.x + 1 || track.y !== edge.y + 1
        || track.w !== edge.w - 2 || track.h !== edge.h - 2) continue;
      bars.push({ x: edge.x, y: edge.y, w: edge.w, h: edge.h, fill: share.colour, filled: share.w });
      index += 2;
    }
    return bars;
  };
  // The slot on each unit's own head, in the order the renderer draws: enemies, then each general and his soldiers.
  const wanted = () => {
    const run = castleSample.sandbox.run(), bars = [];
    const slot = (side, unit, bar, fill, head, width, top, height) => bars.push({ side, unit, bar, fill, headX: head.x, headY: head.y,
      x: round(head.x) - width / 2, y: top, w: width, h: height });
    for (const enemy of run.enemies) {
      const head = restingHealthAnchor(scene.foes.get(enemy.id), scene.positions.get(enemy) ?? enemy);
      slot("enemy", "enemy-" + enemy.id, "hp", PALETTE.danger, head, 40, round(head.y), 5);
    }
    run.squads.forEach((squad, id) => {
      const troop = scene.troops[id], lead = restingHealthAnchor(troop.leader.sprite, troop.leader.rest);
      if (squad.hp < squad.maxHp) slot("ally", "general-" + id, "hp", PALETTE.ally, lead, 40, round(lead.y - 6), 5);
      slot("ally", "general-" + id, "attack", PALETTE.gold, lead, 40, round(lead.y), 4);
      squad.soldiers.forEach((unit, index) => {
        const head = restingHealthAnchor(troop.troopers[index].sprite, troop.troopers[index].rest);
        if (unit.hp < unit.maxHp) slot("ally", "soldier-" + unit.id, "hp", PALETTE.ally, head, 22, round(head.y) - 5, 4);
        slot("ally", "soldier-" + unit.id, "attack", PALETTE.gold, head, 22, round(head.y), 4);
      });
    });
    return bars;
  };
  const here = unit => { const at = scene.positions.get(unit); return Boolean(at) && Math.hypot(at.x - unit.x, at.y - unit.y) < .01; };
  const settled = () => {
    const run = castleSample.sandbox.run();
    return scene.troops.length === run.squads.length && run.enemies.every(enemy => scene.foes.has(enemy.id) && here(enemy))
      && run.squads.every((squad, id) => scene.troops[id].troopers.length === squad.soldiers.length && here(squad)
        && squad.soldiers.every((unit, index) => scene.troops[id].troopers[index].unitId === unit.id && here(unit)));
  };
  const key = bar => [bar.x, bar.w, bar.h, bar.fill].join("|");
  /** Which head slots have no drawn bar of their column, width and colour, and which drawn bars belong to no slot. */
  const strays = (want, got) => {
    const left = new Map();
    for (const bar of got) left.set(key(bar), (left.get(key(bar)) ?? 0) + 1);
    const missing = want.filter(bar => { const count = left.get(key(bar)) ?? 0; left.set(key(bar), count - 1); return count <= 0; });
    const extra = got.filter(bar => { const count = left.get(key(bar)) ?? 0; left.set(key(bar), count - 1); return count > 0; });
    return { wanted: want.length, drawn: got.length, missing, extra };
  };
  globalThis.__barProbe = {
    // The general's bars stay hidden while he walks in; his attack gauge is the only bar this wide and this thin.
    ready: () => settled() && drawn().some(bar => bar.w === 40 && bar.h === 4),
    state: () => ({ settled: settled(), drawn: drawn().length }),
    frame() {
      const run = castleSample.sandbox.run(), want = wanted(), got = drawn(), box = scene.sys.game.canvas.getBoundingClientRect();
      if (got.length !== want.length) throw new Error("Drawn bars differ from the head slots: " + JSON.stringify({ ...strays(want, got),
        roster: run.squads.map(squad => squad.soldiers.map(unit => unit.kind + (unit.perch === undefined ? "" : "@wall")
          + (unit.hp > 0 && unit.downUntil <= run.time ? "" : "!out") + (unit.hp < unit.maxHp ? "-" : ""))) }));
      return { field: castleSample.snapshot().field, canvas: { x: box.x, y: box.y, width: box.width, height: box.height },
        generals: run.squads.length, soldiers: run.squads.reduce((sum, squad) => sum + squad.soldiers.length, 0), enemies: run.enemies.length,
        bars: want.map(({ fill, ...bar }, index) => {
          const seen = got[index];
          if (seen.x !== bar.x || seen.w !== bar.w || seen.h !== bar.h || seen.fill !== fill)
            throw new Error("Draw order no longer matches the units: " + JSON.stringify({ index, bar, seen }));
          return { ...bar, drawnY: seen.y, share: seen.filled / (bar.w - 2) };
        }) };
    },
  };
  return true;
})()`;
const wait = (condition: string, failure: string) => `new Promise((resolve, reject) => {
  const deadline = performance.now() + 90000;
  (function frame() {
    if (${condition}) return resolve(true);
    if (performance.now() > deadline) return reject(new Error(${failure}));
    requestAnimationFrame(frame);
  })();
})`;
/** Phaser steps first in a frame, so this stops the loop on a frame it has just drawn and reads that same frame. */
const FREEZE = `new Promise((resolve, reject) => requestAnimationFrame(() => {
  try { globalThis.__barScene.sys.game.loop.sleep(); resolve(globalThis.__barProbe.frame()); }
  catch (error) { reject(error); }
}))`;
const tally = (bars: readonly Bar[]) => {
  const lifts = bars.map(bar => bar.y - bar.drawnY);
  return { bars: bars.length, displaced: lifts.filter(lift => lift !== 0).length, maxLift: Math.max(0, ...lifts.map(Math.abs)) };
};

const browser = reviewBrowserSession();
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
let errors: string[] = [];
try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("No preview address");
  const page = await browser.open(...VIEWPORT);
  errors = page.errors;
  await page.view.navigate(`http://127.0.0.1:${address.port}/?unitSandbox=1`);
  await page.evaluate(wait(`window.castleSample?.sandbox && !document.querySelector("#start").disabled`, `"The sandbox did not load"`));
  type Property = { name: string; value?: { objectId?: string } };
  const properties = (objectId: string) => page.view.cdp("Runtime.getProperties", { objectId, ownProperties: true }) as Promise<{
    result: Property[]; internalProperties?: Property[];
  }>;
  const scenes = [];
  for (const scene of SCENES) {
    const placed = await page.evaluate(arrange(scene));
    if (!scenes.length) {
      // The renderer lives in the game module's scope; reach it through a function that closes over it.
      const snapshot = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" }) as { result: { objectId: string } };
      const scopes = (await properties(snapshot.result.objectId)).internalProperties?.find(property => property.name === "[[Scopes]]")?.value?.objectId;
      if (!scopes) throw new Error("Game scopes not found");
      let renderer: string | undefined;
      for (const scope of (await properties(scopes)).result) if (scope.value?.objectId && !renderer)
        renderer = (await properties(scope.value.objectId)).result.find(property => property.name === "arenaScene")?.value?.objectId;
      if (!renderer) throw new Error("Renderer binding not found");
      await page.view.cdp("Runtime.callFunctionOn", { objectId: renderer,
        functionDeclaration: "function(){globalThis.__barScene=this;return true}", returnByValue: true });
      await page.evaluate(PROBE);
    }
    await page.evaluate(wait("globalThis.__barProbe.ready()", `"The crowd did not settle: " + JSON.stringify(globalThis.__barProbe.state())`));
    await page.evaluate(CHARGE);
    const frame = await page.evaluate(FREEZE) as Frame;
    const shot = `${label}-${scene.name}-${VIEWPORT.join("x")}.png`;
    await page.shot(`${out}/${shot}`);
    await page.evaluate("globalThis.__barScene.sys.game.loop.wake()");
    const summary = { scene: scene.name, shot, ...tally(frame.bars),
      allyHealth: tally(frame.bars.filter(bar => bar.side === "ally" && bar.bar === "hp")),
      allyAttack: tally(frame.bars.filter(bar => bar.bar === "attack")),
      enemyHealth: tally(frame.bars.filter(bar => bar.side === "enemy")),
      cssPerFieldPixel: frame.canvas.width / frame.field.width };
    console.log("HEAD_BARS", JSON.stringify({ label, ...summary }));
    scenes.push({ ...summary, placed, frame });
  }
  await Bun.write(`${out}/${label}-capture.json`, JSON.stringify({ label, mode, viewport: VIEWPORT, scenes, errors }, null, 2));
  if (errors.length) throw new Error(errors.join("\n"));
  const strayed = scenes.filter(scene => scene.displaced);
  if (mode === "assert" && strayed.length)
    throw new Error(`Bars left their own units: ${strayed.map(scene => `${scene.scene} ${scene.displaced}/${scene.bars}`).join(", ")}`);
} catch (error) {
  await Bun.write(`${out}/${label}-capture-failure.json`, JSON.stringify({ error: String(error), errors }, null, 2));
  console.error("CAPTURE_FAILED", JSON.stringify({ error: String(error), errors }));
  throw error;
} finally {
  await browser.close();
  await server.close();
}
console.log("CAPTURE_HEAD_BARS exit=0");
