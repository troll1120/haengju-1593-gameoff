import { expect, test } from "bun:test";
import { BOSS_IDS, BOSSES } from "./bosses";
import { ENEMY_KINDS } from "./rules";
import type { Enemy } from "./rules";
import { enemyAnimation, enemyArt, enemyMotion, sampleEnemyMotion } from "./enemy-animation";
import { allyAttackFrame } from "./ally-animation";
import { MOTION } from "./motion";
import { fullsetArt } from "./fullset-art";

type Appearance = Pick<Enemy, "kind" | "boss" | "elite" | "bossArt" | "pattern">;
const enemies: { name: string; appearance: Appearance }[] = [
  ...ENEMY_KINDS.map(kind => ({ name: kind, appearance: { kind, boss: false, elite: false } })),
  ...BOSS_IDS.map(bossArt => ({ name: bossArt, appearance: { kind: "ukita" as const, boss: true, elite: false, bossArt } })),
  { name: "elite", appearance: { kind: "yari", boss: false, elite: true } },
  ...[...new Set(Object.values(BOSSES).map(boss => boss.pattern))]
    .map(pattern => ({ name: `legacy-${pattern}`, appearance: { kind: "yari" as const, boss: true, elite: false, pattern } })),
];
const moving = { moving: true, attacking: false, hurt: false, direction: "side", flashing: false } as const;
for (const { name, appearance } of enemies) {
  test(`${name} moving state plays a looping animation with multiple original frames`, async () => {
    const art = enemyArt(appearance), animation = enemyAnimation(art, moving);
    expect(animation.key.endsWith("-walk")).toBe(true);
    expect(new Set(animation.frames.map(frame => `${frame.key}:${frame.frame ?? 0}`)).size).toBeGreaterThan(1);
    expect(animation.repeat).toBe(-1);
    for (const frame of animation.frames) {
      const general = frame.key.startsWith("boss-sheet-");
      const file = general ? `${fullsetArt(frame.key.slice(11)).file}.webp`
        : `${art.ship ? "ships" : "units"}/${frame.key}.png`;
      const pixels = await Bun.file(`${import.meta.dir}/../public/art/${file}`).bytes();
      const png = new DataView(pixels.buffer, pixels.byteOffset, pixels.byteLength);
      if (!general) expect(png.getUint32(16)).toBeGreaterThanOrEqual((art.ship ? 56 : 32) * ((frame.frame ?? 0) % (art.ship ? 14 : 2) + 1));
    }
  });
  test(`${name} attacking state takes precedence over walking`, () => {
    const animation = enemyAnimation(enemyArt(appearance), { ...moving, attacking: true });
    expect(animation.key.endsWith("-attack")).toBe(true);
    expect(animation.frames.length).toBeGreaterThan(1);
    expect(animation.repeat).toBe(0);
  });
  test(`${name} has hit-flash and non-looping death sequences`, () => {
    const art = enemyArt(appearance);
    const hit = enemyAnimation(art, { ...moving, hurt: true, flashing: true });
    expect(hit.frames.every(frame => frame.key.includes("-white"))).toBe(true);
    const noFlash = enemyAnimation(art, { ...moving, hurt: true, flashing: false });
    expect(noFlash.frames.every(frame => !frame.key.includes("-white"))).toBe(true);
    const death = enemyAnimation(art, { ...moving, dead: true });
    expect(hit.key.endsWith("-hit")).toBe(true); expect(hit.frames.length).toBeGreaterThan(1);
    expect(death.key.endsWith("-death")).toBe(true); expect(death.frames.length).toBeGreaterThan(1);
    expect(death.repeat).toBe(0);
  });
}
test("render frames between simulation ticks retain the moving animation and facing", () => {
  const art = enemyArt({ kind: "yari", boss: false, elite: false });
  const at = { x: 20, y: 20 }, motion = enemyMotion(at, 0);
  const next = { x: 20, y: 21 };
  sampleEnemyMotion(motion, next, 1 / 30);
  expect(motion.direction).toBe("front");
  for (let render = 0; render < 5; render++) {
    sampleEnemyMotion(motion, next, 1 / 30);
    expect(enemyAnimation(art, { ...moving, moving: motion.moving, direction: motion.direction }).key).toBe("enemy-yari-front-walk");
    expect(motion.direction).toBe("front");
  }
  sampleEnemyMotion(motion, next, 2 / 30);
  expect(enemyAnimation(art, { ...moving, moving: motion.moving }).key).toBe("enemy-yari-side-idle");
});
test("walking direction follows horizontal travel and holds through near-still samples", () => {
  const motion = enemyMotion({ x: 20, y: 20 }, 0);
  sampleEnemyMotion(motion, { x: 18, y: 20 }, 1);
  expect(motion.faceLeft).toBe(true);
  sampleEnemyMotion(motion, { x: 18.005, y: 20 }, 2);
  expect(motion.faceLeft).toBe(true);
  sampleEnemyMotion(motion, { x: 22, y: 20 }, 3);
  expect(motion.faceLeft).toBe(false);
  sampleEnemyMotion(motion, { x: 21.995, y: 22 }, 4);
  expect(motion.faceLeft).toBe(false);
  expect(motion.direction).toBe("front");
});
test("cavalry uses its own horse frames rather than the samurai body", () => {
  const animation = enemyAnimation(enemyArt({ kind: "cavalry", boss: false, elite: false }), moving);
  expect(animation.frames.map(frame => frame.key)).toEqual(["cavalry", "cavalry"]);
});
test("a ladder carrier uses the baked yari body for walk, hit and death", () => {
  const art = enemyArt({ kind: "cavalry", boss: false, elite: false, ladder: true });
  expect(art).toEqual({ base: "ladder", full: false });
  expect(enemyAnimation(art, moving).frames.map(frame => frame.key)).toEqual(["ladder", "ladder"]);
  expect(enemyAnimation(art, { ...moving, hurt: true, flashing: true }).frames.map(frame => frame.key)).toEqual(["ladder-white", "ladder-white"]);
  expect(enemyAnimation(art, { ...moving, dead: true }).repeat).toBe(0);
});
test("white hit flashes and full-boss facings keep multiframe walk sequences", () => {
  const cavalry = enemyArt({ kind: "cavalry", boss: false, elite: false });
  expect(enemyAnimation(cavalry, { ...moving, flashing: true }).frames.map(frame => frame.key)).toEqual(["cavalry-white", "cavalry-white"]);
  const boss = enemyArt({ kind: "ukita", boss: true, elite: false, bossArt: "konishi" });
  for (const direction of ["front", "back", "side"] as const) {
    const animation = enemyAnimation(boss, { ...moving, direction });
    expect(animation.frames).toHaveLength(4);
    expect(animation.frames.map(frame => frame.frame)).toEqual(
      [0, 1, 2, 3].map(frame => ["front", "back", "side"].indexOf(direction) * 18 + frame));
  }
});
test("a detailed boss holds its windup, contacts on release, recovers and returns to idle", () => {
  const art = enemyArt({ kind: "ukita", boss: true, elite: false, bossArt: "konishi" });
  const attack = enemyAnimation(art, { ...moving, attacking: true });
  expect(allyAttackFrame(attack, { windupProgress: 0, sinceReleaseMs: -1 }).frame).toBe(40);
  expect(allyAttackFrame(attack, { windupProgress: 1, sinceReleaseMs: -1 }).frame).toBe(41);
  expect(allyAttackFrame(attack, { windupProgress: 1, sinceReleaseMs: 0 }).frame).toBe(42);
  expect(allyAttackFrame(attack, { windupProgress: -1, sinceReleaseMs: MOTION.lungeMs - 1 }).frame).toBe(43);
  expect(enemyAnimation(art, { ...moving, moving: false }).frames[0].frame).toBe(50);
  expect(enemyAnimation(art, { ...moving, hurt: true }).frames.map(frame => frame.frame)).toEqual([44, 45, 46]);
});
test("teppo retains five attack frames without shifting adjacent poses or directional rows", () => {
  const art = enemyArt({ kind: "teppo", boss: false, elite: false });
  for (const [row, direction] of (["front", "back", "side"] as const).entries()) {
    const state = { ...moving, direction };
    expect(enemyAnimation(art, { ...state, attacking: true }).frames.map(frame => frame.frame))
      .toEqual([4, 5, 6, 7, 8].map(frame => row * 19 + frame));
    expect(enemyAnimation(art, { ...state, hurt: true }).frames.map(frame => frame.frame))
      .toEqual([9, 10, 11].map(frame => row * 19 + frame));
    expect(enemyAnimation(art, { ...state, moving: false }).frames.map(frame => frame.frame))
      .toEqual([15, 16, 17, 18].map(frame => row * 19 + frame));
  }
});
