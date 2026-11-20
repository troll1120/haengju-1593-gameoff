import { expect, test } from "bun:test";
import { reserveHealthBar } from "./health-bars";
import type { HealthBar } from "./health-bars";

test("crowded health and attack bars keep every unit's own head anchor, including exact overlaps", () => {
  const occupied: HealthBar[] = [];
  expect(reserveHealthBar({ x: 100, y: 200, width: 40, height: 5 }, occupied))
    .toEqual({ x: 100, y: 200, width: 40, height: 5 });
  for (let i = 0; i < 48; i++) {
    const head = { x: 95 + i % 3 * 10, y: 200 - i % 4 };
    for (const [offset, width, height] of [[-6, 40, 5], [-5, 22, 4], [0, 40, 4], [0, 22, 4]] as const) {
      const wanted = { x: head.x - width / 2, y: head.y + offset, width, height };
      expect(reserveHealthBar(wanted, occupied)).toEqual(wanted);
      expect(occupied.at(-1)).toEqual(wanted);
    }
  }
  const same = { x: 100, y: 200, width: 40, height: 5 };
  expect(reserveHealthBar(same, occupied)).toEqual(same);
  expect(occupied.filter(box => box.x === 100 && box.y === 200)).toHaveLength(2);
});
