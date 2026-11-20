import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";

test("the real codex hides unbought ranks and gives only saved foil ranks a prism", async () => {
  const bundle = await Bun.build({
    entrypoints: ["bph-codex-page", "bph-save", "bph-upgrades"].map(name => resolve(import.meta.dir, `../src/${name}.ts`)),
    target: "browser", splitting: true, external: ["/art/*"],
    naming: { entry: "[name].[ext]", chunk: "[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" },
  });
  expect(bundle.success).toBe(true);
  const files = new Map(bundle.outputs.map(file => [file.path.replace(/^\.\//, "/"), file]));
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      const file = files.get(path);
      if (file) return new Response(file);
      if (path.startsWith("/art/")) return new Response(Bun.file(resolve(import.meta.dir, `../public${path}`)));
      return new Response("<!doctype html><html><body></body></html>", { headers: { "content-type": "text/html" } });
    },
  });
  const profile = await mkdtemp(`${tmpdir()}/castle-promo-codex-`);
  const phone = await launch(`http://127.0.0.1:${server.port}/`, profile);
  try {
    const inspect = (purchased: boolean, foil: boolean) => phone.evaluate(`(async () => {
      const { bphSlotPage } = await import("/bph-codex-page.js");
      const { freshBphSave, parseBphSave } = await import("/bph-save.js");
      const { buyBphNode } = await import("/bph-upgrades.js");
      const start = "_SkillTreeMain_Demo:23:15";
      const save = ${purchased} ? parseBphSave({
        version: 1, dimension: 1, resources: { mastery: 100000 },
        purchasedPlacements: [start, "_SkillTreeMain_Demo:27:14"],
        purchasedNodes: ["SN_TowerHP", "SN_SquireDamage 2"],
      }) : freshBphSave();
      if (${purchased}) {
        if (save.purchasedPlacements.length !== 1 || save.purchasedPlacements[0] !== start)
          throw new Error("Retired spear damage placement was not removed from the save");
        for (const id of ["_SkillTreeMain_Demo:28:14", "_SkillTreeMain_Demo:29:14", "_SkillTreeMain_Demo:30:14"])
          if (!buyBphNode(save, id)) throw new Error("Promotion purchase failed: " + id);
      }
      // A foil pull always discovers the unit first (bph.ts discover), and the codex names only discovered ranks.
      if (${foil}) for (const id of ["Hero1_Squire2", "Hero1_Squire3"]) { save.discovered.push(id); save.foils.push(id); }
      const page = bphSlotPage(save, { id: "Hero1_Squire", kind: "hero" }, "창병", null);
      document.body.replaceChildren(page.head, ...page.body);
      return {
        ranks: document.querySelectorAll(".bph-codex-evolution li").length,
        strengths: [...document.querySelectorAll(".bph-codex-evolution .bph-codex-prism")].map(node => Number(node.style.opacity)),
      };
    })()`);
    expect(await inspect(false, false)).toEqual({ ranks: 0, strengths: [] });
    expect(await inspect(true, false)).toEqual({ ranks: 4, strengths: [] });
    expect(await inspect(true, true)).toEqual({ ranks: 4, strengths: [.75, .75] });
    expect(phone.errors).toEqual([]);
  } finally {
    server.stop(true);
    await closeBrowser(phone.view, profile);
  }
});
