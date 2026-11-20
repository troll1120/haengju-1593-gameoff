import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { freshBphSave } from "../src/bph-save";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES } from "../src/bph-upgrades";

const captures = process.env.UFQ_CAPTURES;
const milestones = [...BPH_PLACEMENTS.values()];
const quest = milestones.find(p => p.gridId === "_SkillTreeMain_Demo" && p.nodeId === "Q_DefeatOgre");
if (!quest) throw new Error("Missing default-grid recruitment quest");
const questId = quest.id;
type Phone = Awaited<ReturnType<typeof launch>>;
async function ready(phone: Phone, condition: string): Promise<void> {
  await phone.evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 25000;
    function frame() {
      if (${condition}) return resolve(true);
      if (performance.now() > deadline) return reject(new Error(${JSON.stringify(condition)}));
      requestAnimationFrame(frame);
    } frame();
  })`);
}
async function capture(phone: Phone, name: string): Promise<void> {
  await phone.evaluate(`document.fonts.ready`);
  await ready(phone, "[...document.images].filter(i => i.getBoundingClientRect().height > 0).every(i => i.complete)");
  if (captures) {
    await mkdir(captures, { recursive: true });
    await phone.shot(`${captures}/${name}.png`);
  }
}
async function session(lang: "ko" | "en", action: (phone: Phone) => Promise<void>) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, resolve(process.env.UFQ_REVIEW_DIR ?? `${import.meta.dir}/../review-dist`)) });
  const base = process.env.UFQ_URL ?? `http://127.0.0.1:${server.port}`;
  const profile = await mkdtemp(`${tmpdir()}/castle-unlock-${lang}-`);
  const phone = await launch("about:blank", profile);
  try {
    await phone.view.navigate(base);
    await phone.evaluate(`(() => { localStorage.clear(); localStorage.setItem("haengju1593-lang", "${lang}"); })()`);
    await phone.view.navigate(`${base}/?seed=144`);
    await ready(phone, "window.castleSample && !document.querySelector('#start').disabled");
    await action(phone);
    expect(phone.errors).toEqual([]);
  } finally {
    phone.view.close();
    server.stop(true);
    await rm(profile, { recursive: true, force: true });
  }
}
for (const lang of ["ko", "en"] as const) {
  test(`unknown codex entry explains its real source and claim condition in ${lang}`, () => session(lang, async phone => {
    await phone.tapElement("#codex-open");
    await ready(phone, "document.querySelector('[data-codex-key=\"Hero2_Knight\"]')");
    await phone.tapElement('[data-codex-key="Hero2_Knight"]');
    const condition = ".bph-codex-page-head .bph-codex-condition";
    await ready(phone, `document.querySelector(${JSON.stringify(condition)})`);
    const content = String(await phone.evaluate(`document.querySelector(${JSON.stringify(condition)}).textContent`));
    expect(content).toMatch(lang === "ko" ? /^해금 방법: / : /^How to unlock: /);
    expect(content).toMatch(lang === "ko" ? /1마리 처치/ : /Defeat 1 /);
    expect(content).toContain(lang === "ko" ? "퀘스트 보상을 받고 해당 모집 열기" : "claim the quest reward, then open the unlocked recruit pack");
    expect(content).not.toContain(lang === "ko" ? "수호 창병" : "Guard Spearman");
    expect(await phone.evaluate(`(() => { const p = document.querySelector('.bph-codex-page');
      return p.scrollWidth <= p.clientWidth && [...p.querySelectorAll('.bph-codex-sub')]
        .every(n => parseFloat(getComputedStyle(n).fontSize) >= 16); })()`)).toBe(true);
    await capture(phone, `codex-${lang}`);
    const sources = await phone.evaluate(`(() => {
      const hints = new Map();
      const collect = () => {
        for (const card of document.querySelectorAll('[data-codex-key][data-discovered="false"]')) {
          card.click();
          hints.set(card.dataset.codexKey, document.querySelector(${JSON.stringify(condition)})?.textContent ?? "");
        }
      };
      for (const group of document.querySelectorAll('.bph-codex-classes button')) {
        group.click(); collect();
      }
      document.querySelectorAll('.bph-codex-tabs button')[1].click(); collect();
      return [...hints.entries()];
    })()`);
    if (!Array.isArray(sources)) throw new Error("Missing codex source hints");
    expect(sources.length).toBeGreaterThan(30);
    expect(sources.filter(([, text]) => !String(text).match(lang === "ko" ? /^해금 방법: \S/ : /^How to unlock: \S/))).toEqual([]);
    expect(sources.filter(([, text]) => String(text).includes(lang === "ko" ? "현재 빌드에서 획득할 수 없음" : "Unavailable in this build"))
      .map(([id]) => id).sort()).toEqual(["Hero5_DinoRider", "Hero9_BlackHole", "Hero9_Quasar", "Hero9_Supernova"]);
  }), 60000);

  test(`roulette hides new identities until their first reveal in ${lang}`, () => session(lang, async phone => {
    await phone.tapElement("#start");
    await ready(phone, "document.querySelector('[data-bph-start]')");
    await phone.tapElement("[data-bph-start]");
    await passFirstBattleGuide(phone);
    await ready(phone, "!castleSample.snapshot().paused && document.querySelector('.bph-recruit-strip > .bph-recruit-cell')");
    await phone.tapElement(".bph-recruit-strip > .bph-recruit-cell");
    await ready(phone, "document.querySelector('.bph-receipt:not(.bph-hire-reveal).bph-spinning:not([hidden])')");
    expect(await phone.evaluate("document.querySelector('.bph-receipt:not(.bph-hire-reveal) .bph-reveal-name').textContent")).toBe("???");
    const outline = await phone.evaluate(`(async () => {
      const frame = document.querySelector('.bph-receipt:not(.bph-hire-reveal) [data-undiscovered]');
      const image = frame.querySelector('img');
      const filter = getComputedStyle(image).filter;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const original = context.getImageData(0, 0, canvas.width, canvas.height).data;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.filter = filter;
      context.drawImage(image, 0, 0);
      const shaded = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let changedAlpha = 0, visiblePixels = 0, nonBlack = 0;
      for (let i = 0; i < shaded.length; i += 4) {
        if (shaded[i + 3] !== original[i + 3]) changedAlpha++;
        if (!shaded[i + 3]) continue;
        visiblePixels++;
        if (shaded[i] || shaded[i + 1] || shaded[i + 2]) nonBlack++;
      }
      return { changedAlpha, nonBlack, visiblePixels, images: frame.querySelectorAll('img').length,
        accessibleName: image.getAttribute("aria-label") ?? image.alt,
        title: image.title || frame.title };
    })()`);
    expect(outline).toMatchObject({ changedAlpha: 0, nonBlack: 0, images: 1, accessibleName: "", title: "" });
    if (!outline || typeof outline !== "object" || !("visiblePixels" in outline))
      throw new Error("Missing silhouette pixels");
    expect(outline.visiblePixels).toBeGreaterThan(0);
    await capture(phone, `roulette-${lang}`);
    await ready(phone, "document.querySelector('.bph-receipt:not(.bph-hire-reveal).bph-cracking')");
    for (let hit = 0; hit < 3; hit++) {
      expect(await phone.evaluate(`(() => {
        const card = document.querySelector('.bph-receipt:not(.bph-hire-reveal).bph-cracking');
        return {
          mark: card.querySelector(".bph-crack-mark").textContent,
          name: card.querySelector(".bph-reveal-name").textContent,
          portrait: !!card.querySelector(".bph-reveal-portrait, [data-undiscovered]"),
          rewardHidden: card.querySelector(".bph-reveal-reward").hidden,
        };
      })()`)).toEqual({ mark: "?", name: "???", portrait: false, rewardHidden: true });
      expect(await phone.tapElement(".bph-receipt:not(.bph-hire-reveal) .bph-reveal-art")).toBe(true);
    }
    await ready(phone, "document.querySelector('.bph-receipt:not(.bph-hire-reveal).bph-discovered')");
    expect(await phone.evaluate("Boolean(document.querySelector('.bph-receipt:not(.bph-hire-reveal) .bph-reveal-art [data-undiscovered]'))")).toBe(false);
    expect(await phone.evaluate("Boolean(document.querySelector('.bph-receipt:not(.bph-hire-reveal) .bph-discovery-burst'))")).toBe(true);
    expect(await phone.evaluate("document.querySelector('.bph-receipt:not(.bph-hire-reveal) .bph-reveal-name').textContent")).toMatch(/[^?\s]/);
    await capture(phone, `first-draw-${lang}`);
    const known = await phone.evaluate(`(() => {
      const run = window.castleSample.snapshot();
      run.bph.receipts.length = 0; run.bph.arrivals.length = 0; run.bph.arrivalEnd = 0;
      run.bph.save.discovered = ${JSON.stringify(["Hero1_Squire", "Hero1_Barbarian", "Hero1_Archer", "Tome_Thunderstorm"])};
      return true;
    })()`);
    expect(known).toBe(true);
    await ready(phone, "!document.querySelector('.bph-recruit-strip > .bph-recruit-cell').disabled");
    await phone.tapElement(".bph-recruit-strip > .bph-recruit-cell");
    await ready(phone, "document.querySelector('.bph-receipt:not(.bph-hire-reveal).bph-spinning:not([hidden])')");
    expect(await phone.evaluate("document.querySelector('.bph-receipt:not(.bph-hire-reveal) .bph-reveal-name').textContent")).toMatch(/[^?\s]/);
    expect(await phone.evaluate("Boolean(document.querySelector('.bph-receipt:not(.bph-hire-reveal) .bph-reveal-art [data-undiscovered]'))")).toBe(false);
  }), 60000);

  test(`quest reward opens recruitment through the central popup in ${lang}`, () => session(lang, async phone => {
    const save = freshBphSave();
    save.dimension = 2;
    save.income = 10;
    save.purchasedPlacements = milestones.filter(p => p.gridId === "_SkillTreeMain_Demo" && p.id !== questId
      && p.nodeId && BPH_UPGRADE_NODES[p.nodeId]?.type !== 4).map(p => p.id);
    save.purchasedNodes = save.purchasedPlacements.flatMap(id => {
      const node = BPH_PLACEMENTS.get(id)?.nodeId; return node ? [node] : [];
    });
    save.questActivatedAt[questId] = 0;
    save.questProgress[questId] = 1;
    await phone.evaluate(`(() => {
      const meta = JSON.parse(localStorage.getItem("haengju1593-meta") || "{}");
      meta.bph = ${JSON.stringify(save)}; localStorage.setItem("haengju1593-meta", JSON.stringify(meta));
    })()`);
    await phone.view.navigate(`${new URL(await phone.evaluate("location.href").then(String)).origin}/?seed=144`);
    await ready(phone, "!document.querySelector('#start').disabled");
    await phone.tapElement("#barracks-open");
    await ready(phone, `document.querySelector('[data-prep-tab="shared"]')`);
    const questNode = `button[data-placement="${questId}"]`;
    await ready(phone, `document.querySelector(${JSON.stringify(questNode)})`);
    await phone.evaluate(`document.querySelector(${JSON.stringify(questNode)}).scrollIntoView({block:"nearest",inline:"nearest"})`);
    await capture(phone, `quest-${lang}`);
    expect(await phone.tapElement(questNode)).toBe(true);
    expect(await phone.evaluate("Boolean(document.querySelector('#result-unlock-modal[open]'))")).toBe(true);
    expect(await phone.evaluate("document.querySelector('#result-unlock-name').textContent"))
      .toContain(lang === "ko" ? "숙련 병력 모집" : "Mastery Recruit");
    expect(await phone.evaluate("document.querySelectorAll('dialog[open]').length")).toBe(1);
    await capture(phone, `unlock-${lang}`);
    await phone.tapElement("#result-unlock-modal button");
    expect(await phone.evaluate("document.querySelectorAll('dialog[open]').length")).toBe(0);
  }), 60000);
}
