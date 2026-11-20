import { expect, test } from "bun:test";
import type Phaser from "phaser";
import { chaosArena, chaosEnemy } from "./chaos-test-fixture";
import { BPH_GENERALS } from "./bph-commanders";
import type { PaintedArt } from "./painted-art";
import { bodyDepth, LAYER } from "./presentation";
import { advance, useSkill } from "./rules";
import { SkillStage } from "./skill-stage";
import { SKILL_SHOWS } from "./shows";

function canvasStage() {
  const pictures: { depth: number; fills: number; visible: boolean; alpha: number }[] = [];
  const make = () => {
    const picture = { depth: 0, fills: 0, visible: true, alpha: 1 };
    pictures.push(picture);
    const chain = {
      height: 20, frame: { width: 32, height: 32 }, anims: { stop() {} },
      setDepth(depth: number) { picture.depth = depth; return chain; },
      setVisible(visible: boolean) { picture.visible = visible; return chain; },
      setAlpha(alpha: number) { picture.alpha = alpha; return chain; },
      fillRect() { picture.fills++; return chain; },
      clear() { picture.fills = 0; return chain; },
      setPosition() { return chain; }, setSize() { return chain; }, setTexture() { return chain; },
      setCrop() { return chain; }, setOrigin() { return chain; }, setScale() { return chain; }, setFrame() { return chain; },
      setRotation() { return chain; }, setAngle() { return chain; }, setFlip() { return chain; }, setFlipX() { return chain; },
      clearTint() { return chain; }, setBlendMode() { return chain; }, setFillStyle() { return chain; },
      fillStyle() { return chain; }, play() { return chain; }, once() { return chain; },
    };
    return chain;
  };
  const scene = { textures: { exists: () => true }, add: { rectangle: make, graphics: make, image: make, sprite: make } } as unknown as Phaser.Scene;
  const art = { draw: (graphic: ReturnType<typeof make>) => graphic.fillRect() } as unknown as PaintedArt;
  const stage = new SkillStage(scene, art, SKILL_SHOWS);
  return { stage, veil: pictures[0], marks: pictures[2], field: pictures[3], trails: pictures[4],
    visibleSprite: () => pictures.slice(5).some(picture => picture.visible && picture.alpha > 0 && picture.depth >= LAYER.impact) };
}

for (const general of BPH_GENERALS) test(`${general}'s Lv1 survival cast paints above troops and below danger markers`, () => {
  const run = chaosArena(general, 1), squad = run.squads[0];
  chaosEnemy(run, 172, 145).boss = true;
  const { stage, veil, marks, field, trails, visibleSprite } = canvasStage();
  stage.clear();
  const channels = { motion: false, flash: false };
  const frame = { run, channels, cssPixel: 1, at: (point: { x: number; y: number }) => point, foe: () => undefined };
  try {
    stage.update(1000 / 30, frame);
    expect(veil.visible).toBe(false);
    const effects = useSkill(run, 0), skill = effects.find(effect => effect.kind === "skill");
    if (!skill) throw new Error(`${general} did not cast`);
    if (stage.staged(general, skill)) stage.cast(general, { skill, results: [], run, squad, from: squad,
      tier: 1, channels, density: 1 }, () => undefined);
    let painted = false;
    for (let tick = 0; tick < 31; tick++) {
      advance(run, 1 / 30);
      stage.update(1000 / 30, frame);
      if (veil.visible) {
        expect(veil.depth).toBeGreaterThan(bodyDepth(800));
        expect(veil.depth).toBeLessThan(marks.depth);
        expect(veil.alpha).toBeLessThanOrEqual(.25);
        if ([marks, field, trails].some(layer => layer.fills > 0) || visibleSprite()) painted = true;
      }
    }
    expect(marks.depth).toBeLessThan(LAYER.impact);
    expect(painted).toBe(true);
  } finally { stage.clear(); }
});
