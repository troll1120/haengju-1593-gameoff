import { expect, test } from "bun:test";
import { attackFacing, cavalryAttackTarget, spriteFlipX } from "./attack-facing";
import { enemyMotion, sampleEnemyMotion } from "./enemy-animation";
import { ALLY_TEXTURES } from "./ally-animation";
import { bphArtFile, bphProfileArt } from "./bph-art";
import { ENEMY_TEXTURES } from "./enemy-animation";
import { FULL_BOSS_ART } from "./bosses";

for (const actor of [...ALLY_TEXTURES, ...ENEMY_TEXTURES, ...FULL_BOSS_ART, "panokseon", "atakebune"]) {
  test(`${actor} faces a target on either side throughout an attack`, () => {
    expect(attackFacing({ x: 30, y: 20 }, { x: 10, y: 20 })).toEqual({ flipX: true, direction: "side" });
    expect(attackFacing({ x: 10, y: 20 }, { x: 30, y: 20 })).toEqual({ flipX: false, direction: "side" });
    expect(attackFacing({ x: 30, y: 20 }, { x: 31, y: 40 }).direction).toBe("front");
    expect(attackFacing({ x: 30, y: 20 }, { x: 29, y: 0 }).direction).toBe("back");
  });
}

test("allied cavalry face the attack target while standing and after crossing it", () => {
  const target = { id: 8, x: 30, y: 20 }, quarry = { id: 9, x: 70, y: 20 };
  const cavalryArt = ["Hero6_Skelewheel", "Hero5_Rider", "Hero5_DinoRider"].map(bphProfileArt);
  expect(cavalryArt.map(bphArtFile)).toEqual(["ming_cavalry", "ming_cavalry", "ming_cavalry"]);
  for (const art of [...cavalryArt, "ming_cavalry", "shin_rip", "li_rusong"]) {
    for (const x of [20, 40, 41]) {
      const from = { x, y: 20 };
      const aim = cavalryAttackTarget([quarry, target], target.id, quarry);
      const flip = spriteFlipX(art, attackFacing(from, aim).flipX);
      expect(flip ? -1 : 1).toBe(Math.sign(target.x - from.x));
    }
    const from = { x: 32, y: 20 };
    const retreat = cavalryAttackTarget([quarry], target.id, target);
    expect(spriteFlipX(art, attackFacing(from, retreat).flipX)).toBe(true);
  }
});

for (const [actor, authoredLeft] of [["shin_rip", false], ["gwon_yul", false], ["ming_cavalry", false],
  ["joseon_cavalry", false], ["cavalry", true], ["yari", false], ["ukita", false]] as const) {
  for (const dx of [-2, 2]) test(`${actor} walking ${dx < 0 ? "left" : "right"} follows travel with its authored side`, () => {
    const motion = enemyMotion({ x: 20, y: 20 }, 0);
    sampleEnemyMotion(motion, { x: 20 + dx, y: 20 }, 1 / 30);
    const flipped = spriteFlipX(actor, motion.faceLeft);
    expect(authoredLeft ? !flipped : flipped).toBe(dx < 0);
  });
  for (const x of [10, 30]) test(`${actor} attacks the target regardless of its previous walking direction`, () => {
    const facing = attackFacing({ x: 20, y: 20 }, { x, y: 20 });
    const flipped = spriteFlipX(actor, facing.flipX);
    expect(authoredLeft ? !flipped : flipped).toBe(x < 20);
  });
}
