import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { launch, passFirstBattleGuide } from "./review-browser";
import { previewResponse } from "./serve";
import { bphRecruitMultiplier } from "../src/bph-recruit";

const [build = "review-dist", out = "review/recruit-roulette"] = Bun.argv.slice(2);
await mkdir(`${out}/frames`, { recursive: true });
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: request => previewResponse(request, build) });
const seed = Array.from({ length: 60 }, (_, i) => i + 1).find(s => bphRecruitMultiplier(s, 0) >= 3 && bphRecruitMultiplier(s, 1) === 1) ?? 7;
console.log(`seed ${seed}: rolls ${[0, 1, 2].map(n => `x${bphRecruitMultiplier(seed, n)}`).join(", ")}`);
const log: Record<string, unknown>[] = [];
async function session(width: number, height: number, lang: "ko" | "en", video: boolean): Promise<void> {
  const profile = await mkdtemp(`${tmpdir()}/castle-recruit-roulette-`);
  const phone = await launch("about:blank", profile, width, height, ["--single-process", "--no-zygote", "--disable-gpu"]);
  const ready = (condition: string) => phone.evaluate(`new Promise((resolve,reject)=>{
    const end=performance.now()+45000;function check(){
      if(${condition})return resolve(true);
      if(performance.now()>end)return reject(new Error("State timeout: "+${JSON.stringify(condition)}));
      requestAnimationFrame(check);
    }check();
  })`);
  const tag = `${width}x${height}-${lang}`;
  try {
    await phone.view.navigate(`http://127.0.0.1:${server.port}`);
    await phone.evaluate(`localStorage.setItem("haengju1593-lang", ${JSON.stringify(lang)})`);
    await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=${seed}`);
    await ready("window.castleSample && document.querySelector('#start') && !document.querySelector('#start').disabled");
    await phone.tapElement("#start");
    await ready("document.querySelector('[data-bph-start]')");
    await phone.tapElement("[data-bph-start]");
    await ready("castleSample.snapshot().phase==='playing' && !castleSample.snapshot().attract");
    await passFirstBattleGuide(phone);
    await phone.evaluate(`(()=>{const s=castleSample.snapshot();for(const q of s.squads){q.hp=q.maxHp=1e8;for(const u of q.soldiers)u.hp=u.maxHp=1e8;}})()`);
    await ready("!castleSample.snapshot().paused && castleSample.snapshot().time>0 && document.querySelector('.bph-recruit-strip > .bph-recruit-cell:not(:disabled)')");
    await phone.shot(`${out}/${tag}-before.png`);
    const frames: { file: string; at: number }[] = [];
    await phone.tapElement(".bph-recruit-strip > .bph-recruit-cell");
    const started = performance.now();
    if (video) {
      while (performance.now() - started < 2600) {
        const file = `${out}/frames/${tag}-${String(frames.length).padStart(3, "0")}.png`;
        await phone.shot(file); frames.push({ file, at: performance.now() - started });
      }
    } else {
      await ready("!document.querySelector('.bph-receipt:not(.bph-hire-reveal)').hidden && document.querySelector('.bph-receipt:not(.bph-hire-reveal)').classList.contains('bph-spinning')");
      await phone.shot(`${out}/${tag}-spin.png`);
    }
    await ready("document.querySelector('.bph-receipt:not(.bph-hire-reveal):is(.bph-cracking,.bph-landed)')");
    if (await phone.evaluate("Boolean(document.querySelector('.bph-receipt:not(.bph-hire-reveal).bph-cracking'))")) {
      for (let hit = 0; hit < 3; hit++) await phone.tapElement(".bph-receipt:not(.bph-hire-reveal) .bph-reveal-art");
    }
    await ready("document.querySelector('.bph-receipt:not(.bph-hire-reveal).bph-landed')");
    const landed = await phone.evaluate(`(()=>{const r=document.querySelector('.bph-receipt:not(.bph-hire-reveal)'),s=castleSample.snapshot();
      return {hidden:r.hidden,landed:r.classList.contains('bph-landed'),name:r.querySelector('strong')?.textContent,count:r.querySelector('.bph-reveal-count')?.textContent??null,
        art:r.querySelector('.bph-reveal-art')?.getBoundingClientRect().toJSON(),receipt:s.bph.receipts[0]??null,soldiers:s.squads[0].soldiers.length,gold:s.gold,
        button:document.querySelector('.bph-recruit-strip > .bph-recruit-cell').textContent};})()`);
    if (!video) await phone.shot(`${out}/${tag}-landed.png`);
    await ready("document.querySelector('.bph-receipt:not(.bph-hire-reveal)').hidden");
    await phone.shot(`${out}/${tag}-after.png`);
    log.push({ tag, seed, landed, frames: frames.length });
    console.log(tag, JSON.stringify(landed));
    if (video && frames.length) {
      const list = frames.map((frame, i) => `file '${frame.file.replace(`${out}/`, "")}'\nduration ${(((frames[i + 1]?.at ?? frame.at + 66) - frame.at) / 1000).toFixed(3)}`).join("\n") + `\nfile '${frames.at(-1)!.file.replace(`${out}/`, "")}'\n`;
      await writeFile(`${out}/frames.txt`, list);
      const ffmpeg = Bun.spawn(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", "frames.txt", "-vf", "format=yuv420p,scale=trunc(iw/2)*2:trunc(ih/2)*2", "-r", "30", "-c:v", "libx264", "-crf", "20", `recruit-roulette-${tag}.mp4`], { cwd: out, stdout: "ignore", stderr: "pipe" });
      const err = await new Response(ffmpeg.stderr).text();
      const code = await ffmpeg.exited;
      console.log(`ffmpeg exit ${code} frames ${frames.length} span ${Math.round(frames.at(-1)!.at)}ms`);
      if (code !== 0) console.log(err.slice(-800));
    }
  } finally {
    phone.view.close(); await rm(profile, { recursive: true, force: true });
  }
}
await session(390, 844, "ko", true);
await session(390, 844, "en", false);
await session(405, 720, "ko", false);
await writeFile(`${out}/capture.json`, JSON.stringify(log, null, 2));
server.stop(true);
