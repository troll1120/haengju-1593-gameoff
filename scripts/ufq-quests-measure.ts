import assert from "node:assert/strict";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { createBphRun } from "../src/bph-session";
import { activeBphEffects } from "../src/bph-upgrades";
import { projectBphSalary } from "../src/bph-account";
import { bphConsumers, bphFxContext, bindBphConsumers, dispatchBphEffects, updateBphPointer } from "../src/bph-fx-dispatch";
import { advance, choose, chooseGeneral, hitBphEnemy, useSkill } from "../src/rules";
import { ordinaryCard } from "../src/bots";
import { restockBphRecruit } from "../src/bph-supply";
import { buyBphRecruit } from "../src/bph-recruit";
import { hitBphPack } from "../src/bph-combat";
import { prepareBphFieldShop } from "../src/bph-shop-session";
import { CENTER, setFieldSize } from "../src/geometry";
import { survivalFixture } from "./survival-fixtures";

// Same .05-second step, .5-second decisions, targeting, recruitment and joins as
// survival-sim.ts. The idle cohort omits all input. Observers never mutate combat.
const rows = [];
const chapters = process.env.UFQ_CHAPTER ? [Number(process.env.UFQ_CHAPTER)] : [1, 2, 3, 4];
assert(chapters.every(chapter => Number.isInteger(chapter) && chapter >= 1 && chapter <= 4));
for (const chapter of chapters) {
  for (const cohort of [
    { state: "none", policy: "idle" },
    { state: "typical", policy: "cursor0" },
    { state: "typical", policy: "active2Hz" },
    { state: "full144", policy: "active2Hz" },
  ] as const) for (let seed = 1; seed <= Number(process.env.UFQ_SEEDS ?? 3); seed++) {
    const fixture = await survivalFixture(cohort.state), meta = freshMeta(), save = freshBphSave(seed);
    meta.bph = save; save.chapter = chapter - 1;
    save.purchasedPlacements = [...fixture.purchasedPlacements];
    const upgrades = activeBphEffects(save);
    projectBphSalary(save, upgrades);
    setFieldSize(370, 800);
    const run = createBphRun(meta, { seed, general: "권율", upgrades, startBattle: false });
    const battle = run.bph, context = bphFxContext(run);
    assert(battle && context);
    const kills: Record<string, number> = {}, spawned: Record<string, number> = {};
    bindBphConsumers(context, [...bphConsumers(), {
      id: "troops", kinds: [], consume() {},
      onEvent(_ctx, event) {
        if (event.kind === "enemy-killed" || event.kind === "enemy-spawn") {
          const id = event.enemy.bphProfileId ?? event.enemy.kind;
          const tally = event.kind === "enemy-killed" ? kills : spawned;
          tally[id] = (tally[id] ?? 0) + 1;
        }
      },
    }], false);
    dispatchBphEffects(run, { kind: "run-start" });
    prepareBphFieldShop(run);
    const initialCastle = run.base;
    let steps = 0;
    while (steps < 18002 && run.phase !== "won" && run.phase !== "lost") {
      if (run.phase === "choice") { choose(run, ordinaryCard(run)); continue; }
      if (run.phase === "general") { chooseGeneral(run, run.generalOffers[0]); continue; }
      if (cohort.policy !== "idle" && steps % 10 === 0) {
        for (const squad of run.squads) useSkill(run, squad.id);
        const shop = restockBphRecruit(run), slot = shop.offers.findIndex(offer => !offer.sold);
        if (slot >= 0) {
          const pack = buyBphRecruit(run, shop, slot);
          if (pack) battle.packs.push({ ...pack, hp: 2, x: CENTER.x, y: CENTER.y + 70 });
        }
        for (const pack of [...battle.packs]) {
          hitBphPack(run, pack.id, "reveal"); hitBphPack(run, pack.id, "reveal");
        }
      }
      if (cohort.policy === "active2Hz") {
        const target = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship").sort((a, b) =>
          Number(Boolean(b.breach)) - Number(Boolean(a.breach)) || Number(b.boss) - Number(a.boss) ||
          Math.hypot(a.x - CENTER.x, a.y - CENTER.y) - Math.hypot(b.x - CENTER.x, b.y - CENTER.y) || a.id - b.id)[0];
        if (target) {
          updateBphPointer(run, target);
          if (steps % 10 === 0) hitBphEnemy(run, target.id);
        }
      }
      advance(run, .05); steps++;
      battle.fxEvents.length = 0;
    }
    rows.push({ chapter, ...cohort, seed, phase: run.phase, seconds: run.time,
      initialCastle, castle: run.base, walls: run.walls, kills, spawned });
  }
}
await Bun.write("gate-out/measure.json", JSON.stringify(rows, null, 2) + "\n");
console.log(`MEASURE rows=${rows.length}`);
