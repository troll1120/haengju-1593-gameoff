import { afterAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createServer } from "vite";
import { freshBphSave } from "../src/bph-save";
import { freshMeta } from "../src/meta";
import { reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";

const root = resolve(import.meta.dir, "..");
const browser = reviewBrowserSession();
const prep = ".bph-prep-detail";
const closeDetail = `${prep} [data-action="close-prep-detail"]`;
const start = "_SkillTreeMain_Demo:23:15";
/** The one visible concealed tile whose reward is free and unblocked: its first tap claims that reward
 * outright, and the claim leaves it purchased and blocked, so every later tap only explains its route. */
const freeClaim = "_SkillTreeMain_Demo:23:13";
const goldOwned = "_SkillTreeMain_Demo:24:14";
const goldNext = "_SkillTreeMain_Demo:24:13";
const goldRoute = [start, ...["20:14", "21:14", "21:15", "22:15", "21:16", "20:16", "19:16", "19:17",
  "26:16", "25:16", "25:15", "24:15", "24:14"].map(cell => `_SkillTreeMain_Demo:${cell}`)];
const tip = ".bph-placement-tooltip:popover-open";
const placement = (id: string) => `button[data-placement="${id}"]`;
const node = (id: string) => `${prep} .upgrade-row[data-node-id="${id}"]`;
const query = (selector: string) => `document.querySelector(${JSON.stringify(selector)})`;
const lobby = 'document.querySelector("#codex-open") && !document.querySelector("#app").classList.contains("loading")';

afterAll(() => browser.close());

async function session(mastery: number, run: (ui: Awaited<ReturnType<typeof driver>>) => Promise<void>,
  purchased: string[] = [], discovered = ["Hero1_Squire"]) {
  const dist = process.env.CASTLE_CODEX_DIST;
  const preview = dist && Bun.serve({
    hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, resolve(dist)),
  });
  const source = !preview && await createServer({ root, server: { host: "127.0.0.1", port: 0, ws: false } });
  try {
    if (source) await source.listen();
    const url = preview ? preview.url.href : source && source.resolvedUrls?.local[0];
    if (!url) throw new Error("Missing upgrade preview server URL");
    const ui = await driver(new URL("?seed=7", url).href);
    const save = freshBphSave();
    save.resources.mastery = mastery;
    save.purchasedPlacements = purchased;
    save.discovered = discovered;
    save.seen = [...discovered];
    await ui.reload();
    await ui.eval(`(() => {
      localStorage.setItem("haengju1593-lang", "en");
      localStorage.setItem("haengju1593-meta", ${JSON.stringify(JSON.stringify({ ...freshMeta(), bph: save }))});
    })()`);
    await ui.reload();
    await run(ui);
    expect(ui.errors).toEqual([]);
  } finally {
    try { await browser.reset(); }
    finally { if (preview) preview.stop(true); if (source) await source.close(); }
  }
}

async function driver(url: string) {
  const phone = await browser.open(390, 844);
  const evaluate = phone.evaluate;
  const ready = (condition: string) => evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 12000;
    function frame() {
      if (${condition}) requestAnimationFrame(() => resolve(true));
      else if (performance.now() >= deadline) reject(new Error("UI timeout: " + ${JSON.stringify(condition)}));
      else requestAnimationFrame(frame);
    }
    frame();
  })`);
  const tap = async (selector: string) => {
    await ready(`${query(selector)}?.checkVisibility()`);
    await evaluate(`${query(selector)}.scrollIntoView({block:"nearest",inline:"nearest"})`);
    expect(await phone.tapElement(selector), selector).toBe(true);
  };
  return {
    eval: evaluate,
    errors: phone.errors,
    tap,
    text: (selector: string) => evaluate(`${query(selector)}?.textContent.trim()`),
    disabled: (selector: string) => evaluate(`${query(selector)}?.disabled`),
    tapPoint: phone.tap,
    reload: async () => {
      await phone.view.navigate(url);
      await ready(lobby);
    },
    openPrep: async () => {
      await tap("#barracks-open");
      const shared = '[data-prep-tab="shared"]';
      await ready(query(shared));
      expect(await evaluate(`${query(shared)}.getAttribute("aria-pressed")`)).toBe("true");
      await ready(query(placement(start)));
    },
    save: () => evaluate(`(() => {
      const save = JSON.parse(localStorage.getItem("haengju1593-meta")).bph;
      return { mastery: save.resources.mastery, placements: save.purchasedPlacements };
    })()`),
  };
}

test("An affordable placement previews its upgrade button and one button tap buys once at maximum rank", async () => {
  await session(7, async ui => {
    await ui.openPrep();
    expect(await ui.text(".bph-web-wallet span")).toBe("7");
    await ui.tap(placement(start));
    expect(await ui.text(".bph-web-wallet span")).toBe("7");
    expect(await ui.text(`${tip} .bph-placement-level`)).toBe("0/1");
    expect(await ui.text(`${tip} .bph-placement-effect`)).toMatch(/inactive → .*HP.*100%/i);
    expect(await ui.text(`${tip} .bph-placement-cost`)).toBe("1");
    expect(await ui.disabled(`${tip} .bph-placement-buy`)).toBe(false);
    await ui.tap(`${tip} .bph-placement-buy`);
    expect(await ui.text(".bph-web-wallet span")).toBe("6");
    expect(await ui.text(`${tip} .bph-placement-level`)).toBe("1/1");
    expect(await ui.text(`${tip} .bph-placement-effect`)).not.toContain("→");
    expect(await ui.text(`${tip} .bph-placement-cost`)).toBe("Max");
    expect(await ui.eval(`${query(tip)}.querySelectorAll("button").length`)).toBe(0);
    expect(await ui.save()).toEqual({ mastery: 6, placements: [start] });
    await ui.tap(placement(start));
    expect(await ui.text(`${tip} .bph-placement-cost`)).toBe("Max");
    expect(await ui.eval(`Boolean(${query(`${tip} .bph-placement-buy`)})`)).toBe(false);
    expect(await ui.save()).toEqual({ mastery: 6, placements: [start] });
    await ui.tapPoint({ x: 2, y: 2 });
    expect(await ui.eval(`Boolean(${query(tip)})`)).toBe(false);
  });
}, 60000);

test("An unaffordable placement shows its real medal cost without a purchase, and clamps and flips at the viewport edges", async () => {
  await session(0, async ui => {
    await ui.openPrep();
    const before = await ui.save();
    const target = query(placement(start));
    await ui.tap(placement(start));
    expect(await ui.text(`${tip} .bph-placement-level`)).toBe("0/1");
    expect(await ui.text(`${tip} .bph-placement-effect`)).toMatch(/inactive/i);
    expect(await ui.text(`${tip} .bph-placement-cost`)).toBe("1");
    expect(await ui.disabled(`${tip} .bph-placement-buy`)).toBe(true);
    expect(await ui.eval(`(() => {
      const tip = ${query(tip)}, price = tip.querySelector(".bph-placement-cost");
      return [tip.dataset.short, price.querySelector("img").getAttribute("src"),
        getComputedStyle(price).color !== getComputedStyle(tip).color, getComputedStyle(tip).animationName,
        ${target}.closest(".bph-prep-content").inert];
    })()`)).toEqual(["true", "./art/icons/star-mastery.webp", true, "bph-placement-denied", false]);
    expect(await ui.save()).toEqual(before);
    const geometry = `(() => {
      const tip = ${query(tip)}, t = tip.getBoundingClientRect(), n = ${target}.getBoundingClientRect();
      return { side: tip.dataset.side, left: t.left, right: t.right,
        gap: Math.round(tip.dataset.side === "above" ? n.top - t.bottom : t.top - n.bottom) };
    })()`;
    await ui.eval(`Promise.all(${query(tip)}.getAnimations().map(a => a.finished))`);
    expect(await ui.eval(geometry)).toMatchObject({ side: "below", gap: 6 });
    // Isolate viewport edges from whichever positions the graph currently assigns to this node.
    for (const [x, y, flank] of [[0, 40, "left"], [352, 744, "right"]] as const) {
      await ui.eval(`(() => {
        const node = ${target};
        node.getBoundingClientRect = () => new DOMRect(${x}, ${y}, 38, 80);
        window.dispatchEvent(new Event("resize"));
      })()`);
      const result = await ui.eval(geometry);
      expect(result).toMatchObject(flank === "left"
        ? { side: "below", left: 8, gap: 6 }
        : { side: "above", right: 382, gap: 6 });
    }
  });
}, 60000);

test.each([100, 0])("a gold rank tap with %d mastery applies at most one rank and displays the real next price", async mastery => {
  await session(mastery, async ui => {
    await ui.openPrep();
    const before = await ui.save();
    await ui.tap(placement(goldOwned));
    expect(await ui.text(`${tip} .bph-placement-level`)).toBe("1/1");
    expect(await ui.text(`${tip} .bph-placement-cost`)).toBe("Max");
    expect(await ui.save()).toEqual(before);
    await ui.tapPoint({ x: 2, y: 2 });
    await ui.tap(placement(goldNext));
    expect(await ui.text(`${tip} .bph-placement-level`)).toBe("1/3");
    expect(await ui.text(`${tip} .bph-placement-effect`)).toMatch(/20%/);
    expect(await ui.text(`${tip} .bph-placement-cost`)).toBe("35");
    expect(await ui.eval(`${query(tip)}.dataset.short`)).toBe(String(!mastery));
    expect(await ui.disabled(`${tip} .bph-placement-buy`)).toBe(!mastery);
    expect(await ui.text(".bph-web-wallet span")).toBe(String(mastery));
    const after = await ui.save();
    if (mastery) {
      await ui.tap(`${tip} .bph-placement-buy`);
      expect(await ui.text(`${tip} .bph-placement-level`)).toBe("2/3");
      expect(await ui.text(`${tip} .bph-placement-effect`)).toMatch(/40%/);
      expect(await ui.text(`${tip} .bph-placement-cost`)).toBe("35");
      expect(await ui.text(".bph-web-wallet span")).toBe("65");
      expect(await ui.save()).toEqual({ mastery: 65, placements: [...goldRoute, goldNext] });
      await ui.tap(placement(goldNext));
      expect(await ui.eval(`Boolean(${query(`${tip} .bph-placement-buy`)})`)).toBe(false);
      expect(await ui.text(`${tip} .bph-placement-cost`)).toBe("35");
    } else expect(after).toEqual(before);
  }, [...goldRoute]);
}, 60000);

test("the shipped gold placement button deducts 35 and finishes rendering its post-buy tooltip without an exception", async () => {
  await session(1824, async ui => {
    await ui.openPrep();
    await ui.tap(placement(goldNext));
    await ui.tap(`${tip} .bph-placement-buy`);
    expect(await ui.save()).toEqual({ mastery: 1789, placements: [...goldRoute, goldNext] });
    // A mixed caller/renderer bundle once persisted the purchase, then threw while reading options.short.
    expect(ui.errors).toEqual([]);
    expect(await ui.eval(`(() => {
      const tip = document.getElementById(${query(placement(goldNext))}.getAttribute("aria-describedby"));
      return tip && [tip.matches(":popover-open"), tip.dataset.placementTooltip, tip.dataset.short,
        tip.querySelector(".bph-placement-level").textContent, tip.querySelector(".bph-placement-cost").textContent];
    })()`)).toEqual([true, goldNext, "false", "2/3", "35"]);
  }, [...goldRoute]);
}, 60000);

test("Fresh Prep defaults to Shared and keeps Militia and General open while locked tabs explain their route", async () => {
  await session(0, async ui => {
    await ui.openPrep();
    const tab = (id: string) => `[data-prep-tab="${id}"]`;
    const active = () => ui.eval(`${query('[data-prep-tab][aria-pressed="true"]')}?.dataset.prepTab`);
    expect(await active()).toBe("shared");
    await ui.tap(tab("militia"));
    expect(await active()).toBe("militia");
    expect(await ui.eval(`${query('button[data-card="Hero1_Squire"]')}?.dataset.dim`)).toBe("true");
    for (const [group, boss] of [["government", /Konishi/i], ["elite", /Wakizaka/i]] as const) {
      await ui.tap(tab(group));
      expect(await active()).toBe("militia");
      expect(await ui.eval(`${query(`${tab(group)} img`)}?.src.endsWith("/art/icons/lock.webp")`)).toBe(true);
      expect(await ui.eval(`${query(tab(group))}.getAttribute("aria-describedby")`)).toBe("bph-placement-tooltip");
      expect(await ui.text(tip)).toMatch(boss);
      expect(await ui.text(tip)).toMatch(/claim the quest reward$/);
    }
    await ui.tap(tab("general"));
    expect(await active()).toBe("general");
    expect(await ui.eval(`Boolean(${query(tip)})`)).toBe(false);
    await ui.tap(tab("militia"));
    const lockedPack = 'button[data-pack="Pack2_Advanced"]';
    expect(await ui.eval(`${query(lockedPack)}?.dataset.dim`)).toBe("true");
    await ui.tap(lockedPack);
    expect(await ui.text(tip)).toContain("How to unlock:");
    expect(await ui.eval(`${query(tip)}.dataset.lockedTooltip`)).toBe("tab");
    expect(await ui.save()).toEqual({ mastery: 0, placements: [] });
  }, [], []);
}, 60000);

test("Prep switches tree groups and inspects the undiscovered monk without spending", async () => {
  await session(999, async ui => {
    await ui.openPrep();
    const tabs = ["shared", "militia", "government", "elite", "general"];
    expect(await ui.eval(`[...document.querySelectorAll("[data-prep-tab]")].map(tab => tab.dataset.prepTab)`)).toEqual(tabs);
    for (const tab of ["government", "elite", "general", "militia"]) {
      const button = `[data-prep-tab="${tab}"]`;
      await ui.tap(button);
      expect(await ui.eval(`[...document.querySelectorAll('[data-prep-tab][aria-pressed="true"]')].map(tab => tab.dataset.prepTab)`))
        .toEqual([tab]);
      expect(await ui.eval(`${query(`[data-prep-group="${tab}"]`)}?.checkVisibility()`)).toBe(true);
    }
    await ui.tap('button[data-card="Hero1_Squire"]');
    const buy = `${node("attack")} .ur-buy`;
    expect(await ui.disabled(buy)).toBe(false);
    await ui.tap(closeDetail);
    await ui.tap('button[data-card="Hero2_Monk"]');
    expect(await ui.text(tip)).toContain("How to unlock:");
    expect(await ui.text(tip)).not.toMatch(/Monk|damage|attack/i);
    expect(await ui.eval(`${query(tip)}.dataset.lockedTooltip`)).toBe("card");
    expect(await ui.eval(`Boolean(${query(prep)})`)).toBe(false);
    await ui.tap('[data-prep-tab="general"]');
    await ui.tap('button[data-general][data-dim="true"]');
    expect(await ui.text(tip)).toContain("How to unlock:");
    expect(await ui.eval(`${query(tip)}.dataset.lockedTooltip`)).toBe("general");
    expect(await ui.eval(`Boolean(${query(prep)})`)).toBe(false);
    expect(await ui.save()).toEqual({ mastery: 999, placements: [] });
  }, [], ["Hero1_Squire", "Hero2_Knight", "Hero3_WitchDoctor"]);
}, 60000);

test("a quest and an undiscovered placement tooltip read as one clean block: no zero-only row, no repeated Hidden", async () => {
  await session(0, async ui => {
    await ui.openPrep();
    const lines = () => ui.eval(`${query(tip)}.innerText.split("\\n").map(line => line.trim()).filter(Boolean)`) as Promise<string[]>;
    await ui.tap(placement("_SkillTreeMain_Demo:23:19"));
    const quest = await lines();
    expect(quest).not.toContain("0");
    expect(quest.some(line => /How to unlock|\(0\/2\)/.test(line))).toBe(true);
    await ui.tapPoint({ x: 2, y: 2 });
    await ui.tap(placement(freeClaim));
    await ui.tap(placement(freeClaim));
    const hidden = await lines();
    expect(hidden).not.toContain("0");
    expect(hidden.join("\n").match(/Hidden|Undiscovered|미발견/g)).toHaveLength(1);
    expect(hidden.some(line => line.startsWith("How to unlock:"))).toBe(true);
    expect(await ui.eval(`Boolean(${query(`${tip} .bph-placement-buy`)})`)).toBe(false);
  }, [start]);
}, 60000);

test("claiming a free concealed tile hands the reveal to its popup and leaves no tooltip over it", async () => {
  await session(0, async ui => {
    await ui.openPrep();
    await ui.tap(placement(freeClaim));
    expect(await ui.eval(`Boolean(${query(tip)})`)).toBe(false);
    expect(await ui.eval(`JSON.parse(localStorage.getItem("haengju1593-meta")).bph.purchasedPlacements`)).toContain(freeClaim);
  }, [start]);
}, 60000);
