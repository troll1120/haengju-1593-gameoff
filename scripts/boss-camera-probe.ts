import Phaser from "phaser";
import { BossCamera } from "../src/boss-camera";

class Probe extends Phaser.Scene {
  create(): void {
    let motion = true;
    this.add.rectangle(0, 0, 390, 800, 0x344b3e).setOrigin(0);
    const accent = new BossCamera(this, () => motion);
    const hud = this.add.rectangle(14, 24, 24, 24, 0xffdf53);
    accent.fixed(hud);
    const world = this.add.rectangle(180, 400, 32, 32, 0xa43b2c);
    const main = this.cameras.main, fixed = this.cameras.getCamera("fixed-hud");
    if (!fixed) throw new Error("Fixed HUD camera was not created");
    const sample = (age: number) => {
      this.time.now = 1000 + age;
      this.events.emit("postupdate");
      main.preRender();
      fixed.preRender();
      return { world: main.zoom, hud: fixed.zoom, fixedPoint: fixed.getWorldPoint(14, 24),
        centre: main.getWorldPoint(195, 400),
        edgesCovered: main.getWorldPoint(0, 0).x >= 0 && main.getWorldPoint(0, 0).y >= 0
          && main.getWorldPoint(390, 800).x <= 390 && main.getWorldPoint(390, 800).y <= 800 };
    };
    this.time.now = 1000;
    accent.death();
    const onset = sample(0), peak = sample(100), hold = sample(200), settling = sample(300), end = sample(400);
    this.time.now = 2000;
    accent.death();
    const active = sample(1100);
    motion = false;
    const reduced = sample(1120);
    motion = true;
    accent.reset();
    const reset = sample(1130);
    const visible = { worldOnMain: world.willRender(main), worldOnHud: world.willRender(fixed),
      hudOnMain: hud.willRender(main), hudOnHud: hud.willRender(fixed) };
    Reflect.set(window, "cameraProbe", { onset, peak, hold, settling, end, active, reduced, reset, visible });
  }
}
new Phaser.Game({ type: Phaser.CANVAS, width: 390, height: 800, banner: false,
  audio: { noAudio: true }, scene: [Probe] });
