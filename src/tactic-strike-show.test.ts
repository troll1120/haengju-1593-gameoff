import { describe, expect, test } from "bun:test";
import { JINGAK_SHOW, waveFront } from "./shows/jingak-show";
import { PALETTE } from "./presentation";
import type { ShowChannels } from "./skill-show";
import { SkillStage } from "./skill-stage";
import { TACTIC_STRIKE, tacticStrikes } from "./tactic-strike-show";

type Fill = { readonly layer: string; readonly paint: number; readonly alpha: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
const FLASH: ShowChannels = { motion: true, flash: true };
/** A stand-in stage that records the show's fills on the shared layers, in the shape of the dongnae show's own recorder. */
function recorder() {
  const fills: Fill[] = [];
  const layer = (name: string) => {
    let paint = 0, alpha = 1;
    const graphics = {
      fillStyle(next: number, nextAlpha = 1) { paint = next; alpha = nextAlpha; return graphics; },
      fillRect(x: number, y: number, width: number, height: number) { fills.push({ layer: name, paint, alpha, x, y, width, height }); return graphics; },
    };
    return graphics;
  };
  const stage: SkillStage = Object.create(SkillStage.prototype);
  Object.defineProperties(stage, { ground: { value: layer("ground") }, field: { value: layer("field") }, trails: { value: layer("trails") } });
  const draw = (now: number): readonly Fill[] => {
    fills.length = 0;
    const global = Math.random; Math.random = () => { throw new Error("the tactic strikes drew from Math.random"); };
    try { tacticStrikes.update(stage, { now, cssPixel: 1, run: {} as never, at: unit => unit, foe: () => undefined, channels: FLASH }); } finally { Math.random = global; }
    return [...fills];
  };
  return { stage, draw };
}

const sway = 60 * .2 + 2;
/** The drawn trail column covers the drop from the field's top onto the aim point: some slice starts at the top, some ends on the point. */
const coversDrop = (fills: readonly Fill[], at: { x: number; y: number }): boolean => {
  const column = fills.filter(fill => fill.layer === "trails" && fill.x <= at.x + sway && at.x <= fill.x + fill.width + sway);
  return column.length > 0 && Math.min(...column.map(fill => fill.y)) <= 4 && Math.max(...column.map(fill => fill.y + fill.height)) >= at.y - 4;
};

describe("tactic strikes", () => {
  test("a 뇌격 bolt is the shipped thunderstorm stroke dropped onto the aim point, gone within its afterglow", () => {
    tacticStrikes.clear();
    const { draw } = recorder(), at = { x: 300, y: 400 };
    tacticStrikes.bolt(at.x, at.y, 60);
    draw(0);
    const burning = draw(40);
    expect(burning.some(fill => fill.layer === "trails" && fill.paint === PALETTE.white)).toBe(true);
    expect(coversDrop(burning, at)).toBe(true);
    // The shipped bolt's forks reach sideways up to a share of the radius, so the whole trail stays inside the tactic ring.
    for (const fill of burning.filter(fill => fill.layer === "trails"))
      expect(Math.max(fill.x - at.x, at.x - (fill.x + fill.width))).toBeLessThanOrEqual(60);
    // The impact glow stays inside a share of the ring on the ground, and the whole bolt is gone once its afterglow ends.
    expect(burning.filter(fill => fill.layer === "ground" && Math.hypot(fill.x + 2 - at.x, fill.y + 2 - at.y) < 60 * TACTIC_STRIKE.foot + 4).length).toBeGreaterThan(0);
    expect(draw(TACTIC_STRIKE.boltMs + 1)).toEqual([]);
  });

  test("a 지진 shockwave is the shipped stomp wave out to the tactic's real radius, and nothing outlives its echo", () => {
    tacticStrikes.clear();
    const { draw } = recorder(), at = { x: 300, y: 400 }, radius = 133;
    tacticStrikes.quake(at.x, at.y, radius);
    draw(0);
    const racing = draw(100), front = waveFront(100, radius);
    // The bright edge band sits at the rules' own front distance and never past the real radius, over a darkened scorch.
    const band = racing.filter(fill => fill.layer === "ground" && (fill.paint === PALETTE.white || fill.paint === PALETTE.gold || fill.paint === PALETTE.cream));
    expect(band.length).toBeGreaterThan(0);
    for (const fill of band) {
      const far = Math.hypot(fill.x + 2 - at.x, fill.y + 2 - at.y);
      expect(far).toBeLessThanOrEqual(radius + 4);
    }
    expect(band.filter(fill => Math.abs(Math.hypot(fill.x + 2 - at.x, fill.y + 2 - at.y) - front) <= 12).length).toBeGreaterThan(0);
    expect(racing.some(fill => fill.layer === "ground" && fill.paint === PALETTE.dark)).toBe(true);
    expect(draw(JINGAK_SHOW.wave + TACTIC_STRIKE.quakeAfterMs + 1)).toEqual([]);
  });

  test("only the newest few bolts stay alive, so a held cursor cannot pile them up", () => {
    tacticStrikes.clear();
    const { draw } = recorder();
    for (let index = 0; index <= TACTIC_STRIKE.maxBolts; index++) tacticStrikes.bolt(100 + index * 40, 400, 60);
    const fills = draw(0);
    expect(coversDrop(fills, { x: 100, y: 400 })).toBe(false);
    expect(coversDrop(fills, { x: 100 + TACTIC_STRIKE.maxBolts * 40, y: 400 })).toBe(true);
    tacticStrikes.clear();
    expect(draw(10)).toEqual([]);
  });
});
