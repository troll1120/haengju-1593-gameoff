import { expect, test } from "bun:test";
import { ALLY_TEXTURES, allyAnimation, allyArt } from "./ally-animation";
import { enemyMotion, sampleEnemyMotion } from "./enemy-animation";

test("idle and holding allies face the approach after arriving from any direction", () => {
  for (const end of [{ x: 0, y: -20 }, { x: 0, y: 20 }, { x: 20, y: 0 }]) {
    const motion = enemyMotion({ x: 0, y: 0 }, 0);
    sampleEnemyMotion(motion, end, 1);
    const arrivedFrom = motion.direction;
    sampleEnemyMotion(motion, end, 2);
    expect(motion.moving).toBe(false);
    expect(motion.direction).toBe(arrivedFrom);
    for (const base of ALLY_TEXTURES) {
      const art = allyArt(base);
      const idle = allyAnimation(base, { ...motion, attacking: false, hurt: false, down: false });
      expect(idle.key).toBe(art.full ? `ally-full-${art.actor}-front-idle` : `ally-${base}-idle`);
    }
  }
});

test("walking, attacking, hurt and fallen allies retain their selected direction", () => {
  for (const base of ALLY_TEXTURES) {
    const art = allyArt(base);
    for (const direction of ["front", "back", "side"] as const) {
      for (const pose of ["walk", "attack", "hit", "death"] as const) {
        const animation = allyAnimation(base, { direction, moving: pose === "walk",
          attacking: pose === "attack", hurt: pose === "hit", down: pose === "death" });
        const selected = art.actor === "song_sanghyeon" && pose === "attack" ? "throw_attack" : pose;
        expect(animation.key).toBe(art.full ? `ally-full-${art.actor}-${direction}-${selected}` : `ally-${base}-${pose}`);
      }
    }
  }
});
