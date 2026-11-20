import { afterEach, beforeEach, expect, test } from "bun:test";
import { chaosArena, chaosEnemy, chaosBasic, chaosSpecial, chaosTicks } from "./chaos-test-fixture";
import { ARMS, advance, bphEffectCombat, keepsTarget, TARGET_LOCK } from "./rules";
import { allyAnimation, allyAttackFrame } from "./ally-animation";
import { generalUnit } from "./roster";
import { HEIGHT, setFieldSize, WIDTH } from "./geometry";
import { historicalBasicReplay } from "./general-basic-replay.fixture";

let previousSize: [number, number];
beforeEach(() => {
  previousSize = [WIDTH, HEIGHT];
  setFieldSize(390, 650);
});
afterEach(() => setFieldSize(...previousSize));

for (const [general, actor] of [["이순신", "yi_sunsin"], ["곽재우", "kwak_jaeu"]] as const)
  for (const direction of ["front", "back", "side"] as const) test(`${general} ${direction} bow shot raises, draws, releases on the shot and recovers`, () => {
    const animation = allyAnimation(generalUnit(general), { moving: false, attacking: true, bow: true, hurt: false, down: false, direction });
    expect(animation.key).toBe(`ally-full-${actor}-${direction}-bow_attack`);
    const index = (windupProgress: number, sinceReleaseMs: number) =>
      animation.frames.indexOf(allyAttackFrame(animation, { windupProgress, sinceReleaseMs }));
    expect([index(0, -1), index(.6, -1), index(1, 0), index(-1, 120)]).toEqual([0, 1, 2, 3]);
  });
test("Yi Sun-sin's melee swing keeps the sword attack frames", () => {
  expect(allyAnimation(generalUnit("이순신"), { moving: false, attacking: true, bow: false, hurt: false, down: false, direction: "side" }).key)
    .toBe("ally-full-yi_sunsin-side-attack");
});

for (const [general, gap, attack] of [
  ["이순신", 100, "arrow"], ["이순신", 46, "melee"], ["이순신", 47, "arrow"],
  ["곽재우", 100, "arrow"], ["곽재우", 20, "arrow"],
] as const) test(`${general} body uses ${attack} at distance ${gap}`, () => {
  const run = chaosArena(general, 0), squad = run.squads[0];
  const target = chaosEnemy(run, squad.x + gap, squad.y);
  const effects = chaosBasic(run, target);
  if (attack === "arrow") {
    expect(run.shots.map(shot => [shot.kind, shot.source, shot.unitIndex, shot.target]))
      .toEqual([["arrow", "general", -1, target.id]]);
    expect(effects.some(effect => effect.kind === "shot" && effect.index === -1)).toBe(true);
    const power = run.shots[0].damage;
    chaosTicks(run, 20);
    // A basic arrow never also emits the special lance.
    expect(10000 - target.hp).toBeCloseTo(power);
  } else {
    expect(run.shots).toHaveLength(0);
    expect(effects.some(effect => effect.kind === "swing" && effect.index === -1)).toBe(true);
    expect(target.hp).toBeLessThan(10000);
  }
});

test("김시민 fires no personal rocket and cuts a near enemy with the default blade", () => {
  // Owner DM 1794926634.203539: his identity is the wall battery, his own basic attack is ARMS.general.
  const run = chaosArena("김시민", 0), squad = run.squads[0];
  const target = chaosEnemy(run, squad.x + ARMS.general.reach - 6, squad.y);
  const effects = chaosBasic(run, target);
  expect(run.shots.filter(shot => shot.source === "general")).toHaveLength(0);
  expect(effects.some(effect => effect.kind === "swing" && effect.index === -1)).toBe(true);
  expect(target.hp).toBeLessThan(10000);
});

test("권율's special rockets fly at three different enemies and strike each one once, with no splash on the others", () => {
  // Owner DM 1794962815: one rocket to each of several enemies.
  const run = chaosArena("권율", 0), squad = run.squads[0];
  const enemies = [0, 10, -10].map(dy => chaosEnemy(run, squad.x + 100, squad.y + dy));
  chaosSpecial(run, enemies[0]);
  const rockets = run.shots.filter(shot => shot.kind === "rocket" && shot.source === "general");
  expect(rockets).toHaveLength(ARMS.hwacha.cleave);
  expect(new Set(rockets.map(shot => shot.target))).toEqual(new Set(enemies.map(enemy => enemy.id)));
  const power = rockets[0].damage;
  // Opening army strength adds auxiliary arrows. Isolate the rockets' own impact.
  run.shots = rockets;
  const landed = chaosTicks(run, 30).filter(effect => effect.kind === "total");
  // One landing on each enemy, each striking only that one; a splash would have hit all three, ten pixels apart, three times.
  expect(landed.map(effect => effect.count)).toEqual([1, 1, 1]);
  expect(new Set(landed.map(effect => enemies.findIndex(enemy => Math.hypot(enemy.x - effect.x, enemy.y - effect.y) < 1)))).toEqual(new Set([0, 1, 2]));
  for (const enemy of enemies.slice(1)) expect(enemy.maxHp - enemy.hp).toBeCloseTo(power);
});

test("a lone enemy still takes all of 권율's special rockets", () => {
  const run = chaosArena("권율", 0), squad = run.squads[0];
  const target = chaosEnemy(run, squad.x + 100, squad.y);
  chaosSpecial(run, target);
  const rockets = run.shots.filter(shot => shot.kind === "rocket" && shot.source === "general");
  expect(rockets.map(shot => shot.target)).toEqual(Array(ARMS.hwacha.cleave).fill(target.id));
  const landed = chaosTicks(run, 30).filter(effect => effect.kind === "total");
  expect(landed.map(effect => [effect.count, Math.round(effect.x), Math.round(effect.y)]))
    .toEqual(Array(ARMS.hwacha.cleave).fill([1, Math.round(target.x), Math.round(target.y)]));
});

test("both bow bodies acquire an enemy within archer range through a real windup", () => {
  for (const general of ["이순신", "곽재우"] as const) {
    const run = chaosArena(general, 0), squad = run.squads[0];
    chaosEnemy(run, squad.x + ARMS.archer.reach - 1, squad.y);
    squad.clock = 0;
    const effects = chaosTicks(run, 10);
    expect(effects.filter(effect => effect.kind === "windup" && effect.index === -1)).toHaveLength(1);
    expect(effects.filter(effect => effect.kind === "shot" && effect.index === -1)).toHaveLength(1);
  }
});

function basicReplayArena(general: Parameters<typeof historicalBasicReplay>[0]) {
  const run = chaosArena(general, 0);
  if (!run.bph?.survival) throw new Error("Expected survival replay");
  // At 84–88s the native escort cursor has never advanced (first commander at 180s).
  delete run.bph.fx.counters.commanderEscortCursor;
  run.bph.survival.nextDeparture = 120;
  chaosEnemy(run, 225, 100); chaosEnemy(run, 300, 100);
  run.squads[0].clock = 0;
  return run;
}

// Determinism is separate from historical fidelity: keep checking all 120 ticks even if the archive diverges.
test.each(["권율", "신립", "송상현", "황진", "김시민", "사명대사"] as const)("%s replays every basic attack tick deterministically", general => {
  const a = basicReplayArena(general), b = basicReplayArena(general);
  for (let tick = 0; tick < 120; tick++) {
    const left = advance(a, 1 / 30), right = advance(b, 1 / 30);
    expect(JSON.stringify([a, left]), `tick ${tick}`).toBe(JSON.stringify([b, right]));
  }
});

// Exact 120-tick regression digests for the independent basic/special contract.
// The former 0f412af digests already failed on round-9; the new body cadence, flag strike and explicit special timer
// intentionally change those bytes. Full Run, RNG, effects and every tick remain covered.
// Owner-approved additions: enemies[*].defenseSide (e35c6de/5186eb2, ally split v2)
// and effects[*].projectile (7eca628, tablet hit identity). Removing exactly those paths
// reproduces all 120 frames of immutable 6c4e6bd; retain its hashes and pin the full bytes too.
// Juice c73f4c5 adds only hit.squad. The pre-juice be8811c bytes are pinned separately;
// all720 compared ticks retain identical Run/RNG and effects after that exact positional removal.
// These three digests lock the historical 06bf9f5 frames. The live replay checks the
// survival v3 numbers explicitly and requires exact bytes for the rest of every frame.
for (const [general, digest, fullDigest, juiceDigest] of [
  ["권율", "15d19411c4c5511b9bd24684e9c3023c2e05feb14a0496aee5be4e3f0de14e03", "5facefe438d7e4e916aac3f1b5fbdf9fb2f1b932b4e75f57cd8c1472bff32944", "d2586a8622c749a8503fa011f3bfa531c7507607e374d31fd1dc3bfa8c1cf081"],
  ["신립", "c84b74c94e8ead5ddfb5693691a17ab160973d776f56c945039940644beeeb8a", "1b33a637204273869565fa7426f053039e7ad194a97d6b56e034daccb3e65c7c", "f697b2a18112d1a70f2445e5e8c44ea2fe77e667f68a4ffbe46bab70f6e038bf"],
  ["송상현", "f830d12f6fae5f032c59d0c6422e7b9aa589fc1a6db18ad7c6d4f36f7ad58162", "6c0a66d517ca5a94158fc128f8af7d011730fff2d899b4fe921ffd57c819ad91", "ee9776de5346c2de1084ce20c4b2e8af2bd785645987a8c587bad33d073ec03c"],
  ["황진", "c6a045fbfd890baf4ea2b7a25f4901a032b2ff3512aa6f42d04e6343706df627", "bd7bc42ea49bb73a333f3e37d2140899ac6e1b1d4e4fd394693266bd8d7b8bb3", "3c8f95c705dd8920ff3208dde639c343ce49d4c51d6ae6aa7b7a66dc040335f4"],
  ["김시민", "628beceaa33351e033c0eb981f4a1e3daf6ddc663ddb04cc049aa1be13615a9c", "3ca93b253d173a8db9566e683c95591ad4ba39810c7d2cc867c32a3ad49a7b51", "419d27751e8077b180ea7c9f8a9976e7bc8427bf71c8a71d955fb21a933b0243"],
  ["사명대사", "b89e2b907835fc99c910ae83dfd338a49632e96b7f3e1b6c30b39451bc4d1a85", "d79d11fa9e83df5cab3cbe73eb43ada177dfb3cb66c81e595e0dc7bde3aad658", "97cf2c34902b94bf434f88d44ccd4bbe43a40677eadb1050a6c29d22fa16680e"],
] as const) test(`${general} basic-only replay stays byte-identical to the independent attack contract`, () => {
  const run = basicReplayArena(general);
  const history = historicalBasicReplay(general);
  const beforeJuice: string[] = [], projected: string[] = [], projectileTicks: number[] = [];
  for (const frame of history.frames) {
    const [copy, copiedEffects] = JSON.parse(frame) as [typeof run, ReturnType<typeof advance>];
    for (const effect of copiedEffects) if (effect.kind === "hit") delete effect.squad;
    beforeJuice.push(JSON.stringify([copy, copiedEffects]));
    for (const enemy of copy.enemies) delete enemy.defenseSide;
    for (const effect of copiedEffects) delete effect.projectile;
    projected.push(JSON.stringify([copy, copiedEffects]));
  }
  expect(new Bun.CryptoHasher("sha256").update(projected.join("\n")).digest("hex")).toBe(digest);
  expect(new Bun.CryptoHasher("sha256").update(beforeJuice.join("\n")).digest("hex")).toBe(fullDigest);
  expect(new Bun.CryptoHasher("sha256").update(history.frames.join("\n")).digest("hex")).toBe(juiceDigest);
  for (let tick = 0; tick < 120; tick++) {
    const effects = advance(run, 1 / 30);
    expect(run.enemies.map(enemy => enemy.defenseSide)).toEqual(["right", "right"]);
    for (const effect of effects) {
      if (effect.kind === "hit") expect(effect.squad).toBe(run.squads[0].id);
      if ("projectile" in effect) {
        expect(general).toBe("송상현");
        expect(effect.kind).toBe("hit");
        expect(effect.projectile).toEqual({ kind: "arrow", source: "general", by: 0 });
        projectileTicks.push(tick);
      } else if (general === "송상현") expect(effect.kind).not.toBe("hit");
    }
    history.assertFrame(tick, run, effects);
  }
  expect(projectileTicks).toEqual(general === "송상현" ? [6, 26, 46, 66, 86, 106] : []);
});

test("after a fight with no enemy left on his side the general holds his spot, then engages the next enemy that comes near", () => {
  // Owner DM 1794892449.075779: he no longer walks back to his post when nothing is around.
  const run = chaosArena("권율", 0), squad = run.squads[0];
  run.commandClock = 0; squad.clock = 0;
  const first = chaosEnemy(run, 225, 100);
  first.hp = first.maxHp = 1;
  for (let tick = 0; tick < 120 && first.hp > 0; tick++) advance(run, 1 / 30);
  expect(first.hp).toBeLessThanOrEqual(0);
  const held = { x: squad.x, y: squad.y };
  chaosTicks(run, 60);
  expect(Math.hypot(squad.x - held.x, squad.y - held.y)).toBeLessThan(.5);
  const next = chaosEnemy(run, squad.x + 60, squad.y);
  chaosTicks(run, 30);
  expect(Math.hypot(next.x - squad.x, next.y - squad.y)).toBeLessThan(60 - 20);
  expect(squad.aim).toBe(next.id);
});

test("a survival general turns to a clearly nearer enemy instead of holding the one he struck first", () => {
  // Owner DM 1794894507.597969: always the nearest.
  const run = chaosArena("권율", 0), squad = run.squads[0];
  squad.clock = 0;
  const first = chaosEnemy(run, squad.x + 30, squad.y);
  chaosTicks(run, 15);
  expect(squad.aim).toBe(first.id);
  const near = chaosEnemy(run, squad.x - 8, squad.y + 4);
  chaosTicks(run, 10); // the faster flag picks the nearer target on its next preparation, before repeated pushes change the distances
  expect(squad.aim).toBe(near.id);
});

test("the target lock keeps a near-equal target, drops it for one clearly closer, and holds a fresh pick briefly", () => {
  // Owner DMs 1794894265.835729 / 1794894507.597969: no flip-flopping between near-equal targets, but always the nearest.
  expect(keepsTarget(40, 36, 0, 10)).toBe(true);
  expect(keepsTarget(40, 30, 0, 10)).toBe(false);
  expect(keepsTarget(100, 93, 0, 10)).toBe(true);
  expect(keepsTarget(100, 91, 0, 10)).toBe(false);
  expect(keepsTarget(40, 10, 10 + TARGET_LOCK.hold / 2, 10)).toBe(true);
  expect(keepsTarget(40, 10, 10, 10)).toBe(false);
});

test("a survival boss takes the general's blow and skill pushes without moving, while a plain enemy is still knocked back", () => {
  const run = chaosArena("이순신", 0), squad = run.squads[0];
  const plain = chaosEnemy(run, squad.x + 30, squad.y), boss = chaosEnemy(run, squad.x - 30, squad.y);
  boss.boss = true;
  const start = (enemy: typeof boss) => ({ x: enemy.x, y: enemy.y });
  const plainAt = start(plain), bossAt = start(boss);
  chaosBasic(run, plain); chaosBasic(run, boss);
  expect(plain.hp).toBeLessThan(plain.maxHp); expect(boss.hp).toBeLessThan(boss.maxHp);
  bphEffectCombat(run, []).knock(boss, squad, 40); bphEffectCombat(run, []).knock(plain, squad, 40);
  expect(start(boss)).toEqual(bossAt);
  expect(Math.hypot(plain.x - plainAt.x, plain.y - plainAt.y)).toBeGreaterThan(20);
});

// Owner: "장군들끼리 안겹치면 좋겠는데" - the four blade/staff generals' basic attacks cover different enemies around the same crowd.
const STRIKE_CROWD = [[26, 0], [40, 14], [40, -14], [62, 0], [0, 40], [0, -40], [-40, 0]] as const;
for (const [general, struck, cuts] of [
  // 김시민's Lv1 fan opens 60 degrees either side (GENERAL_REACH), so the two flankers square beside him wait for later levels.
  ["황진", [0], 2], ["신립", [0, 3], 1], ["김시민", [0, 1, 2], 1], ["사명대사", [0, 1, 2, 4, 5, 6], 1],
] as const) test(`${general}'s special attack strikes his own pattern of the crowd`, () => {
  const run = chaosArena(general, 0), squad = run.squads[0], start = { x: squad.x, y: squad.y };
  const crowd = STRIKE_CROWD.map(([dx, dy]) => chaosEnemy(run, squad.x + dx, squad.y + dy));
  const first = chaosSpecial(run, crowd[0]), firstCut = crowd[0].maxHp - crowd[0].hp, moved = squad.x - start.x;
  const effects = [...first, ...chaosTicks(run, 8)];
  expect(crowd.flatMap((enemy, index) => enemy.hp < enemy.maxHp ? [index] : [])).toEqual([...struck]);
  expect(effects.filter(effect => effect.kind === "swing" && effect.index === -1)).toHaveLength(cuts);
  // 황진's second cut matches the first.
  if (cuts === 2) expect(crowd[0].maxHp - crowd[0].hp).toBeCloseTo(2 * firstCut);
  // 신립 ends his dash past the enemy he struck (26 px ahead); the others strike where they stand.
  if (general === "신립") expect(moved).toBeGreaterThan(26);
  else expect(Math.abs(moved)).toBeLessThan(1);
});

// Owner DM 1794966115 ("업그레이드 할때마다 쌔지고 범위가 넓어지게"): one attack reaches more of the same crowd at Lv20 than at Lv1.
const REACH_CROWD = [...Array.from({ length: 11 }, (_, step) => [26 + step * 24, 0]),
  [20, 35], [20, -35], [-20, 35], [-20, -35], [-40, 0], [53, 53], [53, -53], [100, 46], [100, -46]] as const;
for (const general of ["황진", "신립", "김시민", "사명대사", "이순신", "권율", "곽재우", "송상현"] as const)
  test(`${general}'s one attack strikes more of the crowd at Lv20 than at Lv1`, () => {
    const struck = (level: number) => {
      const run = chaosArena(general, level), squad = run.squads[0];
      const crowd = REACH_CROWD.map(([dx, dy]) => chaosEnemy(run, squad.x + dx, squad.y + dy));
      chaosSpecial(run, crowd[0]); chaosTicks(run, 45);
      return crowd.filter(enemy => enemy.hp < enemy.maxHp).length;
    };
    expect(struck(20)).toBeGreaterThan(struck(1));
  });
