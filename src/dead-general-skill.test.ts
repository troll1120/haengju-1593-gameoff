import { expect, test } from "bun:test";
import { BPH_GENERALS } from "./bph-commanders";
import { tickChaosSkills } from "./chaos-skill-tick";
import { advance, choose, chooseGeneral, createRun, useSkill } from "./rules";
import type { Run } from "./rules";

for (const general of BPH_GENERALS) {
  test(`${general}: death freezes charge and rejects casts; revival restores both`, () => {
    const run = createRun(42, general), squad = run.squads[0];
    squad.hp = 0; squad.state = "down"; squad.downUntil = 100;
    squad.skillClock = 5;
    for (let frame = 0; frame < 20; frame++) advance(run, .05);
    expect(squad.skillClock).toBe(5);
    squad.skillClock = 0;
    const casts = [...run.metrics.skills], nextId = run.nextId;
    expect(useSkill(run, 0)).toEqual([]);
    expect(run.metrics.skills).toEqual(casts);
    expect(run.nextId).toBe(nextId);
    expect(run.chaosSkills?.events ?? []).toEqual([]);

    squad.skillClock = 5; squad.downUntil = run.time;
    advance(run, .05);
    expect(String(squad.state)).toBe("guard");
    expect(squad.hp).toBeGreaterThan(0);
    expect(squad.skillClock).toBe(5);
    advance(run, .05);
    expect(squad.skillClock).toBeCloseTo(4.95);
    squad.skillClock = 0;
    expect(useSkill(run, 0).length).toBeGreaterThan(0);
    expect(run.metrics.skills[0]).toBe(casts[0] + 1);
  });
}

test("a living charging general still recharges his skill", () => {
  const run = createRun(42, "신립"), squad = run.squads[0];
  squad.skillClock = 0;
  useSkill(run, 0);
  expect(squad.state).toBe("charge");
  const clock = squad.skillClock;
  advance(run, .05);
  expect(squad.skillClock).toBeCloseTo(clock - .05);
});

test("a cast already in flight finishes on its own deadlines after the caster dies", () => {
  const run = createRun(42, "송상현"), squad = run.squads[0];
  squad.skillClock = 0;
  useSkill(run, 0);
  const events = run.chaosSkills!.events, ids = events.map(event => event.id);
  expect(events.length).toBeGreaterThan(0);
  squad.hp = 0; squad.state = "down"; squad.downUntil = 100;
  expect(useSkill(run, 0)).toEqual([]);
  tickChaosSkills(run, .1, []);
  expect(run.chaosSkills!.events.map(event => event.id)).toEqual(ids);
  for (let frame = 0; frame < 300; frame++) tickChaosSkills(run, .1, []);
  expect(run.chaosSkills!.events).toEqual([]);
  expect(run.metrics.skills[0]).toBe(1);
});

for (const reward of ["awaken-card", "awaken-prize", "promote-card", "level"] as const) {
  for (const down of [false, true]) {
    test(`${reward}: ${down ? "fallen" : "living"} general keeps the correct charge through growth`, () => {
      const run = createRun(42), squad = run.squads[0];
      squad.skillClock = 5;
      if (down) { squad.hp = 0; squad.state = "down"; squad.downUntil = 100; }
      if (reward === "awaken-card" || reward === "promote-card") {
        const card = reward === "awaken-card" ? "awaken-권율" : "promote-권율";
        run.phase = "choice"; run.offers = [card];
        choose(run, card);
        expect(squad.tier).toBe(2);
        expect(squad.awakened).toBe(reward === "awaken-card" ? 1 : 0);
      } else if (reward === "awaken-prize") {
        run.level = 6;
        run.roulette = { remaining: .01, options: ["awaken"], soldier: "monk", evolution: null };
        advance(run, .05);
        expect(squad.tier).toBe(2);
        expect(squad.awakened).toBe(1);
        expect(run.metrics.bonuses.awaken).toBe(1);
      } else {
        run.xp = run.nextXp;
        advance(run, .05);
        expect(run.level).toBe(2);
      }
      const grantsCharge = reward === "awaken-card" || reward === "awaken-prize";
      const elapsed = reward === "awaken-prize" || reward === "level" ? .05 : 0;
      const expected = down ? 5 : grantsCharge ? 0 : 5 - elapsed;
      expect(squad.skillClock).toBeCloseTo(expected);
      if (down) {
        expect(squad.hp).toBe(0);
        expect(squad.state).toBe("down");
        expect(useSkill(run, 0)).toEqual([]);
        squad.downUntil = run.time;
        advance(run, .05);
        expect(String(squad.state)).toBe("guard");
        expect(squad.skillClock).toBe(5);
        expect(useSkill(run, 0)).toEqual([]);
        advance(run, .05);
        expect(squad.skillClock).toBeCloseTo(4.95);
      }
    });
  }
}

test("a new general joins ready without refilling the fallen general", () => {
  const run: Run = createRun(42), fallen = run.squads[0];
  fallen.hp = 0; fallen.state = "down"; fallen.downUntil = 100; fallen.skillClock = 5;
  run.phase = "general"; run.generalOffers = ["김시민"];
  chooseGeneral(run, "김시민");
  expect(fallen.skillClock).toBe(5);
  expect(run.squads[1].skillClock).toBe(0);
});
