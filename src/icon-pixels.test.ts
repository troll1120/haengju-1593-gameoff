import { expect, test } from "bun:test";
import { ICON_PIXELS, ICON_TONES } from "./icon-pixels";
import { color, PALETTE } from "./presentation";

test("pixel pictures have rectangular cells and defined source-palette tones", () => {
  const palette = new Set(Object.values(PALETTE).map(color));
  for (const rows of Object.values(ICON_PIXELS)) {
    for (const row of rows) {
      expect(row.length).toBe(rows[0].length);
      for (const cell of row) if (cell !== ".") expect(palette.has(ICON_TONES[cell])).toBe(true);
    }
  }
});

test("the cash coin has an open square hole rather than a filled disc", () => {
  const rows = ICON_PIXELS.coin;
  const hole = rows.slice(4, 8).map(row => row.slice(4, 8));
  expect(hole).toEqual(["....", "....", "....", "...."]);
  expect(rows[3].slice(3, 9)).toBe("NNNNNN");
  expect(rows[8].slice(3, 9)).toBe("NNNNNN");
});

test("empty and earned stars retain the same recognizable silhouette", () => {
  const silhouette = (rows: readonly string[]) => rows.map(row => row.replace(/[^.]/g, "#"));
  expect(silhouette(ICON_PIXELS.star)).toEqual(silhouette(ICON_PIXELS["star-empty"]));
  expect(ICON_PIXELS.star).not.toEqual(ICON_PIXELS["star-empty"]);
});
