import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

for (const [width, height] of [[390, 844], [405, 720], [1440, 900]]) {
  test(`settings stay centred and retain independent audio levels at ${width}x${height}`, async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: request => previewResponse(request, resolve(import.meta.dir, "../review-dist")) });
    const profile = await mkdtemp(`${tmpdir()}/castle-settings-`);
    const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
    const url = `http://127.0.0.1:${server.port}/?seed=7`;
    const out = process.env.CASTLE_SETTINGS_EVIDENCE;
    const ready = (condition: string) => phone.evaluate(`new Promise((resolve,reject)=>{
      const end=performance.now()+30000;
      function check() {
        if(${condition}) return requestAnimationFrame(()=>resolve(true));
        if(performance.now()>end) return reject(new Error("Settings timeout: "+${JSON.stringify(condition)}));
        requestAnimationFrame(check);
      } check();
    })`);
    const checkPanel = async (context: string) => {
      await phone.evaluate(`Promise.all(document.getAnimations().filter(a=>
        a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished))`);
      expect(await phone.evaluate(`(()=>{
        const r=document.querySelector('#intro').getBoundingClientRect();
        return r.width>0 && r.height>0 && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight
          && Math.abs(r.x+r.width/2-innerWidth/2)<=1 && Math.abs(r.y+r.height/2-innerHeight/2)<=1;
      })()`)).toBe(true);
      expect(await phone.evaluate(`(()=>{
        const r=document.querySelector('#intro').getBoundingClientRect();
        return [...document.querySelectorAll('#clock, #pause')]
          .filter(e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden')
          .filter(e=>{const b=e.getBoundingClientRect(); return b.left<r.right && b.right>r.left && b.top<r.bottom && b.bottom>r.top;})
          .map(e=>e.id);
      })()`)).toEqual([]);
      if (out) await phone.shot(`${out}/${context}-${width}x${height}.png`);
    };
    const checkLanguages = async (context: string) => {
      if (await phone.evaluate("document.documentElement.lang !== 'ko'"))
        expect(await phone.tapElement("#toggle-lang")).toBe(true);
      await ready("document.documentElement.lang === 'ko'");
      expect(await phone.evaluate("document.querySelector('[for=\"volume-bgm\"] span').textContent")).toBe("배경음악");
      await checkPanel(`${context}-ko`);
      expect(await phone.tapElement("#toggle-lang")).toBe(true);
      await ready("document.documentElement.lang === 'en'");
      expect(await phone.evaluate("document.querySelector('#volume-bgm').getAttribute('aria-label')")).toBe("Music");
      expect(await phone.evaluate("document.querySelector('#volume-sfx').getAttribute('aria-label')")).toBe("Sound effects");
      await checkPanel(`${context}-en`);
      expect(await phone.tapElement("#toggle-lang")).toBe(true);
      await ready("document.documentElement.lang === 'ko'");
    };
    try {
      if (out) await mkdir(out, { recursive: true });
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      expect(await phone.tapElement("#title-settings")).toBe(true);
      await checkLanguages("title");
      for (const [bus, value] of [["bgm", 37], ["sfx", 68]] as const) {
        await phone.evaluate(`(()=>{
          const input=document.querySelector('#volume-${bus}');
          input.value='${value}';input.dispatchEvent(new Event('input',{bubbles:true}));
        })()`);
      }
      await ready("Math.abs(castleSample.snapshot().sound.bgmGain-.37)<.001 && Math.abs(castleSample.snapshot().sound.sfxGain-.68)<.001");
      expect(await phone.tapElement("#toggle-sound")).toBe(true);
      await ready("castleSample.snapshot().sound.masterGain<.001");
      expect(await phone.tapElement("#toggle-sound")).toBe(true);
      await ready("castleSample.snapshot().sound.masterGain>.999");
      expect(await phone.tapElement("#settings-close")).toBe(true);
      await phone.view.navigate(url);
      await ready("window.castleSample && !document.querySelector('#start').disabled");
      expect(await phone.tapElement("#title-settings")).toBe(true);
      expect(await phone.evaluate("JSON.stringify(['bgm','sfx'].map(bus=>document.querySelector('#volume-'+bus).value))")).toBe('["37","68"]');
      expect(await phone.tapElement("#settings-close")).toBe(true);
      expect(await phone.tapElement("#start")).toBe(true);
      await ready("document.querySelector('[data-bph-start]')");
      expect(await phone.tapElement("[data-bph-start]")).toBe(true);
      await passFirstBattleGuide(phone);
      await ready("!castleSample.snapshot().attract && !castleSample.snapshot().paused");
      expect(await phone.tapElement("#pause")).toBe(true);
      await checkLanguages("battle");
      expect(phone.errors).toEqual([]);
    } finally {
      phone.view.close(); server.stop(true);
      await rm(profile, { recursive: true, force: true });
    }
  }, 120000);
}
