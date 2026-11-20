import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "vite";

const root = resolve(import.meta.dir, ".."), output = resolve(root, "review-fixtures");
await mkdir(output, { recursive: true });
const probes = await Bun.build({
  entrypoints: [`${root}/scripts/boss-camera-probe.ts`, `${root}/src/painted-art.ts`],
  target: "browser", outdir: output, naming: "[name].js",
});
if (!probes.success) throw new AggregateError(probes.logs, "Native browser probes did not build");

// These are the existing test-only closure observers, built before any Chrome starts.
const observers = [
  ["pointer", `
    import { bphFxContext as j6Context } from "./bph-fx-dispatch";
    window.j6PointerProbe = {
      camera: () => game.scene.getScene("castle").cameras.main,
      pointer: () => ({ ...j6Context(run).pointer }),
      freeze: () => { game.loop.sleep(); window.j6PointerProbe.camera().preRender(); },
      resume: () => game.loop.wake(),
      project: point => {
        const p = window.j6PointerProbe.camera().matrix.transformPoint(point.x, point.y);
        const r = document.querySelector("#arena canvas").getBoundingClientRect();
        return { x: r.left + p.x / WIDTH * r.width, y: r.top + p.y / HEIGHT * r.height };
      },
      freezeAtBossPeak: () => new Promise((resolve, reject) => {
        const end = performance.now() + 15000;
        requestAnimationFrame(function frame() {
          if (window.j6PointerProbe.camera().zoom >= 1.0249) {
            window.j6PointerProbe.freeze(); resolve(true);
          } else if (performance.now() > end) reject(new Error("Boss zoom did not reach its peak"));
          else requestAnimationFrame(frame);
        });
      })
    };`],
  ["unlock", `
    window.unlockResultProbe = {
      finish: () => {
        game.loop.sleep(); run.phase = "lost"; run.time = 30;
        // Seventeen dropped survival medals settle whole, independent of the merit-to-medal divisor.
        run.bph.killMedals = 17; updateHud();
      },
      resume: () => game.loop.wake(),
      refresh: () => updateHud(),
      present: generals => showResultUnlocks(generals, element("retry"))
    };`],
  ["unlock-backfill", `
    window.unlockMilestones = {
      kill: () => { meta.bossesKilled = 1; },
      runs: () => { meta.runs = 8; }
    };`],
] as const;
for (const [name, observer] of observers) {
  await build({
    root,
    build: { outDir: resolve(output, name), emptyOutDir: true, minify: false },
    plugins: [{
      name: `review-${name}-closure`, enforce: "pre",
      transform(source, id) {
        if (id.split("?")[0] === `${root}/src/main.ts`) return `${source}\n${observer}`;
      },
    }],
  });
}
console.log("BROWSER_FIXTURES_BUILT", output);
