import type Phaser from "phaser";
import { CHONGTONG_SHOT_ART, LAYER, shotArt } from "./presentation";
import type { AmbientShow, FrameContext, SkillStage } from "./skill-stage";

/** Native fan shots and piercing arrows use the same simulation actor with different art. */
export class UnitProjectileView implements AmbientShow {
  readonly id = "bph-unit-projectiles";
  private readonly projectiles = new Map<number, Phaser.GameObjects.Image>();
  private seen = new Set<number>();
  private stage: SkillStage | undefined;
  private run: FrameContext["run"] | undefined;

  update(stage: SkillStage, frame: FrameContext): void {
    if (this.run !== frame.run) {
      this.clear();
      this.run = frame.run;
    }
    this.stage = stage;
    const active = new Set<number>();
    const fired = new Set<number>();
    for (const actor of frame.run.bph?.fx.actors ?? []) {
      if (actor.data.martialProjectile !== 1) continue;
      active.add(actor.id);
      const heading = Math.atan2(actor.data.vy, actor.data.vx);
      const chongtong = actor.cast?.spellId === "Hero6_Shotgun";
      if (chongtong && !this.seen.has(actor.id) && !fired.has(actor.ownerId)) {
        fired.add(actor.ownerId);
        const from = { x: actor.data.fromX, y: actor.data.fromY };
        stage.chongtongFire(from, Math.atan2(actor.toY - from.y, actor.toX - from.x), frame.channels);
      }
      const art = chongtong ? CHONGTONG_SHOT_ART : shotArt("arrow", heading);
      const image = this.projectiles.get(actor.id) ?? stage.image(art.key, art.frame);
      if (!image) continue;
      this.projectiles.set(actor.id, image);
      image.setTexture(art.key, art.frame).setPosition(actor.x, actor.y)
        .setRotation(art.rotation).setTint(art.tint).setDepth(LAYER.impact + 15).setVisible(true);
    }
    this.seen = active;
    for (const [id, image] of this.projectiles) if (!active.has(id)) {
      stage.free(image);
      this.projectiles.delete(id);
    }
  }

  clear(): void {
    for (const image of this.projectiles.values()) this.stage?.free(image);
    this.projectiles.clear();
    this.seen.clear();
    this.run = undefined;
  }
}
