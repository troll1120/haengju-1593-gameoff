import assert from "node:assert/strict";
import { readdir, realpath, writeFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { SurvivalAccount } from "./survival-sim";
import type { BphEffectConsumer } from "../src/bph-contract";
import type { Effect, Enemy, Run } from "../src/rules";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Same validation and alias rebinding as the approved campaign-resume helper. */
function restoreAccountAliases(value: unknown): asserts value is SurvivalAccount {
  assert.ok(record(value) && record(value.meta) && record(value.save));
  assert.ok(integer(value.meta.runs) && integer(value.save.chapter) && integer(value.save.rng));
  assert.ok(record(value.save.resources));
  assert.ok(Object.values(value.save.resources).every(n => typeof n === "number" && Number.isFinite(n)));
  for (const key of ["discovered", "foils", "purchasedPlacements"])
    assert.ok(Array.isArray(value.save[key]) && value.save[key].every((id: unknown) => typeof id === "string"));
  assert.deepEqual(value.meta.bph, value.save, "Serialized Meta/BphSave must agree before rebinding");
  value.meta.bph = value.save;
}

const { values } = parseArgs({ options: {
  "source-root": { type: "string" }, "checkpoint-path": { type: "string" },
  "output-path": { type: "string" }, "source-id": { type: "string" },
  cap: { type: "string", default: "600" }, seed: { type: "string", default: "2747" },
}, strict: true });
assert.ok(values["source-root"] && values["checkpoint-path"] && values["output-path"],
  "Required: --source-root ROOT --checkpoint-path FILE --output-path FILE [--cap 600] [--seed 2747] [--source-id ID]");
const sourceRoot = await realpath(resolve(values["source-root"]));
const inputPath = await realpath(resolve(values["checkpoint-path"]));
const outputPath = resolve(values["output-path"]);
const cap = Number(values.cap), seed = Number(values.seed);
assert.ok(Number.isFinite(cap) && cap > 0, "--cap must be positive finite seconds");
assert.ok(integer(seed) && seed <= 0xffffffff, "--seed must be uint32");
assert.notEqual(outputPath, inputPath, "Output must not replace the checkpoint");
assert.ok(values["source-id"] === undefined || values["source-id"].trim().length > 0, "--source-id must be nonempty");
const sourceFiles = (await readdir(join(sourceRoot, "src"), { recursive: true }))
  .filter(name => /\.(?:[cm]?[jt]sx?|json)$/.test(name)).sort();
assert.ok(sourceFiles.length > 0, "Selected source root has no source files");
const sourceHashes: Record<string, string> = {};
for (const name of sourceFiles) {
  const path = join(sourceRoot, "src", name);
  sourceHashes[relative(sourceRoot, path)] = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(path).arrayBuffer()).digest("hex");
}
const sourceSHA256 = new Bun.CryptoHasher("sha256").update(JSON.stringify(sourceHashes)).digest("hex");
const sourceIdentifier = values["source-id"] ?? `sha256:${sourceSHA256}`;
const moduleURL = (name: string) => pathToFileURL(join(sourceRoot, "src", `${name}.ts`)).href;
// These annotations bind selected runtime modules to current interfaces; no local runtime imports.
const upgrades: typeof import("../src/bph-upgrades") = await import(moduleURL("bph-upgrades"));
const accountAPI: typeof import("../src/bph-account") = await import(moduleURL("bph-account"));
const session: typeof import("../src/bph-session") = await import(moduleURL("bph-session"));
const fx: typeof import("../src/bph-fx-dispatch") = await import(moduleURL("bph-fx-dispatch"));
const rules: typeof import("../src/rules") = await import(moduleURL("rules"));
const supply: typeof import("../src/bph-supply") = await import(moduleURL("bph-supply"));
const recruit: typeof import("../src/bph-recruit") = await import(moduleURL("bph-recruit"));
const combat: typeof import("../src/bph-combat") = await import(moduleURL("bph-combat"));
const data: typeof import("../src/bph-data") = await import(moduleURL("bph-data"));
const geometry: typeof import("../src/geometry") = await import(moduleURL("geometry"));
const shopSession: typeof import("../src/bph-shop-session") = await import(moduleURL("bph-shop-session"));

const bytes = await Bun.file(inputPath).arrayBuffer();
const checkpoint: unknown = JSON.parse(new TextDecoder().decode(bytes));
assert.ok(record(checkpoint) && Array.isArray(checkpoint.accounts));
const matches: unknown[] = checkpoint.accounts.filter((entry: unknown) => record(entry) && entry.profile === 0);
assert.equal(matches.length, 1, "Checkpoint must contain exactly one completed profile 0");
const completed = matches[0];
assert.ok(record(completed) && completed.completedRuns === 20 && completed.upgrades === 40);
const account = structuredClone(completed.account);
restoreAccountAliases(account);
assert.equal(account.meta.runs, 20);
assert.equal(account.save.chapter, 3);
const initialAccount = structuredClone(account);
await upgrades.prepareBphUpgrades();
geometry.setFieldSize(370, 800);
const activeEffects = upgrades.activeBphEffects(account.save);
accountAPI.projectBphSalary(account.save, activeEffects);
const run = session.createBphRun(account.meta, { seed, general: "권율", upgrades: activeEffects, startBattle: false });
const battle = run.bph, context = fx.bphFxContext(run);
assert.ok(battle && context);
assert.strictEqual(battle.save, account.save, "Runtime must retain the selected account");
assert.strictEqual(account.meta.bph, account.save, "Meta and save must remain aliased");
const start = { base: run.base, walls: { ...run.walls }, gold: run.gold,
  generalHp: run.squads[0]?.hp, placements: account.save.purchasedPlacements.length,
  mastery: account.save.resources.mastery, foilium: account.save.resources.foilium };
type SpawnRecord = {
  readonly time: number; readonly id: number; readonly profile: Enemy["bphProfileId"];
  readonly kind: Enemy["kind"]; readonly boss: boolean; readonly hp: number; readonly speed: number;
  readonly x: number; readonly y: number; readonly stats: typeof data.BPH_MONSTERS[string] | null;
};
type FortState = Pick<Run, "base" | "walls">;
type WallEffect = Effect & { readonly source: SpawnRecord | Enemy | null };
// Mutable observation accumulators never change dispatched events.
const spawns: SpawnRecord[] = [], entities = new Map<number, SpawnRecord>();
const hits: { readonly time: number; readonly before: FortState; readonly after: FortState;
  readonly wallEffects: readonly WallEffect[] }[] = [];
const unitHits: { readonly time: number; readonly targetId: number; readonly targetKind: string;
  readonly attacker: number | undefined; readonly dealt: number; readonly attempted: number }[] = [];
const purchases: { readonly time: number; readonly pack: string; readonly price: number }[] = [];
let firstWallBreak: { readonly side: typeof geometry.SIDES[number]; readonly time: number;
  readonly sides: readonly typeof geometry.SIDES[number][] } | null = null;
let hqFirstDamage: { readonly time: number; readonly before: number; readonly after: number } | null = null;
let finalFallTime: number | null = null;
const observer: BphEffectConsumer = {
  id: "troops", kinds: [], consume() {},
  onEvent(_ctx, event) {
    switch (event.kind) {
      case "enemy-spawn": {
        const enemy = event.enemy;
        const info: SpawnRecord = { time: run.time, id: enemy.id, profile: enemy.bphProfileId,
          kind: enemy.kind, boss: enemy.boss, hp: enemy.hp, speed: enemy.speed, x: enemy.x, y: enemy.y,
          stats: enemy.bphProfileId ? data.BPH_MONSTERS[enemy.bphProfileId] : null };
        entities.set(enemy.id, info); spawns.push(info);
        break;
      }
      case "damage-dealt":
        if (event.side === "ally") unitHits.push({ time: run.time, targetId: event.target.id,
          targetKind: event.target.kind, attacker: event.source?.id, dealt: event.dealt, attempted: event.attempted });
        break;
      default: break; // Other production events are deliberately not part of this trace.
    }
  },
};
fx.bindBphConsumers(context, [...fx.bphConsumers(), observer], false);
fx.dispatchBphEffects(run, { kind: "run-start" });
shopSession.prepareBphFieldShop(run);
const maxSteps = Math.ceil(cap / .05);
let steps = 0;
// Preserve the approved harness order: skill, shop, packs, pointer/cursor, advance, observe.
while (run.phase !== "won" && run.phase !== "lost" && steps < maxSteps) {
  if (run.generalOffers.length && (run.phase === "general" || run.phase === "playing")) { rules.chooseGeneral(run, run.generalOffers[0]); continue; }
  if (steps % 10 === 0) {
    for (const squad of run.squads) rules.useSkill(run, squad.id);
    const shop = supply.restockBphRecruit(run), index = shop.offers.findIndex(offer => !offer.sold);
    if (index >= 0) {
      const before = run.gold, pack = recruit.buyBphRecruit(run, shop, index);
      if (pack) {
        purchases.push({ time: run.time, pack: pack.packId, price: before - run.gold });
        battle.packs.push({ ...pack, hp: 2, x: geometry.CENTER.x, y: geometry.CENTER.y + 70 });
      }
    }
    for (const pack of [...battle.packs]) {
      combat.hitBphPack(run, pack.id, "reveal"); combat.hitBphPack(run, pack.id, "reveal");
    }
  }
  const target = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship").sort((a, b) =>
    Number(Boolean(b.breach)) - Number(Boolean(a.breach)) || Number(b.boss) - Number(a.boss) ||
    Math.hypot(a.x - geometry.CENTER.x, a.y - geometry.CENTER.y)
      - Math.hypot(b.x - geometry.CENTER.x, b.y - geometry.CENTER.y) || a.id - b.id)[0];
  if (target) {
    fx.updateBphPointer(run, target);
    if (steps % 10 === 0) rules.hitBphEnemy(run, target.id);
  }
  const before = { base: run.base, walls: { ...run.walls } };
  const effects = rules.advance(run, .05);
  const broken = geometry.SIDES.filter(side => before.walls[side] > 0 && run.walls[side] <= 0);
  const firstSide = broken[0];
  if (firstWallBreak === null && firstSide !== undefined)
    firstWallBreak = { side: firstSide, sides: broken, time: run.time };
  if (hqFirstDamage === null && run.base < before.base)
    hqFirstDamage = { time: run.time, before: before.base, after: run.base };
  if (finalFallTime === null && before.base > 0 && run.base <= 0) finalFallTime = run.time;
  if (before.base !== run.base || geometry.SIDES.some(side => before.walls[side] !== run.walls[side]))
    hits.push({ time: run.time, before, after: { base: run.base, walls: { ...run.walls } },
      wallEffects: effects.filter(effect => effect.kind === "wall").map(effect => ({ ...effect,
        source: effect.target === undefined ? null
          : entities.get(effect.target) ?? run.enemies.find(enemy => enemy.id === effect.target) ?? null })) });
  battle.fxEvents.length = 0;
  steps++;
}
const terminal = run.phase === "lost" || run.phase === "won";
const output = {
  sourceRoot, sourceIdentifier, sourceSHA256, sourceHashes, runtimeBun: Bun.version,
  inputPath, inputSHA256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
  accountIdentity: { profile: 0, completedRuns: 20, upgrades: 40, initialAccount },
  diagnostic: "New C4 trial from profile0 final20-run account. Not a replay of historical attempt20; pack RNG/counters are the final saved values.",
  policy: "active2Hz; approved .05/.5-second decision order; run-start then prepareBphFieldShop before restock; no settlement",
  seed, cap, steps, status: terminal ? run.phase : "unresolved", capped: !terminal,
  stopReason: terminal ? "terminal" : steps >= maxSteps ? "cap" : "non-playing",
  start, end: { time: run.time, phase: run.phase, base: run.base, walls: run.walls,
    lossCause: run.lossCause, firstBreach: run.metrics.firstBreach, generalDowns: run.metrics.downs, kills: run.kills },
  firstWallBreak, hqFirstDamage, finalFallTime, spawns, hits, unitHits, purchases,
};
// Exclusive creation also prevents symlink/hardlink aliases from replacing the checkpoint.
await writeFile(outputPath, JSON.stringify(output, null, 2) + "\n", { flag: "wx" });
console.log("C4_PRESSURE_TRACE_EXIT=0", JSON.stringify({ outputPath, status: output.status, end: output.end }));
