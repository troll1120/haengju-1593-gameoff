import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

type Box = { left: number; top: number; right: number; bottom: number };
type Motion = "moving" | "reduced" | "switched";
/** How much of each sampled spot the banner hides: 0 shows the field whole, 1 hides it. */
type Cover = { round: number; strip: number; corner: number; far: number };
type Raised = { view: { width: number; height: number }; banner: Box; clock: Box; slides: boolean; wipes: boolean; fades: boolean };
type Cast = { rest: Box; raised: Raised; warned: Cover; clear: Cover; errors: string[] };

// Two enemy warnings and four sampled spots, in the banner's own CSS pixels. Every spot sits where the band is solid (its left 42%,
// below its top quarter): the middle of a round warning, a point on a lane that crosses the banner at 45 degrees, a point inside
// that lane's bounding box but off the lane itself, and a point clear of both.
const ROUND = { x: 150, y: 80, radius: 12 }, LANE = { from: { x: 40, y: 150 }, to: { x: 150, y: 40 }, radius: 9 };
const SPOTS = { round: { x: 150, y: 80 }, strip: { x: 122, y: 68 }, corner: { x: 60, y: 50 }, far: { x: 20, y: 80 } };
const MARKS = [900001, 900002];
/** Over a warning the banner may hide at most this much of the field; clear of one it stays at least this solid. */
const THIN = .3, SOLID = .95;
const FRAMES = "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))";

async function cast(width: number, height: number, motion: Motion): Promise<Cast> {
  const root = resolve(import.meta.dir, ".."), out = resolve(process.env.CASTLE_CUT_IN_EVIDENCE ?? `${root}/review/cut-in-layout`);
  const name = `${out}/top-banner-${width}x${height}-${motion}`;
  await mkdir(out, { recursive: true });
  const profile = await mkdtemp(`${out}/chrome-profile-`);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, process.env.CASTLE_TEST_DIST ?? `${root}/review-dist`) });
  const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
  const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 25000;
    function check() {
      if (${expression}) resolve(true);
      else if (performance.now() > deadline) reject(new Error("Layout condition not reached: " + ${JSON.stringify(expression)}));
      else requestAnimationFrame(check);
    } check();
  })`);
  try {
    const base = `http://127.0.0.1:${server.port}`;
    if (motion === "reduced") await phone.view.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    if (motion === "switched") {
      await phone.view.navigate(base);
      await phone.evaluate(`localStorage.setItem("haengju1593", JSON.stringify({ motionOff: true }))`);
    }
    await phone.view.navigate(`${base}/?seed=7`);
    await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
    await ready(`document.querySelector('#toggle-motion').getAttribute('aria-pressed') === '${motion === "switched"}'`);
    expect(await phone.tapElement("#start")).toBe(true);
    await ready("document.querySelector('[data-bph-start]')");
    expect(await phone.tapElement("[data-bph-start]")).toBe(true);
    await ready("!castleSample.snapshot().attract");
    await passFirstBattleGuide(phone);
    await ready("!castleSample.snapshot().paused && castleSample.snapshot().enemyUnits.length > 0"
      + " && document.querySelector('#skills .skill-portrait')?.complete");
    // The banner's place at rest, the two warnings under it, a foe in reach so the cast has a target, and a watch that holds the
    // banner at its middle frame the moment the cast raises it. No foe may fall or add a warning of its own while it is read.
    const rest: Box = JSON.parse(String(await phone.evaluate(`(() => {
      const run = castleSample.snapshot(), squad = run.squads[0], foe = run.enemyUnits[0];
      const banner = document.getElementById("cut-in"), field = document.querySelector("#arena canvas").getBoundingClientRect();
      banner.hidden = false; const box = banner.getBoundingClientRect(); banner.hidden = true;
      const scale = run.field.width / field.width;
      const at = spot => ({ x: (box.left + spot.x - field.left) * scale, y: (box.top + spot.y - field.top) * scale });
      squad.hp = squad.maxHp = 1e8; squad.skillClock = 0;
      Object.assign(foe, { x: squad.x + 35, y: squad.y + 15, speed: 0 });
      for (const enemy of run.enemyUnits) Object.assign(enemy, { hp: 1e8, maxHp: 1e8, skillClock: 1e8 });
      const mark = { owner: foe.id, skill: "salvo", startedAt: run.time - 600, at: run.time + 600, damage: 0, wallDamage: 0 };
      const round = ${JSON.stringify(ROUND)}, lane = ${JSON.stringify(LANE)}, from = at(lane.from);
      run.telegraphs.splice(0, run.telegraphs.length,
        { ...mark, id: ${MARKS[0]}, shape: "circle", ...at(round), fromX: foe.x, fromY: foe.y, radius: round.radius * scale },
        { ...mark, id: ${MARKS[1]}, shape: "lane", ...at(lane.to), fromX: from.x, fromY: from.y, radius: lane.radius * scale });
      new MutationObserver((_, watch) => {
        if (banner.hidden) return;
        watch.disconnect();
        const moving = [banner, ...banner.children].flatMap(node => node.getAnimations());
        for (const animation of moving) { animation.pause(); animation.currentTime = Number(animation.effect.getComputedTiming().duration) / 2; }
        window.__cutInHeld = moving.length;
      }).observe(banner, { attributes: true, attributeFilter: ["hidden"] });
      return JSON.stringify({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
    })()`)));
    await ready("document.querySelector('#skills .skill.ready')");
    expect(await phone.tapElement("#skills .skill.ready")).toBe(true);
    await ready("window.__cutInHeld > 0");
    const raised: Raised = JSON.parse(String(await phone.evaluate(`(() => {
      const banner = document.getElementById("cut-in"), face = banner.querySelector("img");
      const moving = [banner, ...banner.children].flatMap(node => node.getAnimations());
      const frame = share => {
        for (const animation of moving) animation.currentTime = Number(animation.effect.getComputedTiming().duration) * share;
        const style = getComputedStyle(banner);
        return { face: face.getBoundingClientRect().left, clip: style.clipPath, opacity: Number(style.opacity) };
      };
      const early = frame(.05), middle = frame(.5);
      const box = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
      return JSON.stringify({ view: { width: innerWidth, height: innerHeight }, banner: box(banner), clock: box(document.getElementById("clock")),
        slides: early.face !== middle.face, wipes: early.clip !== middle.clip, fades: early.opacity !== middle.opacity });
    })()`)));
    /** Reads how much of each spot the banner hides. The field is hidden and the page shown once on black and once on white, so
     *  what differs between the two shots is exactly what the banner lets through. Foes are silenced first, and a reading only
     *  counts while the warnings on the field are the ones this test left there and no card choice has opened over the banner. */
    const cover = async (marks: readonly number[]): Promise<Cover> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await phone.evaluate(`(() => {
          const run = castleSample.snapshot();
          for (const enemy of run.enemyUnits) Object.assign(enemy, { hp: 1e8, maxHp: 1e8, skillClock: 1e8 });
          run.telegraphs.splice(0, run.telegraphs.length, ...run.telegraphs.filter(mark => ${JSON.stringify(marks)}.includes(mark.id)));
          return ${FRAMES};
        })()`);
        const shots: string[] = [];
        for (const backdrop of ["#000", "#fff"]) {
          await phone.evaluate(`(() => {
            document.querySelector("#arena canvas").style.visibility = "hidden";
            for (const node of [document.documentElement, document.body, document.getElementById("app"), document.getElementById("arena")])
              node.style.setProperty("background", "${backdrop}", "important");
          })()`);
          shots.push(Buffer.from(await phone.view.screenshot({ format: "png", encoding: "buffer" })).toString("base64"));
        }
        const reading: { phase: string; marks: number[]; cover: Cover } = JSON.parse(String(await phone.evaluate(`(async (shots, spots, box) => {
          const [black, white] = await Promise.all(shots.map(async png => {
            const bitmap = await createImageBitmap(await (await fetch("data:image/png;base64," + png)).blob());
            const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
            paint.canvas.width = bitmap.width; paint.canvas.height = bitmap.height; paint.drawImage(bitmap, 0, 0);
            return paint.getImageData(0, 0, bitmap.width, bitmap.height);
          }));
          const through = spot => {
            let sum = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const at = 4 * ((Math.round(box.top + spot.y) + dy) * black.width + Math.round(box.left + spot.x) + dx);
              for (let channel = 0; channel < 3; channel++) sum += (white.data[at + channel] - black.data[at + channel]) / 255;
            }
            return sum / 27;
          };
          document.querySelector("#arena canvas").style.removeProperty("visibility");
          for (const node of [document.documentElement, document.body, document.getElementById("app"), document.getElementById("arena")])
            node.style.removeProperty("background");
          const run = castleSample.snapshot();
          return JSON.stringify({ phase: run.phase, marks: run.telegraphs.map(mark => mark.id),
            cover: Object.fromEntries(Object.entries(spots).map(([spot, at]) => [spot, 1 - through(at)])) });
        })(${JSON.stringify(shots)}, ${JSON.stringify(SPOTS)}, ${JSON.stringify(raised.banner)})`)));
        if (reading.phase === "playing" && reading.marks.join() === marks.join()) return reading.cover;
      }
      throw new Error(`The field kept changing under the banner while it was read with ${marks.length} warnings`);
    };
    const warned = await cover(MARKS);
    await phone.evaluate(FRAMES);
    await phone.shot(`${name}-warned.png`);
    const clear = await cover([]);
    await phone.evaluate(FRAMES);
    await phone.shot(`${name}-clear.png`);
    await Bun.write(`${name}.json`, JSON.stringify({ rest, raised, warned, clear }, null, 2));
    return { rest, raised, warned, clear, errors: phone.errors };
  } finally {
    phone.view.close(); server.stop(true);
    await rm(profile, { recursive: true });
  }
}

for (const [width, height] of [[390, 844], [405, 670], [1440, 900]] as const) {
  test(`a cast raises the name banner at its top place and thins it only over the enemy warnings under it at ${width}x${height}`, async () => {
    const { rest, raised, warned, clear, errors } = await cast(width, height, "moving");
    expect(raised.banner).toEqual(rest);
    expect(raised.banner.top).toBeGreaterThanOrEqual(raised.clock.bottom);
    expect(raised.banner.bottom).toBeLessThanOrEqual(raised.view.height / 2);
    expect([raised.slides, raised.wipes]).toEqual([true, true]);
    expect(Math.max(warned.round, warned.strip)).toBeLessThanOrEqual(THIN);
    expect(Math.min(warned.corner, warned.far)).toBeGreaterThanOrEqual(SOLID);
    expect(Math.min(clear.round, clear.strip, clear.corner, clear.far)).toBeGreaterThanOrEqual(SOLID);
    expect(errors).toEqual([]);
  }, 120000);
}

for (const motion of ["reduced", "switched"] as const) {
  test(`with motion ${motion === "reduced" ? "reduced by the system" : "switched off in the game"} the banner holds still at its top place and still thins over a warning`, async () => {
    const { rest, raised, warned, clear, errors } = await cast(390, 844, motion);
    expect(raised.banner).toEqual(rest);
    expect([raised.slides, raised.wipes, raised.fades]).toEqual([false, false, true]);
    expect(Math.max(warned.round, warned.strip)).toBeLessThanOrEqual(THIN);
    expect(Math.min(warned.corner, warned.far, clear.round, clear.strip)).toBeGreaterThanOrEqual(SOLID);
    expect(errors).toEqual([]);
  }, 120000);
}
