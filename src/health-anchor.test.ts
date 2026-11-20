import { expect, test } from "bun:test";
import { healthAnchor, showEnemyHealth } from "./sprite-layout";

for (const [name, width, height] of [["boss", 56, 64], ["general", 32, 32]] as const) {
  for (const scale of [.5, 1, 2, 3]) test(`${name} health follows rendered bounds at scale ${scale}`, () => {
    const bounds = { x: 217 - width * scale / 2, y: 301 - height * scale / 2, width: width * scale };
    const anchor = healthAnchor(bounds);
    expect(anchor.x).toBe(217);
    expect(anchor.y + 8).toBe(bounds.y);
  });
}
test("ordinary enemies show health only while alive and damaged", () => {
  const enemy = { hp: 4, maxHp: 4, boss: false, elite: false };
  expect(showEnemyHealth(enemy)).toBe(false);
  expect(showEnemyHealth({ ...enemy, hp: 3 })).toBe(true);
  expect(showEnemyHealth({ ...enemy, hp: 0 })).toBe(false);
  expect(showEnemyHealth({ ...enemy, boss: true })).toBe(true);
  expect(showEnemyHealth({ ...enemy, elite: true })).toBe(true);
});
