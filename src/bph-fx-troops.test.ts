import { expect, test } from "bun:test";
import type { BphEffect } from "./bph-contract";
import { addBphProfile, bphStats } from "./bph-combat";
import { bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { beastmasterFriendSelection, TROOP_CONSUMERS } from "./bph-fx-troops";
import { freshBphSave, parseBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { activeBphEffects } from "./bph-upgrades";
import { freshMeta } from "./meta";
import type { Run } from "./rules";

const BEAR = "SN_BeastmasterAddBear";
const JAGUAR = "SN_BeastmasterAddJaguar";
const MONKEY = "SN_BeastmasterAddMonkey";
const PLACEMENTS: Readonly<Record<string, string>> = {
  [BEAR]: "_SkillTreeNature:13:12",
  [JAGUAR]: "_SkillTreeNature:12:11",
  [MONKEY]: "_SkillTreeNature:13:11",
};

function battle(ids: readonly string[], extra: readonly BphEffect[] = []) {
  const meta = freshMeta(), save = freshBphSave();
  save.purchasedNodes = [...ids];
  save.purchasedPlacements = ids.map(id => PLACEMENTS[id]);
  meta.bph = parseBphSave(JSON.parse(JSON.stringify(save)));
  const run = createBphRun(meta, { seed: 1593, general: "권율",
    upgrades: [...activeBphEffects(meta.bph), ...extra], startBattle: false });
  return { run, save: meta.bph };
}

function spawn(run: Run, copies = 1, profileId = "Hero5_Beastmaster") {
  addBphProfile(run, { profileId, foil: false, copies, discovered: false },
    { packId: "Pack1_Basic", resultId: 17, cause: "pack", position: { x: 120, y: 160 } });
  return run.squads[0].soldiers;
}

// Independent oracle: original BuildSpawnRoster replaces one Rat per purchased
// friend, fills the remaining slots with Rat, and performs no random draw.
const ROSTERS = [
  { ids: [], friends: ["Hero_Rat", "Hero_Rat", "Hero_Rat", "Hero_Rat"] },
  { ids: [BEAR], friends: ["Hero_Bear", "Hero_Rat", "Hero_Rat", "Hero_Rat"] },
  { ids: [JAGUAR], friends: ["Hero_Jaguar", "Hero_Rat", "Hero_Rat", "Hero_Rat"] },
  { ids: [MONKEY], friends: ["Hero_Monkey", "Hero_Rat", "Hero_Rat", "Hero_Rat"] },
  { ids: [BEAR, JAGUAR], friends: ["Hero_Bear", "Hero_Jaguar", "Hero_Rat", "Hero_Rat"] },
  { ids: [BEAR, MONKEY], friends: ["Hero_Bear", "Hero_Monkey", "Hero_Rat", "Hero_Rat"] },
  { ids: [JAGUAR, MONKEY], friends: ["Hero_Jaguar", "Hero_Monkey", "Hero_Rat", "Hero_Rat"] },
  { ids: [BEAR, JAGUAR, MONKEY], friends: ["Hero_Bear", "Hero_Jaguar", "Hero_Monkey", "Hero_Rat"] },
] as const;

for (const row of ROSTERS) {
  test(`real spawn keeps four original friends after save reload: ${row.ids.join(",") || "unowned"}`, () => {
    const { run, save } = battle(row.ids);
    const rng = [run.rng, save.rng];

    const soldiers = spawn(run);

    const owner = soldiers.find(unit => unit.bph?.profileId === "Hero5_Beastmaster");
    expect(owner).toBeDefined();
    const friends = soldiers.filter(unit => unit.bph?.cause === "summon");
    expect(soldiers).toHaveLength(5);
    expect(friends.map(unit => unit.bph?.profileId)).toEqual([...row.friends]);
    expect(friends.map(unit => unit.bph?.parentId)).toEqual(Array(4).fill(owner?.id));
    expect(friends.map(unit => unit.bph?.lifeId)).toEqual([1, 1, 1, 1]);
    expect(friends.map(unit => unit.bph?.resultId)).toEqual([17, 17, 17, 17]);
    expect(friends.every(unit => unit.bph?.packId === "Pack1_Basic")).toBe(true);
    expect([run.rng, save.rng]).toEqual(rng);
    expect(save.pendingResults).toEqual([]);
  });
}

for (const row of [
  { id: BEAR, profile: "Hero_Bear", hp: 6, damage: 1.5, cooldown: 1.5, range: 0.3499999940395355, moveSpeed: 1, area: 1 },
  { id: JAGUAR, profile: "Hero_Jaguar", hp: 4.5, damage: 1.7999999523162842, cooldown: 0.800000011920929, range: 0.5, moveSpeed: 1.5, area: 0 },
  { id: MONKEY, profile: "Hero_Monkey", hp: 4.5, damage: 1.2000000476837158, cooldown: 1.100000023841858, range: 1, moveSpeed: 1, area: 0 },
]) {
  test(`${row.id} creates the original combat profile and stats`, () => {
    const { run } = battle([row.id]);

    const animal = spawn(run).find(unit => unit.bph?.profileId === row.profile);

    expect(animal).toBeDefined();
    if (!animal) throw new Error("Expected original animal combat unit");
    expect(animal.hp).toBe(row.hp);
    expect(animal.maxHp).toBe(row.hp);
    expect(bphStats(animal, run)).toMatchObject({
      hp: row.hp, damage: row.damage, cooldown: row.cooldown,
      range: row.range, moveSpeed: row.moveSpeed, area: row.area,
    });
  });

  test(`${row.id} cannot summon friends for another hero`, () => {
    const baseline = battle([]).run, enabled = battle([row.id]).run;

    const before = spawn(baseline, 1, "Hero1_Archer");
    const after = spawn(enabled, 1, "Hero1_Archer");

    expect(after).toEqual(before);
    expect(enabled.rng).toBe(baseline.rng);
    expect(enabled.bph?.fx.counters).toEqual(baseline.bph?.fx.counters);
  });

  test(`${row.id} with a mismatched target leaves W0 Rat spawns unchanged`, () => {
    const original = BPH_UPGRADE_NODES[row.id].effects[0];
    const invalid = { ...original, targets: { ...original.targets, targetHero: "Hero1_Archer" } };
    const baseline = battle([]).run, enabled = battle([], [invalid]).run;

    const before = spawn(baseline), after = spawn(enabled);

    expect(after).toEqual(before);
    expect(enabled.rng).toBe(baseline.rng);
    expect(enabled.bph?.fx).toEqual(baseline.bph?.fx);
  });
}

test("each active Beastmaster copy owns exactly four friends", () => {
  const { run } = battle([BEAR, JAGUAR, MONKEY]);

  const soldiers = spawn(run, 2);

  const owners = soldiers.filter(unit => unit.bph?.profileId === "Hero5_Beastmaster");
  expect(soldiers).toHaveLength(10);
  expect(owners).toHaveLength(2);
  for (const owner of owners) {
    const friends = soldiers.filter(unit => unit.bph?.parentId === owner.id);
    expect(friends.map(unit => unit.bph?.profileId)).toEqual(["Hero_Bear", "Hero_Jaguar", "Hero_Monkey", "Hero_Rat"]);
    expect(friends.every(unit => unit.bph?.cause === "summon" && unit.bph.lifeId === 1)).toBe(true);
  }
});

test("replayed spawn hooks and duplicate unlock entries cannot duplicate friends", () => {
  const { run } = battle([BEAR, JAGUAR, MONKEY], BPH_UPGRADE_NODES[BEAR].effects);
  const owner = spawn(run).find(unit => unit.bph?.profileId === "Hero5_Beastmaster");
  if (!owner) throw new Error("Expected Beastmaster owner");
  const soldiers = structuredClone(run.squads[0].soldiers);
  const account = JSON.stringify(run.bph?.save);
  const rng = run.rng, nextId = run.nextId;
  const native = bphFxContext(run);
  if (!native) throw new Error("Expected bound production context");

  dispatchBphEffects(run, { kind: "unit-spawn", unit: owner, profileId: "Hero5_Beastmaster",
    life: { unitId: owner.id, lifeId: 1, profileId: "Hero5_Beastmaster", parentId: null, cause: "pack" } });

  // W0 profiles recomputes its existing "alone" diagnostic on every spawn
  // event. Replay must preserve actual units, account/rewards and combat RNG.
  expect(run.squads[0].soldiers).toEqual(soldiers);
  expect(JSON.stringify(run.bph?.save)).toBe(account);
  expect(run.rng).toBe(rng);
  expect(run.nextId).toBe(nextId);
  expect(beastmasterFriendSelection(native, owner)).toEqual(["Hero_Bear", "Hero_Jaguar", "Hero_Monkey", "Hero_Rat"]);
});

for (const row of [
  { name: "dead owners", dead: true, eventLife: 2 },
  { name: "stale life hooks", dead: false, eventLife: 1 },
]) {
  test(`${row.name} cannot create new friends`, () => {
    const { run } = battle([BEAR]);
    const owner = spawn(run).find(unit => unit.bph?.profileId === "Hero5_Beastmaster");
    if (!owner || !owner.bph) throw new Error("Expected Beastmaster owner");
    owner.bph.lifeId = 2;
    if (row.dead) owner.hp = 0;
    const native = bphFxContext(run);
    if (!native) throw new Error("Expected bound production context");
    const snapshot = JSON.stringify(run);

    // Other W0 consumers record birth timestamps even for replayed events.
    // The R1 consumer's stale/dead guard must itself be an exact state no-op.
    for (const consumer of TROOP_CONSUMERS) consumer.consume(native, {
      kind: "unit-spawn", unit: owner, profileId: "Hero5_Beastmaster",
      life: { unitId: owner.id, lifeId: row.eventLife, profileId: "Hero5_Beastmaster", parentId: null, cause: "pack" },
    }, BPH_UPGRADE_NODES[BEAR].effects[0]);

    expect(JSON.stringify(run)).toBe(snapshot);
  });
}

test("unowned selection is a state and RNG no-op", () => {
  const { run } = battle([]);
  const owner = spawn(run)[0], native = bphFxContext(run);
  if (!owner || !native) throw new Error("Expected production owner and context");
  const snapshot = JSON.stringify(run);

  const selection = beastmasterFriendSelection(native, owner);

  expect(selection).toEqual([]);
  expect(JSON.stringify(run)).toBe(snapshot);
});

test("normalized second save reload preserves R1 ownership, wallet and RNG byte for byte", () => {
  const legacy = freshBphSave();
  legacy.purchasedNodes = [BEAR, JAGUAR, MONKEY];
  legacy.purchasedPlacements = [PLACEMENTS[BEAR], PLACEMENTS[JAGUAR], PLACEMENTS[MONKEY]];
  legacy.resources.mastery = 37;
  legacy.coins = 2;
  const normalized = parseBphSave(JSON.parse(JSON.stringify(legacy)));
  const firstBytes = JSON.stringify(normalized);

  const reloaded = parseBphSave(JSON.parse(firstBytes));

  expect(JSON.stringify(reloaded)).toBe(firstBytes);
  expect(reloaded.resources.mastery).toBe(37);
  expect(reloaded.coins).toBe(2);
  expect(reloaded.rng).toBe(legacy.rng);
  expect(activeBphEffects(reloaded).map(effect => effect.nodeId)).toEqual([BEAR, JAGUAR, MONKEY]);
});
