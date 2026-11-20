import { afterAll, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { soldier } from "../src/rules";
import { reviewBrowserSession, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

const session = reviewBrowserSession(["--single-process", "--no-zygote", "--disable-gpu"]);
afterAll(() => session.close());

function field(value: unknown, ...keys: readonly string[]): unknown {
  for (const key of keys) {
    if (typeof value !== "object" || value === null) throw new Error(`Missing CDP field ${key}`);
    value = Reflect.get(value, key);
  }
  return value;
}
function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("Missing CDP list");
  return value;
}

test.each([[390, 844], [1440, 900]] as const)(
  "a general beside a crowded boss stays in place and receives a tap at its drawn body (%ix%i)",
  async (width, height) => {
    const root = resolve(import.meta.dir, "..");
    const out = resolve(process.env.BOSS_DISPLAY_OUT ?? `${root}/review/boss-display/after`);
    await mkdir(out, { recursive: true });
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, process.env.BOSS_DISPLAY_DIST ?? `${root}/review-dist`) });
    const page = await session.open(width, height);
    await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=1593`);
    const ready = (condition: string) => page.evaluate(`new Promise((resolve, reject) => {
      const end = Date.now() + 25000;
      function frame() {
        if (${condition}) resolve(true);
        else if (Date.now() > end) reject(new Error("Boss fixture condition: " + ${JSON.stringify(condition)}));
        else setTimeout(frame, 10);
      } frame();
    })`);
    try {
      await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
      const fn = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" });
      const props = await page.view.cdp("Runtime.getProperties", { objectId: field(fn, "result", "objectId") });
      const scopeProperty = list(field(props, "internalProperties")).find(p => field(p, "name") === "[[Scopes]]");
      const scopes = await page.view.cdp("Runtime.getProperties", { objectId: field(scopeProperty, "value", "objectId") });
      let bound = false;
      for (const scope of list(field(scopes, "result"))) {
        if (field(scope, "name") === "length" || bound) continue;
        const variables = await page.view.cdp("Runtime.getProperties", { objectId: field(scope, "value", "objectId"), ownProperties: true });
        for (const variable of list(field(variables, "result"))) {
          if (field(variable, "value", "type") !== "object") continue;
          const id = field(variable, "value", "objectId");
          if (!id) continue;
          const result = await page.view.cdp("Runtime.callFunctionOn", { objectId: id, returnByValue: true,
            functionDeclaration: "function(){if(this.scene&&this.textures&&this.canvas){globalThis.__bossSheet=this.textures.get('ally-sheet-gwon_yul').getSourceImage();return true}return false}" });
          if (field(result, "result", "value") === true) { bound = true; break; }
        }
      }
      expect(bound).toBe(true);
      await page.evaluate(`new Promise(resolve => {
        const native = requestAnimationFrame.bind(window); window.__bossFrames = [];
        window.requestAnimationFrame = callback => window.__bossFrames.push(callback);
        native(() => native(() => resolve(true)));
      })`);
      await page.evaluate(`(() => {
        window.__bossNow = performance.now();
        Object.defineProperty(performance, "now", { configurable: true, value: () => window.__bossNow });
        window.__bossStep = () => {
          window.__bossNow += 1000 / 60;
          for (const callback of window.__bossFrames.splice(0)) callback(window.__bossNow);
        };
        for (let i = 0; i < 180; i++) window.__bossStep();
        document.querySelector("#start").click();
      })()`);
      await ready("document.querySelector('[data-bph-start]')");
      await page.evaluate("document.querySelector('[data-bph-start]').click()");
      await passFirstBattleGuide(page);
      await page.evaluate(`(() => {
        for (let i = 0; i < 180; i++) window.__bossStep();
        const s = castleSample.snapshot(), x = s.field.width / 2 - 35, y = 200;
        const hero = { ...s.squads[0], x, y, homeX: x, homeY: y, targetX: x, targetY: y,
          hp: 1e9, maxHp: 1e9, clock: 1e6, strikeAt: 0, skillClock: 0, safeUntil: 0 };
        hero.soldiers = [-22, 10, 30].map((dx, i) => ({
          ...${JSON.stringify(soldier("spearman"))}, id: 8000 + i, x: x + dx, y: y + 16,
          hp: 1e9, maxHp: 1e9, clock: 1e6, strikeAt: 0, emerging: false,
        }));
        s.squads.splice(0, s.squads.length, hero);
        const enemy = { id: 9000, kind: "yari", bossArt: "konishi", direction: "위",
          x: x + 30, y: y + 6, hp: 1e9, maxHp: 1e9, speed: 0, elite: false, boss: true,
          wave: false, ladder: false, goalX: x + 30, goalY: y + 6,
          clock: 1e6, strikeAt: 0, prey: null, stun: 1e6, burn: 0, burnClock: 0,
          skillClock: 1e6, casting: 0, casts: 0 };
        s.enemyUnits.splice(0, s.enemyUnits.length, enemy,
          ...[-16, 12, 24].map((dx, i) => ({ ...enemy, id: 9001 + i, kind: "yari",
            bossArt: undefined, boss: false, x: x + 30 + dx, y: y + 22 + i * 7 })));
        s.shots.splice(0); s.bph.packs.splice(0); s.bph.tomes.splice(0);
        window.__bossDraws = [];
        const drawImage = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
          if (this.canvas === document.querySelector("#arena canvas")
            && image === window.__bossSheet) {
            const m = this.getTransform();
            window.__bossDraws.push({ x: m.e, y: m.f });
          }
          return drawImage.call(this, image, ...args);
        };
        for (let i = 0; i < 90; i++) {
          window.__bossDraws.length = 0; window.__bossStep();
        }
      })()`);
      await page.shot(`${out}/${width}x${height}.png`);
      const measurement = await page.evaluate(`(() => {
        const s = castleSample.snapshot(), hero = s.squads[0], draws = window.__bossDraws;
        if (draws.length !== 1) throw new Error("Expected one rendered general, got " + JSON.stringify(draws));
        const body = draws[0], canvas = document.querySelector("#arena canvas").getBoundingClientRect();
        return { combat: { x: hero.x, y: hero.y }, drawn: body, sourceType: __bossSheet.constructor.name,
          offset: Math.hypot(body.x - hero.x, body.y - (hero.y - 16)),
          tap: { x: canvas.left + body.x / s.field.width * canvas.width,
            y: canvas.top + body.y / s.field.height * canvas.height },
          skillsBefore: s.metrics.skills[0], skillClock: hero.skillClock, enemies: s.enemies };
      })()`);
      if (!measurement || typeof measurement !== "object") throw new Error("Missing rendered boss fixture");
      const point = Reflect.get(measurement, "tap");
      if (!point || typeof point !== "object") throw new Error("Missing visible general position");
      const x = Reflect.get(point, "x"), y = Reflect.get(point, "y");
      if (typeof x !== "number" || typeof y !== "number") throw new Error("Invalid visible general position");
      // A native touch enters the real Phaser pointer handlers while RAF remains held.
      const strikesBefore = Number(await page.evaluate("castleSample.snapshot().bph.fxEvents.filter(e => e.kind === 'strike').length"));
      await page.tap({ x, y });
      const skillsAfter = await page.evaluate("castleSample.snapshot().metrics.skills[0]");
      const strikes = await page.evaluate(`castleSample.snapshot().bph.fxEvents.filter(e => e.kind === 'strike')
        .slice(${strikesBefore}).map(e => ({ x: e.x, y: e.y }))`);
      await Bun.write(`${out}/${width}x${height}.json`, JSON.stringify({ measurement, skillsAfter, strikes, errors: page.errors }, null, 2));
      // A general's skill fires only from his portrait (442d7fe8): the tap on his drawn body lands on
      // the field as one tap strike at the drawn body, and the skill count stays put.
      expect(skillsAfter).toBe(Number(Reflect.get(measurement, "skillsBefore")));
      if (!Array.isArray(strikes) || strikes.length !== 1) throw new Error("Expected one tap strike, got " + JSON.stringify(strikes));
      const body = Reflect.get(measurement, "drawn");
      if (!body || typeof body !== "object") throw new Error("Missing drawn general position");
      expect(Math.hypot(Number(strikes[0].x) - Number(Reflect.get(body, "x")),
        Number(strikes[0].y) - Number(Reflect.get(body, "y")))).toBeLessThanOrEqual(1.5);
      expect(Reflect.get(measurement, "offset")).toBeLessThanOrEqual(1.5); // renderer rounds to physical pixels
      expect(page.errors).toEqual([]);
    } finally {
      await session.reset(); server.stop(true);
    }
  }, 60000);
