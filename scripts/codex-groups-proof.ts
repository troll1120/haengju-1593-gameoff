import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { previewResponse } from "./serve";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";

const phase = process.env.CODEX_PHASE ?? "after";
const output = resolve(import.meta.dir, "../review/codex-groups", phase);
await mkdir(output, { recursive: true });
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, process.env.CODEX_DIST ?? resolve(import.meta.dir, "../dist")),
});
try {
  for (const [width, height, lang] of [[390, 844, "ko"], [390, 844, "en"], [1440, 900, "ko"], [1440, 900, "en"]] as const) {
    const profile = await mkdtemp(`${tmpdir()}/codex-groups-`);
    const phone = await launch("about:blank", profile, width, height);
    const ready = (condition: string) => phone.evaluate(`new Promise((resolve, reject) => {
      const end = performance.now() + 30000;
      function frame() {
        if (${condition}) resolve(true);
        else if (performance.now() > end) reject(new Error("UI not ready"));
        else requestAnimationFrame(frame);
      } frame();
    })`);
    const tap = async (selector: string) => {
      if (!await phone.tapElement(selector)) throw new Error(`Missing control: ${selector}`);
    };
    const shot = async (name: string) => {
      await ready(`document.querySelector(".bph-codex-page")`);
      await phone.evaluate(`(async () => {
        const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await paint();
        await Promise.all(document.getAnimations().filter(a =>
          a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished));
        await paint();
      })()`);
      await phone.shot(resolve(output, `${lang}-${width}-${name}.png`));
    };
    try {
      const url = `http://127.0.0.1:${server.port}/?seed=7`;
      await phone.view.navigate(url);
      await phone.evaluate(`localStorage.setItem("haengju1593-lang", "${lang}")`);
      await phone.view.navigate(url);
      await ready(`document.querySelector("#codex-open") && !document.querySelector("#app").classList.contains("loading")`);
      await tap("#codex-open");
      await ready(`document.querySelector(".bph-codex-page")`);
      await phone.evaluate(`(() => {
        const meta = JSON.parse(localStorage.getItem("haengju1593-meta")) ?? ${JSON.stringify({ ...freshMeta(), bph: freshBphSave() })};
        meta.bph.discovered = ["Monster1_Caveling", "Monster1_Raider"];
        meta.bph.seen = [];
        meta.bph.codexRewards = { version: 1,
          claimed: ["discovery:Monster1_Caveling", "discovery:Monster1_Raider"], pendingGold: 0 };
        localStorage.setItem("haengju1593-meta", JSON.stringify(meta));
      })()`);
      await phone.view.navigate(url);
      await ready(`document.querySelector("#codex-open") && !document.querySelector("#app").classList.contains("loading")`);
      await tap("#codex-open");
      await shot("summary");
      await tap(".bph-codex-tabs button:nth-child(3)");
      await shot("enemies");
      await tap('[data-codex-key="Monster1_Caveling"]');
      await shot("detail");
      if (phase === "after") await phone.evaluate(`(() => {
        const page = document.querySelector(".bph-codex-page");
        const meta = JSON.parse(localStorage.getItem("haengju1593-meta"));
        if (document.querySelectorAll(".bph-codex-card").length !== 13) throw new Error("enemy grouping");
        if (document.querySelector(".bph-codex-count")) throw new Error("header tally");
        if (!page.innerText.includes("2-800")) throw new Error("stat range");
        if (page.scrollWidth !== page.clientWidth) throw new Error("horizontal overflow");
        for (const value of page.querySelectorAll(".bph-facts dd")) {
          const bounds = value.getBoundingClientRect(), row = value.parentElement.getBoundingClientRect();
          if (bounds.right > row.right || bounds.left < row.left) throw new Error("clipped range");
        }
        if (!meta.bph.seen.includes("Monster1_Raider")) throw new Error("group unread acknowledgement");
        if (meta.bph.codexRewards.pendingGold !== 0 ||
          meta.bph.codexRewards.claimed.length !== 2) throw new Error("presentation changed rewards");
      })()`);
      const result = await phone.evaluate(`(() => {
        const page = document.querySelector(".bph-codex-page");
        return { text: page.innerText,
          cards: document.querySelectorAll(".bph-codex-card").length,
          overflow: page.scrollWidth - page.clientWidth,
          width: innerWidth, height: innerHeight,
          save: JSON.parse(localStorage.getItem("haengju1593-meta")).bph };
      })()`);
      await Bun.write(resolve(output, `${lang}-${width}.json`), JSON.stringify(result, null, 2));
      await phone.evaluate(`document.querySelector(".bph-codex-page").scrollTop = document.querySelector(".bph-codex-page").scrollHeight`);
      await shot("detail-bottom");
      if (phone.errors.length) throw new Error(phone.errors.join("\n"));
      console.log(`PASS ${phase} ${lang} ${width}x${height}`);
    } finally {
      phone.view.close();
    }
  }
} finally {
  server.stop(true);
}
