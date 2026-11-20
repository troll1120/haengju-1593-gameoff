import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

type Box = { x: number; y: number; w: number; h: number };
type Layout = {
  readonly lang: string; readonly viewport: readonly [number, number]; readonly app: Box; readonly hudBottom: number;
  readonly chiefBarBottom: number; readonly banner: Box; readonly recruit: Box; readonly overlapping: readonly string[];
  readonly receipt: Box | null; readonly name: Box | null; readonly receiptOverlapping: readonly string[];
  readonly fieldCenter: { x: number; y: number }; readonly dock: Box; readonly volley: Box; readonly cell: Box;
};
const CHIEF_BAR_BOTTOM = 61, HUD_GAP = 16;
const REVEAL_FACE = 128;
const root = resolve(import.meta.dir, "..");
const out = resolve(process.env.CASTLE_RECRUIT_TOP_EVIDENCE ?? `${root}/review/recruit-top`);

// The herald stays beneath the top HUD. The recruit strip and volley share the bottom dock,
// with the recruit receipt above the strip.
for (const [width, height] of [[390, 844], [405, 720], [1440, 900]] as const) for (const lang of ["ko", "en"] as const) {
  test(`the herald banner sits below the top HUD while recruit and receipt keep the bottom dock at ${width}x${height} in ${lang}`, async () => {
    await mkdir(out, { recursive: true });
    const profile = await mkdtemp(`${out}/chrome-profile-`);
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, process.env.CASTLE_TEST_DIST ?? `${root}/review-dist`) });
    const base = `http://127.0.0.1:${server.port}`;
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const ready = (expression: string) => phone.evaluate(`new Promise((resolve, reject) => {
      const deadline = performance.now() + 25000;
      function check() {
        if (${expression}) requestAnimationFrame(() => resolve(true));
        else if (performance.now() > deadline) reject(new Error("Recruit condition not reached: " + ${JSON.stringify(expression)}));
        else requestAnimationFrame(check);
      } check();
    })`);
    const motion = () => ready("!document.getAnimations().some(a => a.playState === 'running' && a.effect.getComputedTiming().iterations !== Infinity)");
    const layout = async (): Promise<Layout> => {
      await motion();
      const field = await phone.evaluate("castleSample.snapshot().field") as { width: number; height: number };
      const map = await phone.fieldMapper(field.width, field.height);
      const measured = await phone.evaluate(`(() => {
        const box = e => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; };
        const banner = document.querySelector('#cut-in'), recruit = document.querySelector('.bph-recruit-strip'), receipt = document.querySelector('.bph-receipt:not(.bph-hire-reveal)');
        const hidden = banner.hidden; banner.hidden = false;
        const bannerBox = box(banner); banner.hidden = hidden;
        const others = (self, inside) => [...document.querySelectorAll('#app button, #clock')]
          .filter(e => e !== self && !e.closest('[hidden], [inert]') && !(inside && inside.contains(e)))
          .filter(e => { const a = self.getBoundingClientRect(), b = e.getBoundingClientRect();
            return b.width && b.height && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; })
          .map(e => e.id || e.className);
        return { lang: document.documentElement.lang, viewport: [innerWidth, innerHeight], app: box(document.querySelector('#app')),
          hudBottom: Math.max(document.querySelector('#clock').getBoundingClientRect().bottom, document.querySelector('#pause').getBoundingClientRect().bottom),
          banner: bannerBox, recruit: box(recruit), overlapping: others(recruit, recruit),
          dock: box(document.querySelector('.bph-field-dock')), volley: box(document.querySelector('.bph-tap-charges')),
          cell: box(document.querySelector('.bph-recruit-strip > .bph-recruit-cell')),
          receipt: receipt.hidden ? null : box(receipt.querySelector('.bph-reveal-art')), name: receipt.hidden ? null : box(receipt.querySelector('.bph-reveal-name')),
          receiptOverlapping: receipt.hidden ? [] : [...others(receipt.querySelector('.bph-reveal-art'), receipt), ...others(receipt.querySelector('.bph-reveal-name'), receipt)] };
      })()`) as Omit<Layout, "chiefBarBottom" | "fieldCenter">;
      return { ...measured, chiefBarBottom: map({ x: 0, y: CHIEF_BAR_BOTTOM }).y, fieldCenter: map({ x: field.width / 2, y: field.height / 2 }) };
    };
    const inside = (box: Box, shape: Layout) => {
      expect(box.y).toBeGreaterThanOrEqual(shape.hudBottom);
      expect(box.y).toBeGreaterThanOrEqual(shape.chiefBarBottom);
      expect(box.x).toBeGreaterThanOrEqual(shape.app.x); expect(box.x + box.w).toBeLessThanOrEqual(shape.app.x + shape.app.w);
      expect(box.y + box.h).toBeLessThanOrEqual(Math.min(shape.app.y + shape.app.h, shape.viewport[1]));
    };
    const checkPanel = (shape: Layout) => {
      const { app, banner, recruit, dock, volley, cell } = shape;
      expect(shape.lang).toBe(lang);
      expect(banner.y - shape.hudBottom).toBeLessThanOrEqual(HUD_GAP);
      inside(banner, shape); inside(recruit, shape);
      expect(cell.w).toBeGreaterThanOrEqual(44); expect(cell.h).toBeGreaterThanOrEqual(48);
      expect(dock.y).toBeGreaterThan(app.y + app.h / 2);
      expect(recruit.y + recruit.h).toBeCloseTo(dock.y + dock.h, 0);
      expect(Math.abs(recruit.x + recruit.w / 2 - (dock.x + dock.w / 2))).toBeLessThanOrEqual(1);
      expect(recruit.x + recruit.w).toBeLessThanOrEqual(volley.x);
      expect(volley.x + volley.w).toBeCloseTo(dock.x + dock.w, 0);
      expect(recruit.y).toBeGreaterThanOrEqual(banner.y + banner.h);
      expect(shape.overlapping).toEqual([]);
    };
    const checkReceipt = (shape: Layout) => {
      const { receipt, name, fieldCenter } = shape;
      if (!receipt || !name) throw new Error("Reveal did not open");
      inside(receipt, shape); inside(name, shape);
      expect(receipt.w).toBe(REVEAL_FACE); expect(receipt.h).toBe(REVEAL_FACE);
      expect(Math.abs(receipt.x + receipt.w / 2 - fieldCenter.x)).toBeLessThanOrEqual(1);
      expect(name.y).toBeGreaterThanOrEqual(receipt.y + receipt.h); expect(name.y - (receipt.y + receipt.h)).toBeLessThanOrEqual(16);
      expect(Math.abs(name.x + name.w / 2 - (receipt.x + receipt.w / 2))).toBeLessThanOrEqual(1);
      expect(name.y + name.h).toBeLessThanOrEqual(shape.recruit.y);
      expect(shape.receiptOverlapping).toEqual([]);
    };
    const shapes: Layout[] = [];
    try {
      await phone.view.navigate(base);
      await phone.evaluate(`localStorage.setItem("haengju1593-lang", ${JSON.stringify(lang)})`);
      await phone.view.navigate(`${base}/?seed=7`);
      await ready("window.castleSample && !document.querySelector('#app').classList.contains('loading')");
      expect(await phone.tapElement("#start")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      expect(await phone.tapElement("[data-bph-start]")).toBe(true);
      await ready("!castleSample.snapshot().attract");
      await passFirstBattleGuide(phone);
      await ready("!castleSample.snapshot().paused && castleSample.snapshot().time > 0 && document.querySelector('.bph-recruit-strip > .bph-recruit-cell:not(:disabled)')");
      const panel = await layout();
      shapes.push(panel); checkPanel(panel);
      await phone.evaluate(`(() => { const banner = document.querySelector('#cut-in');
        banner.querySelector('img').src = document.querySelector('#skills .skill-portrait').src; banner.hidden = false; })()`);
      await phone.shot(`${out}/${width}x${height}-${lang}.png`);
      await phone.evaluate("document.querySelector('#cut-in').hidden = true");
      expect(await phone.tapElement(".bph-recruit-strip > .bph-recruit-cell")).toBe(true);
      await ready("document.querySelector('.bph-receipt:not(.bph-hire-reveal).bph-cracking')");
      for (let hit = 0; hit < 3; hit++) {
        const mark = await phone.rect(".bph-receipt:not(.bph-hire-reveal) .bph-reveal-art");
        if (!mark) throw new Error("Discovery target is missing");
        await phone.tap({ x: mark.x + mark.w / 2, y: mark.y + mark.h / 2 });
        await ready(hit === 2 ? "document.querySelector('.bph-receipt:not(.bph-hire-reveal).bph-landed')" :
          `document.querySelectorAll(".bph-receipt:not(.bph-hire-reveal) .bph-discovery-ray").length === ${hit + 1}`);
      }
      await ready("!document.querySelector('.bph-receipt:not(.bph-hire-reveal)').hidden && document.querySelector('.bph-receipt:not(.bph-hire-reveal)').classList.contains('bph-landed')");
      const opened = await layout();
      shapes.push(opened); checkPanel(opened); checkReceipt(opened);
      await phone.shot(`${out}/${width}x${height}-${lang}-receipt.png`);
      expect(phone.errors).toEqual([]);
    } finally {
      await Bun.write(`${out}/${width}x${height}-${lang}-layout.json`, JSON.stringify(shapes, null, 2));
      phone.view.close(); server.stop(true);
      await rm(profile, { recursive: true, force: true });
    }
  }, 120000);
}
