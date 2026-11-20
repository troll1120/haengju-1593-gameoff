import { expect, test } from "bun:test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { closeBrowser } from "./browser-cleanup";
import { previewResponse } from "./serve";

test("upgrade close releases input and a recruit receipt settles without replacing its icon", async () => {
  const out = process.env.JUICE_UI_EVIDENCE;
  const label = process.env.JUICE_UI_LABEL ?? "after";
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, resolve(process.env.CASTLE_TEST_DIST ?? `${import.meta.dir}/../review-dist`)) });
  const profile = await mkdtemp(`${tmpdir()}/castle-juice-ui-`);
  const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
  const ready = (condition: string) => phone.evaluate(`new Promise((resolve,reject)=>{
    const end=performance.now()+45000; function check(){
      if(${condition}) return resolve(true);
      if(performance.now()>end) return reject(new Error("UI timeout: "+${JSON.stringify(condition)}));
      requestAnimationFrame(check);
    } check();
  })`);
  const shot = async (name: string) => { if (out) await phone.shot(`${out}/${label}-${name}.png`); };
  const receipt = ".bph-receipt:not(.bph-hire-reveal)";
  // A first discovery holds as the "?" card and opens after three taps on the card itself (76847bb2).
  const crack = async () => {
    await ready(`document.querySelector('${receipt}.bph-cracking')`);
    for (let hit = 0; hit < 3; hit++) {
      const mark = await phone.rect(`${receipt} .bph-reveal-art`);
      if (!mark) throw new Error("Discovery card is missing");
      await phone.tap({ x: mark.x + mark.w / 2, y: mark.y + mark.h / 2 });
      await ready(hit === 2 ? `document.querySelector('${receipt}.bph-landed')` :
        `document.querySelectorAll('${receipt} .bph-discovery-ray').length === ${hit + 1}`);
    }
  };
  try {
    if (out) await mkdir(out, { recursive: true });
    await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
    // The game now starts in English (714f9572); the Korean captions below come from the saved Settings choice.
    await phone.evaluate("localStorage.setItem('haengju1593-lang','ko')");
    await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
    await ready("window.castleSample && document.querySelector('#start') && !document.querySelector('#start').disabled");
    expect(await phone.tapElement("#start")).toBe(true);
    await ready("document.querySelector('[data-bph-start]')");
    await phone.tapElement(".bph-actions button");
    await ready("document.querySelector('[data-prep-group=\"shared\"]')");
    await ready("[...document.querySelectorAll('.bph-web img')].every(i=>i.complete)");
    await shot("upgrade");
    await phone.evaluate(`(()=>{
      const animate=Element.prototype.animate;
      Element.prototype.animate=function(...args){
        const animation=Reflect.apply(animate,this,args);
        if(this.matches('.bph-side')) { animation.pause();window.upgradeExit=animation; }
        return animation;
      };
      const root=document.querySelector('.bph-web');
      document.querySelector('.bph-actions button[aria-pressed="true"]').click();
      window.localUpgradeExit=root.getAnimations().filter(a=>a.animationName==='ui-close')
        .map(a=>a.effect.getTiming().duration);
    })()`);
    await ready("window.upgradeExit");
    const close = await phone.evaluate(`(()=>{
      const animation=window.upgradeExit,side=document.querySelector('.bph-side');
      const duration=animation.effect.getTiming().duration;animation.currentTime=duration/10;
      return {localExit:window.localUpgradeExit,ownerDuration:duration,inert:side.inert,
        viewport:[innerWidth,innerHeight]};
    })()`);
    await shot("upgrade-close-mid");
    if (out) await Bun.write(`${out}/${label}-upgrade-close.json`, JSON.stringify(close, null, 2));
    await phone.evaluate("window.upgradeExit.cancel()");
    await ready("!document.querySelector('.bph-web')");
    expect(close).toEqual({ localExit: [], ownerDuration: 100, inert: true, viewport: [390, 844] });
    expect(await phone.tapElement("[data-bph-start]")).toBe(true);
    await ready("castleSample.snapshot().phase==='playing' && !castleSample.snapshot().attract");
    await passFirstBattleGuide(phone);
    await phone.evaluate(`(()=>{
      const s=castleSample.snapshot();
      for(const q of s.squads)q.hp=q.maxHp=1e8;
      for(const u of s.squads.flatMap(q=>q.soldiers))u.hp=u.maxHp=1e8;
    })()`);
    await ready("document.querySelector('.bph-recruit-strip > .bph-recruit-cell:not(:disabled)')");
    await phone.tapElement(".bph-recruit-strip > .bph-recruit-cell");
    await ready("!document.querySelector('.bph-receipt:not(.bph-hire-reveal)').hidden");
    await shot("reel-start");
    await ready("!document.querySelector('.bph-receipt:not(.bph-hire-reveal)').classList.contains('bph-spinning')");
    await shot("reel-stop");
    await crack();
    await phone.evaluate("(()=>{window.receiptIcon=document.querySelector('.bph-receipt:not(.bph-hire-reveal) .bph-reveal-portrait');window.receiptStopped=performance.now()})()");
    await ready("performance.now()-window.receiptStopped>=250");
    await shot("reel-settled");
    const settled = await phone.evaluate(`(()=>{
      const s=castleSample.snapshot(),r=document.querySelector('.bph-receipt:not(.bph-hire-reveal)');
      window.receiptFixture=structuredClone(s.bph.receipts[0]);
      window.receiptRng=s.bph.save.rng;window.receiptOpened=s.bph.save.totalOpened;
      return {landed:r.classList.contains('bph-landed'),
        sameIcon:Boolean(window.receiptIcon)&&window.receiptIcon===r.querySelector('.bph-reveal-portrait'),
        result:s.bph.receipts[0],caption:r.querySelector('strong').textContent,
        rng:s.bph.save.rng,opened:s.bph.save.totalOpened,
        rect:{width:innerWidth,height:innerHeight},
        animations:r.getAnimations({subtree:true}).map(a=>({state:a.playState,duration:a.effect.getTiming().duration}))};
    })()`);
    // No confirm button any more: a tap anywhere dismisses the landed reveal (the reveal itself takes no pointer events).
    const rolled = await phone.evaluate("window.receiptFixture.multiplier ?? 1") as number;
    await phone.tapElement(".bph-receipt:not(.bph-hire-reveal)");
    await ready("document.querySelector('.bph-receipt:not(.bph-hire-reveal)').hidden");
    const acknowledged = await phone.evaluate(`(()=>{
      const s=castleSample.snapshot();return {preserved:s.bph.save.rng===window.receiptRng&&s.bph.save.totalOpened===window.receiptOpened,
        receipts:s.bph.receipts.length,pending:s.bph.save.pendingResults.length};
    })()`);
    for (let frame = 0; frame < 4; frame++) {
      await ready("castleSample.snapshot().enemyUnits.length>0");
      await shot(`attack-${frame}`);
      await phone.evaluate("new Promise(resolve=>requestAnimationFrame(()=>resolve(true)))");
    }
    if (out) await Bun.write(`${out}/${label}-receipt.json`, JSON.stringify({ settled, acknowledged, errors: phone.errors }, null, 2));
    expect(settled).toMatchObject({ landed: true, sameIcon: true, rect: { width: 390, height: 844 } });
    expect(acknowledged).toMatchObject({ preserved: true, receipts: 0, pending: 0 });
    for (const mode of [
      { name: "motion-off", motion: true, flashes: false, reduced: false, foil: false },
      { name: "flashes-off", motion: false, flashes: true, reduced: false, foil: false },
      { name: "reduced-motion", motion: false, flashes: false, reduced: true, foil: false },
      { name: "rare", motion: false, flashes: false, reduced: false, foil: true },
      { name: "early-skip", motion: false, flashes: false, reduced: false, foil: false },
    ]) {
      await phone.tapElement("#pause");
      await phone.evaluate(`(()=>{
        for(const [id,off] of ${JSON.stringify([["toggle-motion", mode.motion], ["toggle-flashes", mode.flashes]])}){
          const button=document.getElementById(id);
          if(button.getAttribute("aria-pressed")!==String(off))button.click();
        }
      })()`);
      await phone.tapElement("#resume");
      await phone.view.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: mode.reduced ? "reduce" : "no-preference" }] });
      await phone.evaluate(`(()=>{
        const s=castleSample.snapshot(),result=structuredClone(window.receiptFixture);
        result.id=s.bph.save.nextResultId++;result.cards[0].foil=${mode.foil};
        s.bph.receipts.push(result);s.bph.save.pendingResults.push(result);
        window.presentationBefore=JSON.stringify({rng:s.bph.save.rng,resources:s.bph.save.resources,
          opened:s.bph.save.totalOpened,inventory:s.bph.save.inventory});
      })()`);
      await ready("!document.querySelector('.bph-receipt:not(.bph-hire-reveal)').hidden");
      if (mode.name !== "early-skip") {
        await crack();
        await ready("document.querySelector('.bph-receipt:not(.bph-hire-reveal)').classList.contains('bph-landed')");
      }
      const channels = await phone.evaluate(`(()=>{
        const r=document.querySelector('.bph-receipt:not(.bph-hire-reveal)'),a=r.firstElementChild;
        return {motion:getComputedStyle(a).animationName,flash:getComputedStyle(r,'::after').animationName,
          duration:getComputedStyle(a).animationDuration,caption:r.querySelector('strong').textContent,
          rare:r.classList.contains('bph-rare'),count:r.querySelector('.bph-reveal-count')?.textContent??null,
          fresh:r.querySelector('.bph-reveal-new')?.textContent??null,
          reward:r.querySelector('.bph-reveal-reward')?.hidden===false?r.querySelector('.bph-reveal-reward').getAttribute('aria-label'):null,
          rewardText:r.querySelector('.bph-reveal-reward')?.hidden===false?r.querySelector('.bph-reveal-reward').textContent:null,
          rewardIcon:Boolean(r.querySelector('.bph-reveal-reward:not([hidden]) > img')),
          portrait:(p=>p?{motion:getComputedStyle(p).animationName,duration:getComputedStyle(p).animationDuration}:null)(r.querySelector('.bph-reveal-portrait')),
          rays:[...r.querySelectorAll('.bph-discovery-ray')].map(ray=>({foil:ray.classList.contains('foil'),motion:getComputedStyle(ray).animationName})),
          burst:(b=>b?{motion:getComputedStyle(b).animationName,display:getComputedStyle(b).display}:null)(r.querySelector('.bph-discovery-burst')),
          blocking:getComputedStyle(r).pointerEvents};
      })()`);
      if (mode.motion || mode.reduced) expect(channels).toMatchObject({ motion: "none", caption: "창병", rare: false, blocking: "none" });
      if (mode.flashes || mode.reduced) expect(channels).toMatchObject({ flash: "none" });
      // 0fd6c66c replaced the rare card's hail and landed flash with the join-fx burst; a foil discovery pops its
      // portrait out of three rainbow rays (76847bb2).
      if (mode.foil) expect(channels).toMatchObject({ motion: "none", flash: "none", caption: "창병", rare: true, count: `×${rolled}`, blocking: "none",
        portrait: { motion: "bph-discovery-pop", duration: "0.42s" }, burst: { motion: "bph-burst", display: "block" },
        rays: [1, 2, 3].map(() => ({ foil: true, motion: "bph-ray-out" })) });
      // Upgrade points show as the mastery icon and number; the words stay in the accessible name (abaf9f3c).
      if (mode.name !== "early-skip") expect(channels).toMatchObject({ fresh: "새 발견!", reward: "강화 포인트 +10", rewardText: "+10", rewardIcon: true });
      if (mode.reduced) {
        await phone.evaluate("window.reducedIcon=document.querySelector('.bph-receipt:not(.bph-hire-reveal) > span').firstElementChild");
        await phone.view.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
        await phone.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))");
        expect(await phone.evaluate(`(()=>{
          const r=document.querySelector('.bph-receipt:not(.bph-hire-reveal)');return {landed:r.classList.contains('bph-landed'),
            stable:r.firstElementChild.firstElementChild===window.reducedIcon};
        })()`)).toEqual({ landed: true, stable: true });
      }
      await shot(mode.reduced ? "reduced-motion-returned" : mode.name);
      if (mode.name === "early-skip") {
        // Reels run on the battle clock and a held card takes only taps on itself (9d4d4d34, 76847bb2):
        // a tap elsewhere before it opens neither lands nor dismisses it; the card taps then land it.
        const arena = await phone.rect("#arena canvas");
        if (!arena) throw new Error("Arena is missing");
        await phone.tap({ x: arena.x + arena.w / 2, y: arena.y + arena.h * .35 });
        await phone.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))");
        expect(await phone.evaluate(`(()=>{const r=document.querySelector('${receipt}');
          return {hidden:r.hidden,cracking:r.classList.contains('bph-cracking'),landed:r.classList.contains('bph-landed')};})()`))
          .toEqual({ hidden: false, cracking: true, landed: false });
        await crack();
        await ready("document.querySelector('.bph-receipt:not(.bph-hire-reveal)').classList.contains('bph-landed') && !document.querySelector('.bph-receipt:not(.bph-hire-reveal)').classList.contains('bph-spinning')");
        expect(await phone.evaluate("document.querySelector('.bph-receipt:not(.bph-hire-reveal) strong').textContent")).toBe("창병");
        await phone.tapElement(".bph-receipt:not(.bph-hire-reveal)");
        await ready("document.querySelector('.bph-receipt:not(.bph-hire-reveal)').classList.contains('bph-closing')");
        await phone.evaluate("document.querySelector('.bph-receipt:not(.bph-hire-reveal)').getAnimations().filter(a=>a.animationName==='ui-close').forEach(a=>a.cancel())");
      } else await phone.tapElement(receipt);
      await ready("document.querySelector('.bph-receipt:not(.bph-hire-reveal)').hidden");
      expect(await phone.evaluate(`(()=>{
        const s=castleSample.snapshot();return {
          preserved:window.presentationBefore===JSON.stringify({rng:s.bph.save.rng,resources:s.bph.save.resources,
            opened:s.bph.save.totalOpened,inventory:s.bph.save.inventory}),
          receipts:s.bph.receipts.length,pending:s.bph.save.pendingResults.length,
          caption:document.querySelector('.bph-receipt:not(.bph-hire-reveal) strong').textContent};
      })()`)).toMatchObject({ preserved: true, receipts: 0, pending: 0, caption: "창병" });
      if (out) await Bun.write(`${out}/${label}-${mode.name}.json`, JSON.stringify(channels, null, 2));
    }
    expect(phone.errors).toEqual([]);
  } finally {
    server.stop(true);
    await closeBrowser(phone.view, profile);
  }
}, 90000);
