import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { strict as assert } from "node:assert";
import { chaosArena, chaosEnemy } from "../src/chaos-test-fixture";
import { addBphProfile } from "../src/bph-combat";
import { advance, chooseGeneral, useSkill } from "../src/rules";
import type { Effect, Run } from "../src/rules";
import { BPH_GENERALS } from "../src/bph-commanders";
import { chaosState } from "../src/chaos-state";
import { raiseChaosLevel, feedChaosGeneral } from "../src/chaos-growth";
import { CENTER, fortRect, guardPoint, setFieldSize, WIDTH } from "../src/geometry";
import { BELL_SHOW, bellPlace } from "../src/shows/heal-wave-show";
import { BPH_CASTLE_UNLOCK_PLACEMENTS } from "../src/bph-castle-buildings";
import { openBphPack } from "../src/bph";
import { skillVfx } from "../src/skill-vfx";
import { previewResponse } from "./serve";
import { militiaAmbush } from "../src/skills-unique";
import { reviewBrowserSession, passFirstBattleGuide } from "./review-browser";

const [build = "review-dist", folder = "round10-captures", source, mode = "all"] = Bun.argv.slice(2);
assert(source, "Exact source description is required");
const out = resolve(folder);
await mkdir(out, { recursive: true });
const server = Bun.serve({ port: 0, hostname: "127.0.0.1",
  fetch: request => previewResponse(request, resolve(build)) });
const browser = reviewBrowserSession();
type Frame = { run: string; effects: Effect[]; shot?: string };
const frame = (run: Run, effects: Effect[] = [], shot?: string): Frame => ({ run: JSON.stringify(run), effects, shot });
const manifest: unknown[] = [];
try {
  const viewports = mode === "defense-desktop" ? [[1280, 800]] : ["juice", "bell", "rings"].includes(mode) ? [[390, 844]] : [[390, 844], [1280, 800]];
  for (const [width, height] of viewports) {
    const page = await browser.open(width, height), tag = `${width}x${height}`;
    await page.view.cdp("Page.addScriptToEvaluateOnNewDocument", { source:
      'localStorage.setItem("haengju1593",JSON.stringify({story:true,muted:true,firstBattleGuide:true}));'
      + (mode === "juice" ? 'localStorage.setItem("haengju1593.damageNumbersOn","on");' : "") });
    await page.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
    const ready = (condition: string) => page.evaluate(`new Promise((resolve,reject)=>{
      const end=performance.now()+45000;function check(){try{if(${condition})return resolve(true);
      if(performance.now()>end)return reject(new Error(${JSON.stringify(condition)}));
      requestAnimationFrame(check);}catch(error){reject(error)}}check()})`);
    await ready("window.castleSample && !document.querySelector('#start').disabled");
    await page.shot(`${out}/${tag}-title.png`);
    await page.tapElement("#start");
    await ready("document.querySelector('[data-bph-start]')");
    await page.tapElement("[data-bph-start]");
    await passFirstBattleGuide(page);
    await ready("castleSample.snapshot().time>1 && !castleSample.snapshot().paused");
    const field = await page.evaluate("castleSample.snapshot().field") as { width: number; height: number };
    setFieldSize(field.width, field.height);
    type Property = { name: string; value?: { objectId?: string; type?: string } };
    const properties = (objectId: string) => page.view.cdp("Runtime.getProperties", { objectId, ownProperties: true }) as Promise<{
      result: Property[]; internalProperties?: Property[];
    }>;
    const fn = await page.view.cdp("Runtime.evaluate", { expression: "castleSample.snapshot" }) as { result: { objectId: string } };
    const scopes = (await properties(fn.result.objectId)).internalProperties?.find(p => p.name === "[[Scopes]]")?.value?.objectId;
    assert(scopes, "Snapshot scopes missing");
    let game = false, live = false;
    for (const scope of (await properties(scopes)).result) if (scope.value?.objectId) {
      for (const variable of (await properties(scope.value.objectId)).result) {
        if (variable.value?.type !== "object" || !variable.value.objectId) continue;
        const result = await page.view.cdp("Runtime.callFunctionOn", { objectId: variable.value.objectId, returnByValue: true,
          functionDeclaration: `function(){
            if(this&&this.scene&&this.scene.getScene&&this.canvas){globalThis.__captureGame=this;return "game"}
            if(this&&Array.isArray(this.squads)&&Array.isArray(this.enemies)&&this.metrics&&this.bph){globalThis.__captureRun=this;return "run"}
            return "";
          }` }) as { result: { value?: string } };
        game ||= result.result.value === "game"; live ||= result.result.value === "run";
      }
      if (game && live) break;
    }
    assert(game && live, "Live game and run bindings missing");
    await page.evaluate(`(()=>{
      __captureGame.loop.stop();globalThis.__captureScene=__captureGame.scene.getScene("castle");
      globalThis.__captureNow=__captureScene.time.now+2000;return true;
    })()`);
    const cases: { name: string; frames: Frame[]; proof?: unknown }[] = [];
    if (mode === "bell") {
      for (const position of ["west", "default"] as const) {
        const run = chaosArena("사명대사", 1), squad = run.squads[0];
        const at = guardPoint(run.fort, position === "west" ? "좌" : "아래", position === "west" ? 18 : 40);
        Object.assign(squad, { ...at, homeX: at.x, homeY: at.y, targetX: at.x, targetY: at.y,
          post: position === "west" ? "좌" : "아래", stay: true });
        run.bph = { ...run.bph!, upgrades: [...run.bph!.upgrades, ...Object.values(BPH_CASTLE_UNLOCK_PLACEMENTS).map(placementId => ({
          nodeId: placementId, type: "BuildingActivateTwiceChance" as const, value: 0,
          effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: { placementId },
        }))] };
        const effects = useSkill(run, squad.id), event = run.chaosSkills!.events.find(event => event.kind === "bell")!;
        assert(event && event.trigger === "manual", "Manual bell event missing");
        const frames = [frame(run, effects)];
        for (let tick = 1; tick <= 12; tick++) {
          const batch = advance(run, 1 / 30);
          frames.push(frame(run, batch, [6, 10, 12].includes(tick) ? `bell-${position}-tick${tick}` : undefined));
        }
        const hung = bellPlace(at, run.fort, BELL_SHOW.scale, true), wall = fortRect(run.fort);
        const pole = { left: hung.x + 15, right: hung.x + 39, top: hung.y - 1, bottom: hung.y + 11 };
        assert(pole.right <= wall.left || pole.left >= wall.right || pole.bottom <= wall.top || pole.top >= wall.bottom,
          "The full moving pole box intersects the wall");
        cases.push({ name: `bell-${position}`, frames, proof: { at, hung, wall, pole } });
      }
    }
    if (mode === "rings") {
      for (const general of ["곽재우", "김시민"] as const) {
        const run = chaosArena(general, 1), squad = run.squads[0];
        squad.x = squad.homeX = squad.targetX = field.width * .3;
        squad.y = squad.homeY = squad.targetY = 210;
        const target = chaosEnemy(run, field.width * .55, 270);
        target.hp = target.maxHp = 1e9;
        const effects = general === "곽재우"
          ? militiaAmbush({ run, squad, aim: { x: target.x, y: target.y } })
          : useSkill(run, squad.id);
        const frames = [frame(run, effects)];
        for (let tick = 0; tick < 24; tick++)
          frames.push(frame(run, advance(run, 1 / 30), tick === 8 ? `${general}-trigger`
            : tick === 14 ? `${general}-range` : tick === 23 ? `${general}-active` : undefined));
        cases.push({ name: general, frames });
      }
    }
    if (!["extras", "prism", "defense-desktop", "juice", "bell", "rings"].includes(mode)) {
    const idle = chaosArena("권율", 0), lead = idle.squads[0];
    idle.commandClock = 0;
    lead.state = "down"; lead.hp = 0; lead.downUntil = 1e9;
    addBphProfile(idle, { profileId: "Hero1_Squire", copies: 8, foil: false, discovered: false }, { packId: "Pack1_Basic" });
    addBphProfile(idle, { profileId: "Hero1_Barbarian", copies: 8, foil: false, discovered: false }, { packId: "Pack1_Basic" });
    for (let tick = 0; tick < 600; tick++) advance(idle, 1 / 30);
    assert.equal(lead.soldiers.filter(unit => unit.x < WIDTH / 2).length, 8);
    assert.equal(lead.soldiers.filter(unit => unit.x >= WIDTH / 2).length, 8);
    cases.push({ name: "idle-8-8", frames: [frame(idle, [], "idle-8-8")] });
    for (const general of BPH_GENERALS) {
      const run = chaosArena(general, 0), squad = run.squads[0];
      squad.x = squad.homeX = squad.targetX = field.width * .28;
      squad.y = squad.homeY = squad.targetY = 170;
      squad.clock = 0;
      const ranged = general === "이순신" || general === "곽재우" || general === "송상현";
      chaosEnemy(run, squad.x + (ranged ? Math.min(100, field.width * .32) : 28), squad.y);
      const frames: Frame[] = [];
      let release = -1, impact = -1;
      for (let tick = 0; tick < 60; tick++) {
        const effects = advance(run, 1 / 30);
        if (release < 0 && effects.some(e => e.index === -1 && (e.kind === "shot" || e.kind === "swing"))) release = tick;
        if (impact < 0 && effects.some(e => e.kind === "hit" && e.projectile?.source === "general")) impact = tick;
        assert(!effects.some(e => e.mechanism === "special"), "Parked special emitted an effect");
        frames.push(frame(run, effects));
      }
      assert(release >= 0, `${general} did not release a basic attack`);
      frames[Math.min(release + 1, frames.length - 1)].shot = `basic-${general}`;
      if (general === "송상현") {
        assert(impact > release, "Tablet never hit after flight");
        for (const offset of [0, 2, 4]) frames[impact + offset].shot = `tablet-impact-${offset}`;
      }
      cases.push({ name: `basic-${general}`, frames, proof: { release, impact, specialParked: true } });
    }
    const joined = chaosArena("권율", 0), shared = chaosState(joined)!;
    joined.time = 170; joined.bph!.save.unlockedGenerals = [...BPH_GENERALS];
    raiseChaosLevel(shared, 7); shared.xp += 3.5;
    const xp = shared.xp;
    joined.generalOffers = ["황진"];
    const joinEffects = chooseGeneral(joined, "황진");
    assert.equal(joined.squads.length, 2); assert.equal(shared.xp, xp);
    const joinedFrames = [frame(joined, joinEffects, "shared-join-level7")];
    joined.gold = 100; assert(feedChaosGeneral(joined)); assert.equal(shared.level, 8);
    for (const squad of joined.squads) {
      chaosEnemy(joined, squad.x + 20, squad.y);
      squad.skillClock = 0; useSkill(joined, squad.id);
    }
    const levels = joined.squads.map(squad => joined.chaosSkills?.events.filter(e => e.squad === squad.id).at(-1)?.level);
    assert.deepEqual(levels, [8, 8]);
    joinedFrames.push(frame(joined, [], "shared-growth-level8"));
    cases.push({ name: "shared-join", frames: joinedFrames, proof: { xpBeforeJoin: xp, castLevels: levels } });
    }
    if (mode === "extras" || mode === "defense-desktop") {
      const defense = chaosArena("권율", 0), squad = defense.squads[0], wall = fortRect(defense.fort);
      squad.state = "down"; squad.hp = 0; squad.downUntil = 1e9;
      for (const profileId of ["Hero1_Squire", "Hero1_Barbarian"])
        addBphProfile(defense, { profileId, copies: 8, foil: false, discovered: false }, { packId: "Pack1_Basic" });
      squad.soldiers.forEach((unit, i) => Object.assign(unit, {
        x: i % 2 ? wall.right + 32 : wall.left - 32,
        y: wall.top - 70 - Math.floor(i / 2) * 3, emerging: false, clock: 1e9, strikeAt: 0,
      }));
      const north = chaosEnemy(defense, CENTER.x, wall.top - 85);
      north.hp = north.maxHp = 1e9; north.stun = 1e9;
      for (let tick = 0; tick < 30; tick++) advance(defense, 1 / 30);
      const south = chaosEnemy(defense, CENTER.x, wall.bottom + 8);
      south.hp = south.maxHp = 1e9; south.clock = 0; south.goalY = wall.bottom;
      const defenseFrames = [frame(defense, [], "castle-defense-initial")];
      for (let tick = 0; tick < 540; tick++) advance(defense, 1 / 30);
      const responders = squad.soldiers.filter(unit => unit.quarry === south.id).map(unit => unit.id);
      assert(responders.length > 0 && responders.length < 16, "Defense must send a subset of the north troops");
      defenseFrames.push(frame(defense, [], "castle-defense-arrival"));
      cases.push({ name: "castle-defense", frames: defenseFrames, proof: { responders, south: south.id } });
    }
    if (mode === "extras" || mode === "prism") {
      const prism = chaosArena("권율", 0), save = prism.bph!.save;
      save.packs.Pack1_Basic = { opened: 26, sinceNewHero: 0, sinceNewFoil: 0 };
      const first = openBphPack(save, { packId: "Pack1_Basic", effects: [] });
      assert.equal(first.cards[0].foilDiscovered, true);
      prism.bph!.receipts = [first];
      const prismFrames = [frame(prism, [], "prism-first-discovery")];
      save.packs.Pack1_Basic = { opened: 0, sinceNewHero: 0, sinceNewFoil: 0 };
      const repeat = openBphPack(save, { packId: "Pack1_Basic", effects: [
        { nodeId: "capture-foil", type: "OpenTargetPackFoilChance", value: 1, effectPower: 1,
          effectPowerScale: 0, stackCap: 0, countStep: 0, targets: { targetPack: "Pack1_Basic" } },
      ] });
      assert.equal(repeat.cards[0].foilDiscovered, false);
      assert.equal(repeat.cards[0].foil, true);
      assert.equal(repeat.cards[0].profileId, "Hero1_Squire");
      prism.bph!.receipts = [repeat];
      prismFrames.push(frame(prism, [], "prism-repeat-discovery"));
      cases.push({ name: "prism-repeat", frames: prismFrames, proof: { first: first.cards[0], repeat: repeat.cards[0] } });
    }
    if (mode === "juice") for (const [level, awakened] of [[1, 0], [10, 0], [20, 2]]) {
      const growth = chaosArena("이순신", level), squad = growth.squads[0];
      squad.x = squad.homeX = squad.targetX = field.width / 2;
      squad.y = squad.homeY = squad.targetY = 210;
      squad.tier = awakened + 1; squad.awakened = awakened;
      squad.skillClock = 0;
      for (let i = 0; i < 48; i++) {
        const target = chaosEnemy(growth, field.width / 2 - 95 + i % 12 * 17, 280 + Math.floor(i / 12) * 18);
        target.hp = target.maxHp = 1e8;
      }
      const frames: Frame[] = [];
      for (let tick = 0; tick < 60; tick++) {
        const effects = tick === 0 ? useSkill(growth, 0) : advance(growth, 1 / 30);
        frames.push(frame(growth, effects, [0, 8, 16, 28, 40, 52].includes(tick)
          ? `juice-lv${level}-aw${awakened}-${tick}` : undefined));
      }
      cases.push({ name: `juice-lv${level}-aw${awakened}`, frames,
        proof: { level: growth.chaos!.level, awakened, look: skillVfx(growth, squad), targets: 48 } });
    }
    for (const item of cases) {
      await page.evaluate(`(()=>{
        const scene=__captureScene;
        scene.uniqueSkillView?.clear();scene.positions.clear();scene.entered.clear();
        scene.troops.forEach(t=>{t.leader.sprite.destroy();t.troopers.forEach(u=>u.sprite.destroy())});scene.troops=[];
        scene.foes.forEach(s=>s.destroy());scene.foes.clear();scene.strides.clear();
        scene.missiles.forEach(s=>s.destroy());scene.missiles.clear();
        scene.children.list.filter(o=>o.texture?.key==="tablet-hit").forEach(o=>o.destroy());
        return true;
      })()`);
      const shots: unknown[] = [];
      for (const entry of item.frames) {
        const proof = await page.evaluate(`(()=>{
          const scene=__captureScene,s=${entry.run},batch=${JSON.stringify(entry.effects)};
          const battle=__captureRun.bph;
          if(battle&&s.bph){
            for(const key of Object.keys(battle))delete battle[key];
            Object.assign(battle,s.bph);s.bph=battle;
          }
          for(const key of Object.keys(__captureRun))delete __captureRun[key];
          Object.assign(__captureRun,s);scene.accumulator=0;scene.frames=4;scene.hitStopUntil=0;
          __captureNow+=1000/30;scene.time.update(__captureNow,1000/30);scene.tweens.update(__captureNow,1000/30);
          scene.children.list.forEach(o=>{if(o.anims)o.anims.update(__captureNow,1000/30)});
          if(${JSON.stringify(mode)}==="rings"){
            scene.aim.touch({x:s.squads[0].x+60,y:170});
            scene.aim.drag({x:s.squads[0].x+80,y:160},1);
          }
          const stage=scene.stage;scene.stage=function(e,...args){
            if(["juice","rings"].includes(${JSON.stringify(mode)}))args[2]=1000/30;
            return stage.call(this,[...e,...batch],...args);
          };
          try{scene.update(__captureNow,0)}finally{scene.stage=stage}
          scene.entered.clear();
          scene.game.renderer.preRender();scene.game.scene.render(scene.game.renderer);scene.game.renderer.postRender();
          return {time:s.time,level:s.chaos?.level,xp:s.chaos?.xp,
            ...(${JSON.stringify(mode)}==="rings"?{battle:JSON.stringify(__captureRun),aim:scene.aim.ring}:{}),
            soldiers:scene.troops.flatMap(t=>t.troopers.map(u=>({id:u.unitId,key:u.sprite.anims.currentAnim?.key}))),
            tablets:scene.children.list.filter(o=>o.texture?.key==="tablet-hit").map(o=>({frame:o.frame.name,x:o.x,y:o.y,visible:o.visible,scale:o.scaleX})),
            prism:{marks:document.querySelectorAll(".bph-crack-mark").length,portraits:document.querySelectorAll(".bph-codex-prism").length},
            skills:[...document.querySelectorAll("#skills button")].map(b=>({general:b.dataset.general,label:b.getAttribute("aria-label"),hidden:b.hidden}))};
        })()`);
        if (entry.shot?.startsWith("tablet-impact")) {
          const shown = proof as { tablets: { visible: boolean; scale: number }[] };
          assert(shown.tablets.some(tablet => tablet.visible && tablet.scale === 2), "Readable tablet splinters missing");
        }
        if (entry.shot === "prism-repeat-discovery") {
          await ready('document.querySelector(".bph-codex-prism")');
          const shown = proof as { prism: { marks: number; portraits: number } };
          shown.prism = await page.evaluate(`({marks:document.querySelectorAll(".bph-crack-mark").length,
            portraits:document.querySelectorAll(".bph-codex-prism").length})`) as typeof shown.prism;
          assert.equal(shown.prism.marks, 0);
          assert(shown.prism.portraits > 0, "Repeat foil portrait missing");
        }
        if (entry.shot) {
          const path = `${tag}-${entry.shot}.png`;
          await page.shot(`${out}/${path}`);
          shots.push({ path, proof });
        }
      }
      manifest.push({ viewport: [width, height], field, name: item.name, proof: item.proof, shots, errors: [...page.errors] });
      await Bun.write(`${out}/manifest.json`, JSON.stringify({ source, method: "Real rules snapshots replayed through the built Phaser update and HUD; controlled fixtures, no drawn replacement effects.", cases: manifest }, null, 2));
      assert.equal(page.errors.length, 0, page.errors.join("\n"));
      console.log("ROUND10_CAPTURE", tag, item.name);
    }
    await browser.reset();
  }
} finally {
  await browser.close(); server.stop(true);
}
console.log("ROUND10_CAPTURES_DONE exit=0");
