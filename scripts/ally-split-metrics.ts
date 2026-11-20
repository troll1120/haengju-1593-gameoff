import { measureMarch } from "./ally-march-fixture";
import { freshMeta } from "../src/meta";
import { createBphRun, ensureBphSave } from "../src/bph-session";
import { hitBphPack } from "../src/bph-combat";
import { buyBphOffer, createBphShop } from "../src/bph-shop";
import { advance, useSkill } from "../src/rules";
import { setFieldSize } from "../src/geometry";
import { updateBphPointer } from "../src/bph-fx-dispatch";
import { mkdir } from "node:fs/promises";

const [label = "before", folder = "out"] = Bun.argv.slice(2);
await mkdir(folder, { recursive: true });
const cases = [];
for (const kind of ["far", "crowd", "idle", "center"] as const) {
  const measured = measureMarch(kind);
  const balance = measured.frames.map(frame => {
    const left = frame.soldiers.filter(unit => unit.x < measured.width / 2).length;
    return { time: frame.time, left, right: frame.soldiers.length - left };
  });
  const end = balance.at(-1)!;
  const last = measured.frames.slice(-100);
  const settledTravel = last.slice(1).reduce((sum, frame, index) => sum
    + frame.soldiers.reduce((walked, unit, rank) => walked
      + Math.hypot(unit.x - last[index].soldiers[rank].x, unit.y - last[index].soldiers[rank].y), 0), 0);
  const summary = { kind, ...measured.summary, maxReversals: Math.max(...measured.rows.map(row => row.reversals)),
    endLeft: end.left, endRight: end.right, endImbalance: Math.abs(end.left - end.right),
    assignedLeft: measured.rows.filter(row => (row as { flank?: string }).flank === "left").length,
    assignedRight: measured.rows.filter(row => (row as { flank?: string }).flank === "right").length,
    settledTravel };
  cases.push(summary);
  await Bun.write(`${folder}/${label}-${kind}.json`, JSON.stringify({ ...measured, balance }));
  console.log(JSON.stringify(summary));
}
const firstRound = [];
for (const input of ["ready", "observed"] as const) {
  setFieldSize(370, 800);
  const meta = freshMeta(), save = ensureBphSave(meta);
  buyBphOffer(save, createBphShop(save, []), 0);
  const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: [] });
  hitBphPack(run, save.inventory[0].id);
  hitBphPack(run, save.inventory[0].id);
  const clicks = [3.6666666666666634, 11.866666666666635, 20.033333333333488,
    28.633333333333916, 37.23333333333378, 45.49999999999998, 53.9, 62.3, 70.7, 79.1];
  let next = 0;
  if (input === "observed") updateBphPointer(run, { x: 145, y: 470 });
  while (run.phase === "playing" && run.time < 90) {
    advance(run, 1 / 30);
    if (input === "ready") useSkill(run, 0);
    else if (run.time >= clicks[next]) { useSkill(run, 0); next++; }
  }
  firstRound.push({ input, time: run.time, phase: run.phase, base: run.base, lossCause: run.lossCause,
    floor: 50, floorPassed: run.time >= 50 });
}
await Bun.write(`${folder}/${label}-summary.json`, JSON.stringify({
  label, seed: 144, aggregation: "single seed, 16 soldiers, 60 seconds, 60 Hz",
  cases, firstRound,
}, null, 2));
console.log(JSON.stringify({ firstRound }));
