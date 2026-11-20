
import { createHash } from "node:crypto";
import { freshMeta } from "../src/meta";
import { createBphRun } from "../src/bph-session";
import { createBphShop, buyBphOffer } from "../src/bph-shop";
import { hitBphPack } from "../src/bph-combat";
import { advance, chooseGeneral, generalHandOpen } from "../src/rules";
import { CENTER, setFieldSize } from "../src/geometry";
setFieldSize(370, 800);
const out: Record<string, string> = {};
for (let seed = 1; seed <= 12; seed++) {
  const meta = freshMeta();
  const run = createBphRun(meta, { seed, general: "권율", upgrades: [] });
  const battle = run.bph!, shop = createBphShop(battle.save, battle.upgrades);
  for (let t = 0; t < 20; t++) advance(run, .05);
  const before = battle.save.inventory.length;
  battle.save.coins = run.gold;
  if (!buyBphOffer(battle.save, shop, 0)) throw new Error("buy failed " + seed);
  run.gold = battle.save.coins;
  const acquired = battle.save.inventory[before];
  battle.packs.push({ ...acquired, hp: 1, x: CENTER.x, y: CENTER.y + 70 });
  hitBphPack(run, acquired.id);
  for (let t = 0; t < 600; t++) {
    advance(run, .05);
    if (generalHandOpen(run)) chooseGeneral(run, run.generalOffers[0]);
  }
  out[seed] = createHash("sha256").update(JSON.stringify(run)).digest("hex");
  if (seed === 1) console.log("soldiers", run.squads[0].soldiers.length, "gold", run.gold, "time", run.time.toFixed(2), "receipt", JSON.stringify(battle.receipts[0]));
}
console.log(JSON.stringify(out));
