// Rules-only equivalent of review-skill.ts's 390x844 no-input scout.
// Usage: bun scripts/scout-army.ts <general> <level> [seconds=60]
import { BPH_GENERALS } from "../src/bph-commanders";
import { BPH_ARMY_TRAINING } from "../src/bph-army-training";
import { freshBphSave } from "../src/bph-save";
import { activeBphEffects, buyBphNode, prepareBphUpgrades } from "../src/bph-upgrades";
import { createBphRun } from "../src/bph-session";
import { enterBphImprovements, projectBphSalary, startBphCampaignAttempt } from "../src/bph-account";
import { freshMeta } from "../src/meta";
import { setFieldSize } from "../src/geometry";
import { advance, chooseGeneral, generalHandOpen } from "../src/rules";
import { skillUpgradeCount } from "../src/skill-growth";

const [name, levelText, secondsText = "60"] = Bun.argv.slice(2);
const general = BPH_GENERALS.find(value => value === name);
const level = Number(levelText), seconds = Number(secondsText);
if (!general || !Number.isInteger(level) || level < 0 || level > 20
  || !Number.isInteger(seconds) || seconds < 1) throw new Error("Usage: scout-army.ts <general> <level 0..20> [seconds=60]");
await prepareBphUpgrades();
const save = freshBphSave();
save.unlockedGenerals = [...BPH_GENERALS];
if (level > 0) {
  save.resources.mastery = 2901;
  for (const id of ["_SkillTreeMain_Demo:23:15", ...BPH_ARMY_TRAINING.slice(0, level).map(p => p.id)])
    if (!buyBphNode(save, id)) throw new Error(`Training purchase failed: ${id}`);
}
const fixtureLevel = skillUpgradeCount(general, activeBphEffects(save));
if (fixtureLevel !== level) throw new Error(`Fixture army level is ${fixtureLevel}, not ${level}`);
const meta = { ...freshMeta(), version: 4, bph: save };
// begin() sizes the full phone arena before the management screen and battle.
setFieldSize(Math.round(800 * 390 / 844 / 2) * 2, 800);
createBphRun(meta, { seed: 1593, general: "권율", upgrades: activeBphEffects(save), startBattle: false });
projectBphSalary(save, activeBphEffects(save));
startBphCampaignAttempt(save);
enterBphImprovements(save);
const run = createBphRun(meta, { seed: 7, general, upgrades: activeBphEffects(save) });
advance(run, 1 / 30);
if ((run.chaos?.level ?? 0) !== level || (level === 0 && run.chaos))
  throw new Error(`Army level is ${run.chaos?.level ?? 0}, not ${level}`);
for (let second = 1; second <= seconds; second++) {
  const window = { pools: 0, rings: 0, trails: 0, militia: 0, fleet: 0, stomps: 0, armyShots: 0, beltPulse: false };
  while (run.time < second && run.phase !== "won" && run.phase !== "lost") {
    if (generalHandOpen(run)) chooseGeneral(run, run.generalOffers[0]);
    const belt = run.chaos?.nextBeltTick;
    advance(run, 1 / 30);
    const c = run.chaos;
    for (const key of ["pools", "rings", "trails", "militia", "fleet", "stomps"] as const)
      window[key] = Math.max(window[key], c?.[key].length ?? 0);
    window.armyShots = Math.max(window.armyShots, run.shots.filter(shot => shot.chaosDamage || (shot.chaosPierce ?? 0) > 0).length);
    if (c?.mods.general === "김시민" && c.nextBeltTick !== belt) window.beltPulse = true;
  }
  const c = run.chaos;
  console.log(JSON.stringify({
    second, time: run.time, phase: run.phase, skillClock: run.squads[0].skillClock,
    ready: run.squads[0].skillClock === 0, level: c?.level ?? 0, tick: c?.tick ?? 0,
    pools: c?.pools.length ?? 0, rings: c?.rings.length ?? 0, trails: c?.trails.length ?? 0,
    militia: c?.militia.length ?? 0, fleet: c?.fleet.length ?? 0, stomps: c?.stomps.length ?? 0,
    fleetDue: c ? c.fleet.some(pass => c.tick >= pass.dueTick && c.tick < pass.untilTick) : false,
    nextFleetTick: c?.mods.general === "이순신" ? c.nextFleetTick : null,
    nextBeltTick: c?.mods.general === "김시민" ? c.nextBeltTick : null,
    window,
    rng: run.rng, kills: run.kills, gold: run.gold, enemies: run.enemies.length,
  }));
  if (run.phase === "won" || run.phase === "lost") break;
}
