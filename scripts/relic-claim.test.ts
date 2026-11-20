import { afterAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { grantBphRelic } from "../src/bph-account";
import { freshBphSave } from "../src/bph-save";
import { freshMeta } from "../src/meta";
import { reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";

const browser = reviewBrowserSession();
const id = "Relic1_CharmWarrior";
const existing = "R_HeroMoveSpeed";
const list = ".bph-relic-list";
const claim = `${list} [data-claim-relic="${id}"]`;
const owned = (relic: string) => `${list} [data-relic-state="owned"][data-relic="${relic}"]`;
const unknown = `${list} [data-relic-state="unknown"]`;
const query = (selector: string) => `document.querySelector(${JSON.stringify(selector)})`;

afterAll(() => browser.close());

test("a player in prep can open the relic shelf after the preview replaces its bundles", async () => {
  const dist = resolve(process.env.CASTLE_CODEX_DIST ?? resolve(import.meta.dir, "../dist"));
  let replaced = false;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => {
    if (replaced && /^\/play\/test\/assets\/.*\.js$/.test(new URL(request.url).pathname))
      return new Response("Retired build", { status: 404 });
    return previewResponse(request, dist, "test");
  } });
  try {
    const phone = await browser.open(390, 844);
    await phone.view.navigate(new URL("/play/test/", server.url).href);
    await phone.evaluate(`new Promise(resolve => {
      function frame() { if (!document.querySelector("#start")?.disabled && window.castleSample) resolve(true);
        else requestAnimationFrame(frame); } frame();
    })`);
    expect(await phone.tapElement("#start")).toBe(true);
    const tab = '[data-bph-tab="relics"]';
    await phone.evaluate(`new Promise(resolve => {
      function frame() { if (${query(tab)}?.checkVisibility()) resolve(true); else requestAnimationFrame(frame); } frame();
    })`);
    replaced = true;
    expect(await phone.tapElement(tab)).toBe(true);
    await phone.evaluate(`new Promise(resolve => {
      const deadline = performance.now() + 3000;
      function frame() { if (${query(list)} || performance.now() >= deadline) resolve(true); else requestAnimationFrame(frame); } frame();
    })`);
    expect(await phone.evaluate(`${query(unknown)}?.checkVisibility() ?? false`), phone.errors.join("\n")).toBe(true);
  } finally {
    try { await browser.reset(); }
    finally { server.stop(true); }
  }
}, 30000);

test("a discovery makes its class relic claimable until tapped, then it stays above unknown relics", async () => {
  const dist = resolve(process.env.CASTLE_CODEX_DIST ?? resolve(import.meta.dir, "../dist"));
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, dist) });
  try {
    const phone = await browser.open(390, 844);
    const url = new URL("?seed=7", server.url).href;
    const ready = (condition: string) => phone.evaluate(`new Promise((resolve, reject) => {
      const end = performance.now() + 12000;
      (function frame() {
        if (${condition}) requestAnimationFrame(() => resolve(true));
        else if (performance.now() >= end) reject(new Error("UI timeout: " + ${JSON.stringify(condition)}));
        else requestAnimationFrame(frame);
      })();
    })`);
    const tap = async (selector: string) => {
      await ready(`${query(selector)}?.checkVisibility()`);
      await phone.evaluate(`${query(selector)}.scrollIntoView({block:"nearest",inline:"nearest"})`);
      expect(await phone.tapElement(selector), selector).toBe(true);
    };
    const reload = async () => {
      await phone.view.navigate(url);
      await ready('window.castleSample && !document.querySelector("#app").classList.contains("loading")');
    };
    const openRelics = async () => {
      await tap("#start");
      await tap('[data-bph-tab="relics"]');
      await ready(`${query(list)}?.checkVisibility()`);
    };
    const saveOwnsReward = () => phone.evaluate(`JSON.parse(localStorage.getItem("haengju1593-meta"))
      .bph.relicState.owned.includes(${JSON.stringify(id)})`);
    const expectClaimed = async () => {
      expect(await phone.evaluate(`(() => {
        const reward = ${query(owned(id))}, unknown = [...document.querySelectorAll(${JSON.stringify(unknown)})];
        return Boolean(reward) && unknown.length > 0 &&
          unknown.every(row => reward.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING);
      })()`)).toBe(true);
      expect(await phone.evaluate(`Boolean(${query(claim)})`)).toBe(false);
      expect(await saveOwnsReward()).toBe(true);
    };

    await reload();
    const save = freshBphSave(7);
    grantBphRelic(save, existing);
    save.lifecycle.claimed.push(`relic-notice:${existing}`);
    await phone.evaluate(`localStorage.setItem("haengju1593-meta", ${JSON.stringify(JSON.stringify({ ...freshMeta(), bph: save }))})`);
    await reload();
    await openRelics();
    expect(await phone.evaluate(`Boolean(${query(owned(existing))}) && Boolean(${query(unknown)})`)).toBe(true);
    expect(await phone.evaluate(`Boolean(${query(claim)}) || Boolean(${query(owned(id))})`)).toBe(false);

    await phone.evaluate(`(() => {
      const meta = JSON.parse(localStorage.getItem("haengju1593-meta"));
      meta.bph.discovered.push("Hero1_Squire");
      meta.bph.seen.push("Hero1_Squire");
      localStorage.setItem("haengju1593-meta", JSON.stringify(meta));
    })()`);
    for (let visit = 0; visit < 2; visit++) {
      await reload();
      await openRelics();
      expect(await phone.evaluate(`Boolean(${query(claim)}?.closest('[data-relic-state="claimable"]'))`)).toBe(true);
      expect(await saveOwnsReward()).toBe(false);
    }
    await tap(claim);
    await ready(`Boolean(${query(owned(id))})`);
    await expectClaimed();
    await reload();
    await openRelics();
    await expectClaimed();
    expect(phone.errors).toEqual([]);
  } finally {
    try { await browser.reset(); }
    finally { server.stop(true); }
  }
}, 60000);
