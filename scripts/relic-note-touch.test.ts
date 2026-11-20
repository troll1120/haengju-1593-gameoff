import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { grantBphRelic } from "../src/bph-account";
import { launch } from "./review-browser";
import { previewResponse } from "./serve";

// The seed owns relics but equips none. Only a real touch may equip the sandals.
// This catches the slot hint consuming the list and the status row intercepting its touch.
const sizes = [[320, 568], [390, 844], [405, 670], [1440, 900]] as const;
for (const lang of ["ko", "en"]) for (const [width, height] of sizes) {
  test(`slot note leaves the relic equip target reachable at ${width}x${height} ${lang}`, async () => {
    const meta = freshMeta(), save = freshBphSave();
    for (const id of ["R_HeroMoveSpeed", "Relic1_Club", "R_RareSacrificeGainPack", "Relic3_Cursed_RitualDagger"]) {
      grantBphRelic(save, id);
      save.lifecycle.claimed.push(`relic-notice:${id}`);
    }
    meta.bph = save;
    const dist = process.env.CASTLE_REVIEW_DIST ?? resolve(import.meta.dir, "../review-dist");
    const out = process.env.RELIC_TOUCH_EVIDENCE ?? resolve(import.meta.dir, "../review/relic-note-touch");
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, dist) });
    const profile = await mkdtemp(`${tmpdir()}/relic-note-touch-`);
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const url = `http://127.0.0.1:${server.port}/?seed=7`;
    const ready = (expression: string) => phone.evaluate(`new Promise((resolve,reject)=>{
      const end=performance.now()+30000;
      function check(){if(${expression})resolve(true);
        else if(performance.now()>end)reject(new Error("UI timeout: "+${JSON.stringify(expression)}));
        else requestAnimationFrame(check);}check();
    })`);
    try {
      await mkdir(out, { recursive: true });
      await phone.view.navigate(url);
      await phone.evaluate(`(()=>{
        localStorage.setItem('haengju1593-lang',${JSON.stringify(lang)});
        localStorage.setItem('haengju1593-meta',${JSON.stringify(JSON.stringify(meta))});
        return true;
      })()`);
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      expect(await phone.tapElement("#start")).toBe(true);
      await ready(`document.querySelector('[data-bph-tab="relics"]')`);
      await phone.evaluate(`document.querySelector('[data-bph-tab="relics"]').scrollIntoView({block:"nearest",inline:"nearest"})`);
      expect(await phone.tapElement('[data-bph-tab="relics"]')).toBe(true);
      await ready(`document.querySelector('.bph-relic-list [data-relic-state="owned"][data-relic="R_HeroMoveSpeed"]')`);
      await phone.evaluate("document.fonts.ready");
      await ready("!document.getAnimations().some(a=>a.effect.getComputedTiming().iterations!==Infinity&&(a.pending||a.playState==='running'))");
      await phone.evaluate(`document.querySelector('[data-relic="R_HeroMoveSpeed"]').scrollIntoView({block:'center'})`);
      const hitIsCard = await phone.evaluate(`(()=>{
        const card=document.querySelector('[data-relic="R_HeroMoveSpeed"]'),r=card.getBoundingClientRect();
        return card.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
      })()`);
      expect(hitIsCard).toBe(true);
      expect(await phone.tapElement('[data-relic="R_HeroMoveSpeed"]')).toBe(true);
      await phone.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      await phone.shot(`${out}/equipped-${width}x${height}-${lang}.png`);
      expect(await phone.evaluate(`document.querySelector('[data-relic="R_HeroMoveSpeed"]').getAttribute('aria-pressed')`)).toBe("true");
      expect(await phone.evaluate(`JSON.parse(localStorage.getItem('haengju1593-meta')).bph.relicState.equipped`)).toEqual(["R_HeroMoveSpeed"]);
      expect(phone.errors).toEqual([]);
    } finally {
      phone.view.close();
      server.stop(true);
      await rm(profile, { recursive: true, force: true });
    }
  }, 120000);
}
