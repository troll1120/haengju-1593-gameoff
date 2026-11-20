import { expect, test } from "bun:test";
import { bphArtFile, bphUnitArt, BPH_CLASS_ART } from "./bph-art";
import { enemyArt } from "./enemy-animation";
import { createBphRun } from "./bph-session";
import { addBphProfile } from "./bph-combat";
import { freshMeta } from "./meta";
import { BPH_PROFILES } from "./bph-data";
import { allyAnimation, allyArt } from "./ally-animation";

test.each([
  ["militia", "uibyeong"], ["chongtong", "chongtong"], ["joseon_cavalry", "joseon_cavalry"],
] as const)("%s renders its approved identity without changing its combat body", (classId, texture) => {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] });
  const profile = Object.values(BPH_PROFILES).find(profile => profile.classId === classId);
  if (!profile) throw new Error(`Missing profile: ${classId}`);
  addBphProfile(run, { profileId: profile.id, copies: 1, foil: false, discovered: false },
    { packId: "DeliveryBox", cause: "pack" });
  const unit = run.squads[0].soldiers[0];
  const art = bphUnitArt(unit, unit.kind);
  // Ally cavalry always draws the shared Joseon cavalry sheet (owner DM 1794888398.514179).
  expect(art).toBe(profile.id === "Hero1_Barbarian" || classId === "joseon_cavalry" ? texture : `bph-${profile.id}`);
  expect(BPH_CLASS_ART[classId]).toBe(texture);
  const walk = allyAnimation(art, { moving: true, attacking: false, hurt: false, down: false, direction: "front" }).frames;
  expect(walk).toEqual(allyArt(art).full ? [0, 1, 2, 3].map(frame => ({ key: `ally-sheet-${art}`, frame }))
    : [{ key: art, frame: 0 }, { key: art, frame: 1 }]);
});

test("Joseon cavalry keeps its approved sheet and the enemy cavalry draws the Imjin Japanese rider", () => {
  const enemy = enemyArt({ kind: "cavalry", boss: false, elite: false });
  expect(BPH_CLASS_ART.joseon_cavalry).not.toBe(enemy.base);
  expect(bphArtFile(BPH_CLASS_ART.joseon_cavalry)).toBe("ming_cavalry");
  expect(bphArtFile(enemy.base)).toBe("cavalry");
});
