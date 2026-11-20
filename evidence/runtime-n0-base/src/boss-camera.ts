import type Phaser from "phaser";

/** Render-only camera accent. The second camera keeps the purse and flying coins fixed. */
export class BossCamera {
  private readonly world: Phaser.Cameras.Scene2D.Camera;
  private readonly hud: Phaser.Cameras.Scene2D.Camera;
  private startedAt = -Infinity;

  constructor(private readonly scene: Phaser.Scene, private readonly motion: () => boolean) {
    this.world = scene.cameras.main;
    this.hud = scene.cameras.add().setName("fixed-hud");
    this.hud.inputEnabled = false;
    this.hud.ignore(scene.children.getChildren());
    const added = (object: Phaser.GameObjects.GameObject) => this.hud.ignore(object);
    const update = () => {
      const age = scene.time.now - this.startedAt;
      const amount = this.motion() ? age < 100 ? Math.max(0, age / 100)
        : age < 200 ? 1 : Math.max(0, 1 - (age - 200) / 200) : 0;
      this.world.setZoom(1 + .025 * amount);
    };
    scene.events.on("addedtoscene", added);
    scene.events.on("postupdate", update);
    scene.events.once("shutdown", () => {
      scene.events.off("addedtoscene", added);
      scene.events.off("postupdate", update);
    });
  }

  fixed(object: Phaser.GameObjects.GameObject): void {
    object.cameraFilter &= ~this.hud.id;
    this.world.ignore(object);
  }

  death(): void {
    if (this.scene.time.now - this.startedAt < 500) return;
    this.startedAt = this.scene.time.now;
  }

  reset(): void {
    this.startedAt = -Infinity;
    this.world.setZoom(1);
  }
}
