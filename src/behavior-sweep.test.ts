import { expect, test } from "bun:test";
import { advance, ALLY_MAX_PACE, ALLY_SPACING, choose, contactReach, covers, createRun, inFieldPadding, STYLES, useSkill } from "./rules";
import { contains, distance, fortRect, gapToRect, setFieldSize, sideOf } from "./geometry";
import { enemyArt } from "./enemy-animation";
import { ordinaryCard, POLICIES, skillReason } from "./bots";
import { BOSSES } from "./bosses";

test("four starting generals across twelve complete 600s runs preserve movement and skill invariants", () => {
  setFieldSize(370, 800);
  const counts = { insideSoldier: 0, insideIdleGeneral: 0, quarryChanged: 0, engagedDeploy: 0, cavalryWarned: 0, ordinaryWarned: 0 };
  let warned = 0, nearbyTicks = 0, awayTicks = 0, counterPushTicks = 0, generalNearbyTicks = 0, generalHomewardTicks = 0, generalCounterPushTicks = 0;
  try {
    for (const [g, general] of (["권율", "김시민", "곽재우", "황진"] as const).entries()) for (let seed = 1; seed <= 3; seed++) {
      const run = createRun(g * 3 + seed, general);
      run.endless = true; run.base = run.maxBase = 1e12;
      const births = new Map<number, number>(), wall = fortRect(0);
      for (let tick = 0; tick < 6000; tick++) {
        if (run.phase === "choice") choose(run, ordinaryCard(run));
        for (const squad of run.squads) if (skillReason(run, squad, POLICIES.timed)) useSkill(run, squad.id);
        const locked = run.squads.filter(squad => run.enemies.some(e => e.id === squad.aim && e.hp > 0 && distance(e, squad) < 70));
        const knownEnemies = new Map(run.enemies.map(e => [e.id, e]));
        const nearbyGenerals = run.squads.filter(s => s.state === "guard" && !run.telegraphs.some(mark => covers(mark, s))).flatMap(squad => {
          const radius = STYLES[squad.general] === "hunter" ? 170 : 120;
          const foes = run.enemies.filter(e => e.hp > 0 && distance(e, squad) <= 90).sort((a, b) => distance(a, squad) - distance(b, squad))
            .map(e => ({ id: e.id, x: e.x, y: e.y }));
          return foes.length ? [{ squad, radius, post: squad.post, aim: squad.aim, foes, x: squad.x, y: squad.y }] : [];
        });
        const tracking = run.squads.flatMap(s => s.soldiers.map((unit, index) => ({ unit, squad: s.id, index }))).map(({ unit, squad, index }) => {
          const quarry = run.enemies.find(e => e.id === unit.quarry);
          return { unit, squad, index, striking: unit.strikeAt > 0, quarry, quarryAt: quarry ? { x: quarry.x, y: quarry.y } : undefined,
            eligible: !!quarry && quarry.hp > 0 && !contains(fortRect(0, 8), quarry) && gapToRect(wall, quarry) <= 130, x: unit.x, y: unit.y };
        });
        const allies = run.squads.flatMap(squad => [squad, ...squad.soldiers]).map(unit => ({
          unit, x: unit.x, y: unit.y, hp: unit.hp, state: unit.kind === "general" ? run.squads.find(squad => squad === unit)?.state : undefined,
        }));
        const effects = advance(run, .1);
        const court = fortRect(run.fort, -32);
        for (const { unit, x, y, hp, state } of allies) {
          if (hp > 0 && unit.hp > 0 && state !== "down") {
            const speed = unit.kind === "panokseon" ? 30 : unit.kind === "general" ? state === "charge" ? 420 : 168 : 170;
            // A soldier's step is its varied pace plus at most one spacing of body separation.
            const limit = unit.kind === "panokseon" || unit.kind === "general" ? speed * .1 : speed * .1 * ALLY_MAX_PACE + ALLY_SPACING;
            expect(distance({ x, y }, unit)).toBeLessThanOrEqual(limit + 1e-6);
          }
          if (unit.hp <= 0 || unit.perch !== undefined || unit.kind === "panokseon" || !contains(wall, unit) || contains(court, unit) || run.walls[sideOf(wall, unit)] <= 0) continue;
          const gate = Math.abs(unit.x - (wall.left + wall.right) / 2) < 16 && unit.y >= court.bottom;
          expect(gate).toBe(true);
        }
        const resisted = effects.some(effect => {
          const target = effect.target === undefined ? undefined : knownEnemies.get(effect.target) ?? run.enemies.find(enemy => enemy.id === effect.target);
          return effect.kind === "hit" && target?.bossArt && BOSSES[target.bossArt].resist === "melee";
        });
        for (const { squad, radius, post, aim, foes, x, y } of nearbyGenerals) if (squad.state === "guard" && squad.post === post) {
          const home = { x: squad.homeX, y: squad.homeY }, eligible = foes.filter(foe => distance(foe, home) <= radius);
          const foe = eligible.find(foe => foe.id === aim && distance({ x, y }, foe) < 70) ?? eligible[0];
          if (!foe) continue;
          generalNearbyTicks++;
          const homeward = (squad.x - x) * (home.x - x) + (squad.y - y) * (home.y - y) > 0;
          if (homeward && distance(squad, foe) > distance({ x, y }, foe) + .01) {
            const swung = effects.some(effect => effect.kind === "swing" && effect.squad === squad.id && effect.index === -1);
            if (swung && resisted && Math.abs(distance({ x, y }, squad) - 6) < .000001) generalCounterPushTicks++;
            else generalHomewardTicks++;
          }
        }
        for (const effect of effects) {
          if (effect.kind === "deploy" && locked.some(s => s.id === effect.squad)) counts.engagedDeploy++;
          if (effect.kind !== "telegraph") continue;
          const owner = run.enemies.find(e => e.id === effect.target) ?? knownEnemies.get(effect.target ?? -1);
          if (!owner) throw new Error("Telegraph owner must exist on its creation tick");
          warned++;
          if (enemyArt(owner).base === "cavalry") counts.cavalryWarned++;
          if (!owner.elite && !owner.boss && owner.kind !== "ship") counts.ordinaryWarned++;
        }
        for (const { unit, squad, index, striking, quarry, quarryAt, eligible, x, y } of tracking) {
          if (eligible && quarry && quarry.hp > 0 && unit.quarry !== quarry.id) counts.quarryChanged++;
          if (eligible && unit.hp > 0 && quarry && quarryAt && quarry.hp > 0 && unit.quarry === quarry.id && distance({ x, y }, quarryAt) <= 110 && !contains(fortRect(0, 10), { x, y })) {
            nearbyTicks++;
            // Body separation may give way inside weapon reach, or from an enemy still beyond the field padding.
            if (distance(unit, quarryAt) > distance({ x, y }, quarryAt) + .01 && distance(unit, quarryAt) > contactReach(run, unit) + 1e-6 && inFieldPadding(quarryAt)) {
              // Counter-push happens after movement and is not a chosen goal.
              const swung = effects.some(effect => effect.kind === "swing" && effect.squad === squad && effect.index === index);
              if (striking && swung && resisted) counterPushTicks++;
              else awayTicks++;
            }
          }
        }
        for (const squad of run.squads) {
          const exiting = squad.targetX === (wall.left + wall.right) / 2 && squad.targetY >= wall.bottom;
          if (squad.state === "guard" && contains(wall, squad) && !exiting && !run.enemies.some(e => e.hp > 0 && e.breach && contains(wall, e))) counts.insideIdleGeneral++;
          for (const unit of squad.soldiers) {
            if (!births.has(unit.id)) births.set(unit.id, run.time);
            if (run.time - (births.get(unit.id) ?? 0) > 4 && unit.kind !== "archer" && unit.kind !== "hwacha" && contains(wall, unit)) counts.insideSoldier++;
          }
        }
      }
      expect(run.time).toBeCloseTo(600, 5);
    }
    console.log("P5 behavior sweep", { ...counts, warned, nearbyTicks, awayTicks, counterPushTicks, generalNearbyTicks, generalHomewardTicks, generalCounterPushTicks });
    expect(counts).toEqual({ insideSoldier: 0, insideIdleGeneral: 0, quarryChanged: 0, engagedDeploy: 0, cavalryWarned: 0, ordinaryWarned: 0 });
    expect(warned).toBeGreaterThan(0);
    expect(awayTicks).toBe(0);
    expect(generalNearbyTicks).toBeGreaterThan(0);
    expect(generalHomewardTicks / generalNearbyTicks).toBeLessThanOrEqual(.02);
  } finally { setFieldSize(390, 650); }
}, 120000);
