import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { confirmFirstResultUnlock, launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

const root = resolve(import.meta.dir, "..");
const out = process.env.CASTLE_SMOKE_OUT ?? `${root}/review/p10/lobby297/smoke`;
await mkdir(out, { recursive: true });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, `${root}/review-dist`) });
const profile = await mkdtemp(`${tmpdir()}/castle-real-play-`);
const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
const events: unknown[] = [];
const checks: { name: string; pass: boolean; evidence: unknown }[] = [];
const check = (name: string, pass: boolean, evidence: unknown) => {
  checks.push({ name, pass, evidence }); console.log(`SMOKE ${pass ? "PASS" : "FAIL"} ${name}`);
};
const ready = (expression: string, seconds = 30) => phone.evaluate(`new Promise((resolve,reject)=>{
  const end=performance.now()+${seconds * 1000};
  function poll(){if(${expression})requestAnimationFrame(()=>resolve(true));
    else if(performance.now()>end)reject(new Error('UI timeout: '+${JSON.stringify(expression)}));
    else requestAnimationFrame(poll);}poll();
})`);
const motion = () => phone.evaluate(`Promise.all(document.getAnimations().filter(a =>
  a.effect.getComputedTiming().iterations !== Infinity).map(a=>a.finished))`);
async function capture(name: string): Promise<void> {
  await phone.shot(`${out}/${name}.png`);
  const state = await phone.evaluate(`(() => {
    const s=window.castleSample?.snapshot(),d=document.scrollingElement;
    return {time:s?.time,phase:s?.phase,kills:s?.kills,gold:s?.gold,xp:s?.xp,level:s?.level,
      viewport:[innerWidth,innerHeight],document:[d.scrollWidth,d.scrollHeight],scroll:[scrollX,scrollY],
      forbidden:document.body.innerText.match(/미확인|TODO|TBD|placeholder/gi)??[],sound:s?.sound};
  })()`);
  events.push({ name, state });
  console.log(`SMOKE CAPTURE ${name} ${JSON.stringify(state)}`);
}
const fixed = () => phone.evaluate(`(() => {
  const d=document.scrollingElement;return scrollX===0&&scrollY===0&&d.scrollWidth<=innerWidth&&d.scrollHeight<=innerHeight;
})()`);
try {
  await phone.view.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await phone.view.navigate(process.env.CASTLE_SMOKE_URL ?? `http://127.0.0.1:${server.port}/?seed=7`);
  await ready("window.castleSample&&!document.querySelector('#start').disabled");
  await capture("01-lobby");
  await phone.tapElement("#title-settings"); await motion(); await capture("02-settings");
  check("settings document fixed", Boolean(await fixed()), null);
  await phone.tapElement("#settings-close"); await motion(); await phone.tapElement("#start");
  await ready("document.querySelector('[data-bph-start]')"); await motion();
  await phone.tapElement(".bph-actions button");
  await ready("document.querySelector('.bph-web-buy')"); await motion(); await capture("03-upgrade-tree");
  check("upgrade document fixed", Boolean(await fixed()), null);
  await phone.tapElement('.bph-actions button[aria-pressed="true"]'); await motion();
  await phone.tapElement("[data-bph-start]");
  await passFirstBattleGuide(phone);
  await ready("castleSample.snapshot().time>0"); await motion(); await capture("04-battle-start");
  const positions = () => phone.evaluate(`['#app','#arena canvas','.bph-recruit-strip > .bph-recruit-cell'].map(s=>{
    const r=document.querySelector(s).getBoundingClientRect();return [r.x,r.y,r.width,r.height];
  })`);
  const before = await positions(), box = await phone.rect(".bph-recruit-strip > .bph-recruit-cell");
  if (!box) throw new Error("Recruit button absent");
  await phone.view.cdp("Input.dispatchTouchEvent", { type: "touchStart",
    touchPoints: [{x:box.x+box.w/2,y:box.y+box.h/2,id:1}] });
  const pressed = await positions();
  await phone.shot(`${out}/05-recruit-pressed.png`);
  await phone.view.cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await ready("!document.querySelector('.bph-receipt:not(.bph-hire-reveal)').hidden"); await motion(); await capture("06-recruit-open");
  const after = await positions();
  check("recruit positions unchanged", JSON.stringify(before) === JSON.stringify(pressed) && JSON.stringify(before) === JSON.stringify(after), {before,pressed,after});
  check("recruit document fixed", Boolean(await fixed()), null);
  const opening = await phone.evaluate("(()=>{const s=castleSample.snapshot();return {gold:s.gold,xp:s.xp,kills:s.kills,level:s.level}})()");
  let usedSkill = false, dangerCaptured = false, checkpoint = 0;
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    const state = await phone.evaluate(`(()=>{const s=castleSample.snapshot();return {
      time:s.time,phase:s.phase,kills:s.kills,gold:s.gold,xp:s.xp,level:s.level,
      skill:s.squads[0]?.skillClock,telegraphs:s.telegraphs.length,
      choice:!document.querySelector('#choice').hidden,
      receipt:!document.querySelector('.bph-receipt:not(.bph-hire-reveal)').hidden};
    })()`);
    events.push({ name: "play", state });
    if (!state || typeof state !== "object") throw new Error("Missing play state");
    const phase = Reflect.get(state, "phase"), time = Number(Reflect.get(state, "time"));
    if (phase === "lost" || phase === "won") break;
    if (Reflect.get(state, "choice")) await phone.tapElement("#cards button:not(:disabled)");
    if (Reflect.get(state, "receipt")) await phone.tapElement(".bph-receipt:not(.bph-hire-reveal)");
    if (!usedSkill && Number(Reflect.get(state, "skill")) <= 0) {
      await phone.tapElement("#skills button"); usedSkill = true;
      await capture("07-general-skill");
    }
    if (!dangerCaptured && Number(Reflect.get(state, "telegraphs")) > 0) {
      await capture("08-red-range"); dangerCaptured = true;
    }
    if (time >= checkpoint) {
      await capture(`battle-${Math.floor(time)}`); checkpoint = time + 15;
    }
    if (time > 8 && time < 12) {
      await phone.tapElement("#pause"); await motion(); await capture("09-battle-settings");
      check("battle settings document fixed", Boolean(await fixed()), null);
      await phone.tapElement("#resume"); await motion();
    }
    await ready(`(()=>{const s=castleSample.snapshot();return s.phase==='lost'||s.phase==='won'||s.time>${time + 1}
      ||!document.querySelector('#choice').hidden})()`, 10);
  }
  const final = await phone.evaluate("(()=>{const s=castleSample.snapshot();return {phase:s.phase,kills:s.kills,gold:s.gold,xp:s.xp,level:s.level}})()");
  check("mobs killed in real play", Number(Reflect.get(final ?? {}, "kills")) > 0, final);
  check("kill gold increased", Number(Reflect.get(final ?? {}, "gold")) > Number(Reflect.get(opening ?? {}, "gold")), {opening,final});
  check("XP bar progressed", Number(Reflect.get(final ?? {}, "xp")) > Number(Reflect.get(opening ?? {}, "xp"))
    || Number(Reflect.get(final ?? {}, "level")) > Number(Reflect.get(opening ?? {}, "level")), {opening,final});
  check("general skill activated", usedSkill, null);
  check("red range observed naturally", dangerCaptured, null);
  const ended = ["lost","won"].includes(String(Reflect.get(final ?? {}, "phase")));
  check("game over reached", ended, final);
  if (ended) {
    await ready("!document.querySelector('#result').hidden"); await motion(); await capture("10-game-over");
    check("result document fixed", Boolean(await fixed()), null);
    await confirmFirstResultUnlock(phone);
    await phone.tapElement("#retry"); await ready("document.querySelector('[data-bph-start]')"); await motion();
    await phone.tapElement("[data-bph-start]"); await ready("castleSample.snapshot().time>0&&!castleSample.snapshot().attract");
    await capture("11-retry");
    check("retry starts a new real battle", true, null);
  }
  check("no browser errors", phone.errors.length === 0, phone.errors);
  const sourceFiles: string[] = [];
  for await (const path of new Bun.Glob("assets/*.js").scan(`${root}/review-dist`)) sourceFiles.push(path);
  const forbidden = [];
  for (const path of sourceFiles) {
    const text = await Bun.file(`${root}/review-dist/${path}`).text();
    if (/미확인|TODO|TBD|placeholder/.test(text)) forbidden.push(path);
  }
  check("shipped UI forbidden-string scan", forbidden.length === 0, forbidden);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  check("smoke completed", false, message);
  await capture("failure");
} finally {
  await Bun.write(`${out}/smoke.json`, JSON.stringify({checks,events,errors:phone.errors},null,2));
  phone.view.close(); server.stop(true); await rm(profile,{recursive:true,force:true});
}
process.exitCode = checks.every(item=>item.pass) ? 0 : 1;
