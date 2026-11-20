import { expect, test } from "bun:test";
import { onBphNativeBeastmaster } from "./bph-native-summons-beastmaster";
import { nativeFixture, originalNativeEffects } from "./bph-native-passives-test-context";

test.each([1, 2])("Beastmaster friends receive exactly %i replacement lives with parent provenance", count => {
  const nodes = ["SN_Beastmaster_FriendRespawn", "SN_Beastmaster_FriendRespawn2"].slice(0, count);
  const f = nativeFixture(onBphNativeBeastmaster, originalNativeEffects(...nodes));
  const master = f.spawn("Hero5_Beastmaster", { resultId: 20 });
  const friend = f.run.squads[0].soldiers.find(unit => unit.bph?.parentId === master.id);
  if (!friend) throw new Error("Native Beastmaster must create its authored friends");
  const identity = friend.id;
  for (let n = 1; n <= count; n++) {
    f.death(friend); f.step(0.01);
    expect(friend.hp).toBe(friend.maxHp);
    expect(friend.bph?.lifeId).toBe(n + 1);
    expect(friend.bph?.parentId).toBe(master.id);
    expect(friend.bph?.resultId).toBe(20);
    expect(friend.id).toBe(identity);
  }
  f.death(friend); f.step(0.01);
  expect(friend.hp).toBe(0);
  expect(f.draws()).toBe(0);
  expect(f.run.squads[0].soldiers).toHaveLength(5);
});

test("Beastmaster replacement never attaches to an unrelated animal or a new parent life", () => {
  const f = nativeFixture(onBphNativeBeastmaster, originalNativeEffects("SN_Beastmaster_FriendRespawn"));
  const unrelated = f.spawn("Hero_Rat");
  const master = f.spawn("Hero5_Beastmaster");
  const friend = f.run.squads[0].soldiers.find(unit => unit.bph?.parentId === master.id);
  if (!friend || !master.bph) throw new Error("Missing production friend lineage");
  master.bph.lifeId++;
  f.death(friend); f.death(unrelated); f.step(0.1);
  expect(friend.hp).toBe(0);
  expect(unrelated.hp).toBe(0);
});

test("Unupgraded Beastmaster friends create no native lifecycle state", () => {
  const f = nativeFixture(onBphNativeBeastmaster);
  const counters = { ...f.ctx.state.counters };
  f.spawn("Hero5_Beastmaster");
  f.step(2);
  expect(f.ctx.state.counters).toEqual(counters);
});

test("A multi-copy Beastmaster spawn assigns four friends to each actual parent", () => {
  const f = nativeFixture(onBphNativeBeastmaster, originalNativeEffects("SN_Beastmaster_FriendRespawn"));
  f.ctx.spawnProfile("Hero5_Beastmaster", 2, { packId: "Pack6_Forest", resultId: 70, cause: "pack" });
  const owners = f.run.squads[0].soldiers.filter(unit => unit.bph?.profileId === "Hero5_Beastmaster");
  expect(owners).toHaveLength(2);
  for (const owner of owners) {
    const children = f.run.squads[0].soldiers.filter(unit => unit.bph?.parentId === owner.id);
    expect(children).toHaveLength(4);
    f.death(children[0]); f.step(0.01);
    expect(children[0].bph?.lifeId).toBe(2);
    expect(children[0].hp).toBe(children[0].maxHp);
  }
  expect(f.run.squads[0].soldiers).toHaveLength(10);
});
