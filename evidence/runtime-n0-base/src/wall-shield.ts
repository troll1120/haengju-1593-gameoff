import type Phaser from "phaser";
import type { PaintedArt } from "./painted-art";
import { CENTER } from "./geometry";
import { LAYER } from "./presentation";
import type { Run } from "./rules";

/** Protection follows the visible stone pixels, never the collision rectangle. */
export class WallShield {
  private readonly walls: { readonly wall: Phaser.GameObjects.Image; readonly glow: Phaser.GameObjects.Image }[] = [];
  private readonly badge: Phaser.GameObjects.Image;
  private until = 0;
  private badgeUntil = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly art: PaintedArt) {
    this.badge = scene.add.image(0, 0, "painted:skill-shield").setDisplaySize(32, 32).setDepth(LAYER.bars + 1).setVisible(false);
  }

  clear(): void {
    this.walls.forEach(({ glow }) => glow.destroy());
    this.walls.length = 0;
    this.until = this.badgeUntil = 0;
    this.badge.setVisible(false);
  }

  add(wall: Phaser.GameObjects.Image): void {
    const glow = this.scene.add.image(wall.x, wall.y, wall.texture.key).setOrigin(wall.originX, wall.originY).setDepth(wall.depth + .1).setVisible(false);
    this.walls.push({ wall, glow });
  }

  sync(run: Run, still: boolean): void {
    const active = run.shieldUntil > run.time;
    if (active && this.until !== run.shieldUntil) this.badgeUntil = run.time + 1.2;
    this.until = run.shieldUntil;
    const pulse = still ? .5 : .5 + .5 * Math.sin(run.time * Math.PI * 2 / 1.8);
    for (const { wall, glow } of this.walls) {
      glow.setVisible(active && wall.visible);
      if (!active || !wall.visible) continue;
      const key = `shield-${wall.texture.key}`;
      if (!this.scene.textures.exists(key)) {
        const source = wall.frame.source.image;
        if (source instanceof Uint8Array) throw new Error("Wall shield requires a canvas image source");
        const canvas = document.createElement("canvas");
        canvas.width = wall.width; canvas.height = wall.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Wall shield canvas unavailable");
        context.drawImage(source, 0, 0);
        context.globalCompositeOperation = "source-in";
        context.imageSmoothingEnabled = false;
        context.fillStyle = context.createPattern(this.art.source("wall-protection-fill"), "repeat")!;
        context.fillRect(0, 0, canvas.width, canvas.height);
        this.scene.textures.addCanvas(key, canvas);
      }
      glow.setTexture(key).setAlpha(.22 + .22 * pulse);
    }
    const gate = this.walls.find(({ wall }) => wall.texture.key === "gate")?.wall;
    if (gate) this.badge.setPosition(CENTER.x, gate.y - 28);
    this.badge.setVisible(active && run.time < this.badgeUntil).setAlpha(Math.min(1, Math.max(0, (this.badgeUntil - run.time) / .3)));
  }
}
