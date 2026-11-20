import { expect, test } from "bun:test";
import { castleLethalHit } from "./castle-damage";
import { moveEnemy } from "./enemy-wall";
import { CENTER } from "./geometry";
import { advance, createRun, spawn } from "./rules";
import type { Enemy } from "./rules";

function breachedCastle() {
  const run = createRun(1593);
  run.squads = [];
  run.enemies = [];
  run.base = .1;
  run.walls.위 = 0;
  return run;
}

test.each([
  ["melee", { kind: "yari" }, { cause: "yari", boss_kind: "regular", attackKind: "wall" }],
  ["musket", { kind: "teppo" }, { cause: "teppo", boss_kind: "regular", attackKind: "projectile" }],
  ["ladder raider", { kind: "samurai", ladder: true }, { cause: "samurai", boss_kind: "regular", attackKind: "ladder" }],
  ["miniboss", { kind: "cavalry", miniboss: "cavalry" }, { cause: "cavalry", boss_kind: "midboss", attackKind: "wall" }],
] satisfies readonly (readonly [string, Partial<Enemy>, NonNullable<ReturnType<typeof castleLethalHit>>])[])(
  "attributes a lethal keep hit to the actual %s",
  (_label, traits, attribution) => {
    const run = breachedCastle();
    const attacker = spawn(run, false, false, undefined, false, "위");
    Object.assign(attacker, traits);
    moveEnemy(run, attacker, CENTER);

    advance(run, .05);

    expect([run.phase, castleLethalHit(run)]).toEqual(["lost", attribution]);
  },
);

test("a delayed fire cast keeps its boss attribution after the owner leaves and another attacker hits", () => {
  const run = breachedCastle();
  const boss = spawn(run, false, true, undefined, true, "위");
  boss.bossArt = "ukita";
  boss.enraged = true;
  boss.skillClock = 0;
  advance(run, .05);
  const cast = run.telegraphs.find(mark => mark.owner === boss.id && mark.skill === "fire");
  if (!cast) throw new Error("The boss did not cast fire");
  run.enemies = [];
  run.time = cast.at;
  // Fire lands after raid in advance; place the follow-up after it in the telegraph sequence.
  run.telegraphs.push({ ...cast, owner: -1, skill: "ram", wallDamage: 999, radius: 999 });

  advance(run, .05);

  expect([run.phase, castleLethalHit(run)]).toEqual(["lost", { cause: "ukita", boss_kind: "boss", attackKind: "fire" }]);
  expect(castleLethalHit(structuredClone(run))).toBeUndefined();
});

test("shielded castle blows cannot claim the later lethal hit", () => {
  const run = breachedCastle();
  const blocked = spawn(run, false, true, undefined, false, "위");
  Object.assign(blocked, { x: CENTER.x });
  moveEnemy(run, blocked, CENTER);
  run.shieldUntil = .1;
  advance(run, .05);
  expect(run.base).toBe(.1);
  const gunner = spawn(run, false, false, undefined, false, "위");
  Object.assign(gunner, { x: CENTER.x, kind: "teppo" });
  moveEnemy(run, gunner, CENTER);

  advance(run, .05);

  expect(castleLethalHit(run)).toEqual({ cause: "teppo", boss_kind: "regular", attackKind: "projectile" });
});
