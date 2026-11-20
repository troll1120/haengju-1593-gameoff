import { expect, test } from "bun:test";
import { chaosArena, chaosEnemy, chaosTicks } from "./chaos-test-fixture";
import { actualManualHealRatio, generalHp, useSkill } from "./rules";
import { CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";

test.each([1, 10, 20].flatMap(level => [0, 1, 2].map(awakened => [level, awakened] as const)))(
  "Samyeong N%i awakening %i exposes actual offensive rings and no heal percentage",
  (level, awakened) => {
    const run = chaosArena("사명대사", level), squad = run.squads[0];
    squad.awakened = awakened;
    squad.maxHp = generalHp("사명대사", level) * BPH_SURVIVAL_TABLE.generalHpScale; squad.hp = 1;
    // Inside the caster's smallest ring, below him on open ground.
    const enemy = chaosEnemy(run, squad.x, squad.y + 60);
    const effects = useSkill(run, 0);
    expect(effects.find(effect => effect.kind === "skill")?.actualHealRatio).toBeUndefined();
    expect(actualManualHealRatio(run, squad)).toBe(0);
    expect(squad.hp).toBe(1);
    const ring = run.chaosSkills?.events[0];
    if (!ring) throw new Error("Missing actual bell ring");
    expect(ring.kind).toBe("bell");
    expect(ring.stun).toBe(.3);
    chaosTicks(run, 24);
    expect(10000 - enemy.hp).toBeCloseTo(ring.power);
  },
);

test("Samyeong never fills nearly full HP and exposes the real growing shockwave radius", () => {
  const run = chaosArena("사명대사", 20), squad = run.squads[0];
  squad.awakened = 2;
  squad.maxHp = generalHp("사명대사", 20) * BPH_SURVIVAL_TABLE.generalHpScale;
  squad.hp = squad.maxHp * .95;
  const hp = squad.hp;
  useSkill(run, 0);
  const ring = run.chaosSkills?.events[0];
  if (!ring) throw new Error("Missing bell ring");
  chaosTicks(run, 12);
  expect(ring.currentRadius).toBeCloseTo(ring.radius / 2);
  expect(squad.hp).toBe(hp);
});

test.each([0, 1, 2])("Samyeong fresh Lv1 awakening %i baseline is one damaging toll with no healing", awakened => {
  const run = chaosArena("사명대사", 0), squad = run.squads[0];
  squad.awakened = awakened;
  squad.maxHp = generalHp("사명대사", 1) * BPH_SURVIVAL_TABLE.generalHpScale; squad.hp = 1;
  const enemy = chaosEnemy(run, squad.x, squad.y + 60);
  const effects = useSkill(run, 0);
  expect(effects.filter(effect => effect.kind === "skill")).toHaveLength(1);
  expect(run.chaosSkills?.events).toHaveLength(1);
  expect(actualManualHealRatio(run, squad)).toBe(0);
  chaosTicks(run, 24);
  expect(run.chaos?.level).toBe(1);
  expect(10000 - enemy.hp).toBeCloseTo(CHAOS_RULES.skills.bell.power[chaosSkillBand(1)]
    * (1 + awakened * .25) * BPH_SURVIVAL_TABLE.generalSkill);
  expect(squad.hp).toBe(1);
});
