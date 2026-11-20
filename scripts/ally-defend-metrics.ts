import { measureDefense } from "./ally-defend-fixture";
import { freshMeta } from "../src/meta";
import { createBphRun, ensureBphSave } from "../src/bph-session";
import { addBphProfile, hitBphPack } from "../src/bph-combat";
import { buyBphOffer, createBphShop } from "../src/bph-shop";
import { advance, useSkill } from "../src/rules";
import { setFieldSize } from "../src/geometry";
import { updateBphPointer } from "../src/bph-fx-dispatch";
import { mkdir } from "node:fs/promises";

const [label = "before", folder = "out"] = Bun.argv.slice(2);
await mkdir(folder, { recursive: true });
await Bun.write(`${folder}/${label}-defense.json`, JSON.stringify(measureDefense()));
const rows = [];
for (const army of [false, true]) for (const seed of [144, 42, 1593, 2026, 8192]) for (const input of ["ready", "observed"] as const) {
  setFieldSize(370, 800);
  const meta = freshMeta(), save = ensureBphSave(meta);
  buyBphOffer(save, createBphShop(save, []), 0);
  const run = createBphRun(meta, { seed, general: "권율", upgrades: [] });
  hitBphPack(run, save.inventory[0].id);
  hitBphPack(run, save.inventory[0].id);
  if (army) for (const profileId of ["Hero1_Squire", "Hero1_Barbarian"]) {
    addBphProfile(run, { profileId, copies: 8, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  }
  let next = 3.67;
  if (input === "observed") updateBphPointer(run, { x: 145, y: 470 });
  while (run.phase === "playing" && run.time < 900) {
    advance(run, 1 / 30);
    if (input === "ready") useSkill(run, 0);
    else if (run.time >= next) { useSkill(run, 0); next += 8.4; }
  }
  rows.push({ army, seed, input, time: run.time, phase: run.phase, base: run.base, lossCause: run.lossCause,
    firstRoundPassed: run.time >= 50 });
}
await Bun.write(`${folder}/${label}-balance.json`, JSON.stringify(rows, null, 2));
console.log(JSON.stringify({ label, rows }));
