import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";

const label = Bun.argv[2] ?? "after";
const root = resolve(Bun.argv[3] ?? "review-dist");
const out = process.env.JUICE_ATTACK_EVIDENCE ?? "evidence-attack";
await mkdir(out, { recursive: true });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
  fetch: request => previewResponse(request, root) });
const profile = await mkdtemp(`${tmpdir()}/castle-juice-attack-`);
const phone = await launch("about:blank", profile, 390, 844, ["--single-process", "--no-zygote", "--disable-gpu"]);
const ready = (condition: string) => phone.evaluate(`new Promise((resolve,reject)=>{
  const end=performance.now()+45000;function check(){
    if(${condition})return resolve(true);
    if(performance.now()>end)return reject(new Error("Attack timeout: "+${JSON.stringify(condition)}));
    requestAnimationFrame(check);
  }check();
})`);
try {
  await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
  await ready("window.castleSample && document.querySelector('#start') && !document.querySelector('#start').disabled");
  await phone.tapElement("#start");
  await ready("document.querySelector('[data-bph-start]')");
  await phone.tapElement("[data-bph-start]");
  await passFirstBattleGuide(phone);
  await ready("document.querySelector('.bph-recruit-strip > .bph-recruit-cell:not(:disabled)')");
  await phone.tapElement(".bph-recruit-strip > .bph-recruit-cell");
  await ready("castleSample.snapshot().feedback.numbers>0");
  const frames: unknown[] = [];
  for (let index = 0; index < 6; index++) {
    frames.push(await phone.evaluate(`(()=>{
      const s=castleSample.snapshot();return {at:performance.now(),time:s.time,
        feedback:structuredClone(s.feedback),enemies:s.enemyUnits.map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp}))};
    })()`));
    await phone.shot(`${out}/${label}-contact-${index}.png`);
    await phone.evaluate("new Promise(resolve=>{let n=0;requestAnimationFrame(function f(){if(++n===3)resolve(true);else requestAnimationFrame(f)})})");
  }
  await Bun.write(`${out}/${label}-contact.json`, JSON.stringify({ label, root, seed: 7, viewport: [390, 844], frames, errors: phone.errors }, null, 2));
  if (phone.errors.length) throw new AggregateError(phone.errors, "Attack capture browser errors");
  console.log(`ATTACK_CAPTURE_EXIT=0 label=${label}`);
} finally {
  phone.view.close(); server.stop(true);
  await rm(profile, { recursive: true, force: true });
}
