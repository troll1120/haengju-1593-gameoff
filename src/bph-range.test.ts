import { expect, test } from "bun:test";
import { addBphProfile, bphArms } from "./bph-combat";
import { bphCodexDetails } from "./bph-codex-details";
import { BPH_PROFILES } from "./bph-data";
import { chaosArena, chaosEnemy, chaosTicks } from "./chaos-test-fixture";
import { TILE } from "./geometry";

const cases = [
  { id: "Hero1_Squire", inside: 10, outside: 50 },
  { id: "Hero1_Archer", inside: 70, outside: 110 },
  { id: "Hero6_BloodMage", inside: 170, outside: 240 },
] as const;

test.each(cases)("$id cannot land its old oversized attack but can hit a nearby enemy", sample => {
  const dealt = (gap: number) => {
    // Kim avoids an archer follow-up. Use Gwon for the gunner to measure its base damage.
    const run = chaosArena(sample.id === "Hero6_BloodMage" ? "권율" : "김시민", 0);
    const target = chaosEnemy(run, 75 + gap, 100);
    addBphProfile(run, { profileId: sample.id, copies: 1, foil: false, discovered: false },
      { packId: "DeliveryBox", position: { x: 75, y: 100 } });
    const unit = run.squads[0].soldiers[0];
    Object.assign(unit, { emerging: false, clock: 1e9, strikeAt: run.time, aim: target.id, perch: 0 });
    // One attack release, then enough deterministic time for its projectile to arrive.
    chaosTicks(run, 1);
    unit.clock = 1e9;
    chaosTicks(run, 29);
    return target.maxHp - target.hp;
  };
  expect(dealt(sample.outside)).toBe(0);
  expect(dealt(sample.inside)).toBeCloseTo(BPH_PROFILES[sample.id].damage, 6);
});

test("ordinary melee weapons stay within a body tile and the codex shows the combat radius", () => {
  const run = chaosArena("권율", 0);
  for (const id of ["Hero1_Squire", "Hero1_Barbarian", "Hero_Bear"]) {
    addBphProfile(run, { profileId: id, copies: 1, foil: false, discovered: false }, { packId: "DeliveryBox" });
    const unit = run.squads[0].soldiers.at(-1);
    if (!unit) throw new Error(`No spawned ${id}`);
    const arms = bphArms(unit, run);
    if (!arms) throw new Error(`No arms for ${id}`);
    expect(arms.reach).toBeLessThanOrEqual(TILE);
    expect(bphCodexDetails(id).stats.find(stat => stat.label === "사거리")?.value).toBe(arms.reach);
    expect(bphCodexDetails(id).stats.find(stat => stat.label === "공격 반경")?.value).toBe(arms.span);
  }
});
