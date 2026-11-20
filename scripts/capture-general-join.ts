import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { launch, passFirstBattleGuide, sleep } from "./review-browser";
import { previewResponse } from "./serve";
import { BPH_GENERALS } from "../src/bph-commanders";
import { freshBphSave } from "../src/bph-save";

const [build = "review-dist", out = "review/general-join", part = "all"] = Bun.argv.slice(2);
await mkdir(out, { recursive: true });
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: request => previewResponse(request, build) });
const save = freshBphSave(7);
save.unlockedGenerals = [...BPH_GENERALS];
const account = JSON.stringify({ version: 4, runs: 5, merit: 0, earned: 0, nodes: [], bph: save });
const log: Record<string, unknown>[] = [];

async function session(width: number, height: number, lang: "ko" | "en", join: boolean): Promise<void> {
  const profile = await mkdtemp(`${tmpdir()}/castle-general-join-`);
  const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
  const ready = (condition: string, ms = 45000) => phone.evaluate(`new Promise((resolve,reject)=>{
    const end=performance.now()+${ms};function check(){
      if(${condition})return resolve(true);
      if(performance.now()>end)return reject(new Error("State timeout: "+${JSON.stringify(condition)}));
      requestAnimationFrame(check);
    }check();
  })`);
  const tag = `${width}x${height}-${lang}`;
  try {
    await phone.view.navigate(`http://127.0.0.1:${server.port}`);
    await phone.evaluate(`(()=>{localStorage.setItem("haengju1593-lang",${JSON.stringify(lang)});localStorage.setItem("haengju1593-meta",${JSON.stringify(account)});})()`);
    await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=1`);
    await ready("window.castleSample && document.querySelector('#start') && !document.querySelector('#start').disabled");
    await phone.tapElement("#start");
    await ready("document.querySelector('[data-bph-start]')");
    await phone.tapElement("[data-bph-start]");
    await ready("castleSample.snapshot().phase==='playing' && !castleSample.snapshot().attract");
    await passFirstBattleGuide(phone);
    // A capture rig, not play: the starter and the walls hold so the battle reaches the 170 s beat in real time.
    await phone.evaluate(`(()=>{const s=castleSample.snapshot();for(const q of s.squads)q.hp=q.maxHp=1e8;for(const side of Object.keys(s.walls))s.walls[side]=1e9;})()`);
    await ready("castleSample.snapshot().generalOffers.length>0", 400000);
    // The phone in Korean also records the reveal (dim, drum, the two cards turning in) and, below, the gate entrance as numbered frames.
    const frames = width === 390 && lang === "ko";
    if (frames) for (const [index, wait] of [0, 120, 160, 200, 300].entries()) { await sleep(wait); await phone.shot(`${out}/${tag}-reveal-${index}.png`); }
    await ready("document.querySelectorAll('.card.join .join-sprite img').length>0 && [...document.querySelectorAll('.card.join .join-sprite img')].every(img=>img.complete&&img.naturalWidth>0)");
    await sleep(900);
    await phone.shot(`${out}/${tag}-hand.png`);
    // The hand stands over the running battle: the clock and the enemies keep moving while it waits for an answer.
    const before = await phone.evaluate("JSON.stringify({time:castleSample.snapshot().time,foes:castleSample.snapshot().enemies})");
    await sleep(1000);
    const running = { before: JSON.parse(String(before)), after: JSON.parse(String(await phone.evaluate("JSON.stringify({time:castleSample.snapshot().time,foes:castleSample.snapshot().enemies,open:castleSample.snapshot().generalOffers.length})"))) };
    console.log(tag, "running", JSON.stringify(running));
    const hand = await phone.evaluate(`(()=>{const s=castleSample.snapshot(),vw=innerWidth,vh=innerHeight;
      const cards=[...document.querySelectorAll('#cards .card.join')].map(card=>{const r=card.getBoundingClientRect();
        const overflow=[...card.querySelectorAll('strong,b,small,.join-ribbon')].filter(e=>e.scrollWidth>e.clientWidth+1||e.getBoundingClientRect().right>r.right+1||e.getBoundingClientRect().left<r.left-1).map(e=>e.textContent);
        return {general:card.dataset.general,label:card.getAttribute('aria-label'),texts:[...card.querySelectorAll('.join-ribbon,strong,b,small')].map(e=>e.textContent),
          box:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},inside:r.left>=0&&r.top>=0&&r.right<=vw&&r.bottom<=vh,overflow};});
      return {time:s.time,phase:s.phase,offers:s.generalOffers,cards};})()`);
    console.log(tag, "hand", JSON.stringify(hand));
    let joined: unknown = null;
    if (join) {
      await phone.tapElement("#cards .card.join");
      if (frames) { await sleep(90); await phone.shot(`${out}/${tag}-picked.png`); await sleep(60); await phone.shot(`${out}/${tag}-picked-glint.png`); }
      await ready("castleSample.snapshot().phase==='playing' && castleSample.snapshot().squads.length===2");
      await phone.evaluate(`(()=>{const q=castleSample.snapshot().squads[1];q.hp=q.maxHp=1e8;})()`);
      if (frames) for (const [index, wait] of [250, 200, 200, 200, 300].entries()) { await sleep(wait); await phone.shot(`${out}/${tag}-entrance-${index}.png`); }
      await sleep(700);
      await phone.shot(`${out}/${tag}-gate.png`);
      await sleep(2300);
      await phone.shot(`${out}/${tag}-joined.png`);
      const buttons = await phone.evaluate("document.querySelectorAll('#skills button').length");
      await phone.tapElement("#skills button:nth-child(2)");
      await sleep(250);
      await phone.shot(`${out}/${tag}-skill.png`);
      joined = await phone.evaluate(`(()=>{const s=castleSample.snapshot(),q=s.squads[1];return {time:s.time,general:q.general,x:q.x,y:q.y,soldiers:q.soldiers.length,
        skills:s.metrics.skills,generalTimes:s.metrics.generalTimes,buttons:[...document.querySelectorAll('#skills button')].map(b=>b.dataset.general)};})()`);
      console.log(tag, "joined", buttons, JSON.stringify(joined));
    }
    log.push({ tag, hand, running, joined, errors: phone.errors });
  } finally {
    phone.view.close(); await rm(profile, { recursive: true, force: true });
  }
}
// One browser process shares storage between its views, so each language and size runs on its own, one after another.
const sessions: [number, number, "ko" | "en", boolean][] = [[390, 844, "ko", true], [390, 844, "en", true], [405, 670, "ko", true], [1440, 900, "ko", true], [320, 700, "ko", true], [320, 700, "en", true]];
for (const args of sessions.filter((_, index) => part === "all" || part === String(index % 2))) await session(...args);
await writeFile(`${out}/capture-${part}.json`, JSON.stringify(log, null, 2));
server.stop(true);
