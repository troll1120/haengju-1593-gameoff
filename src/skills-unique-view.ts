import type Phaser from "phaser";
import type { PaintedArt } from "./painted-art";
import { bodyDepth, LAYER } from "./presentation";
import type { Run } from "./rules";
import { skillVfx } from "./skill-vfx";

/** Simulation-owned lifetimes also pause the reused fence and militia artwork. */
export class UniqueSkillView {
  private readonly bodies = new Map<number, Phaser.GameObjects.Sprite[]>();
  private readonly lines: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene, private readonly art: PaintedArt) {
    this.lines = scene.add.graphics().setDepth(LAYER.ground + 2);
  }

  clear(): void {
    this.lines.clear();
    for (const sprites of this.bodies.values()) for (const sprite of sprites) sprite.destroy();
    this.bodies.clear();
  }

  sync(run: Run, still: boolean): void {
    this.lines.clear();
    const alive = new Set<number>();
    for (const skill of run.uniqueSkills ?? []) {
      if (run.time >= skill.until) continue;
      const look = skillVfx(run, run.squads.find(squad => squad.id === skill.squad));
      switch (skill.kind) {
        case "hold": {
          const length = Math.hypot(skill.to.x - skill.from.x, skill.to.y - skill.from.y), count = Math.ceil(length / 24);
          for (let index = 0; index <= count; index++) {
            const x = skill.from.x + (skill.to.x - skill.from.x) * index / count;
            const y = skill.from.y + (skill.to.y - skill.from.y) * index / count;
            this.art.draw(this.lines, "palisade-crosses", x - 12, y - 12, { width: 24, height: 24, alpha: .85 * look.alpha });
          }
          break;
        }
        case "ambush": {
          alive.add(skill.id);
          let sprites = this.bodies.get(skill.id);
          if (!sprites) {
            sprites = skill.members.map(member => this.scene.add.sprite(member.x, member.y, "uibyeong"));
            this.bodies.set(skill.id, sprites);
          }
          skill.members.forEach((member, index) => {
            const sprite = sprites[index], age = run.time - skill.startedAt, sinceHit = run.time - member.struckAt;
            const alpha = Math.min(1, age / .15, (skill.until - run.time) / .2);
            const attacking = sinceHit >= 0 && sinceHit < .25;
            const angle = Math.atan2(member.aimY - member.y, member.aimX - member.x);
            const lunge = attacking && !still ? 5 * Math.sin(sinceHit / .25 * Math.PI) : 0;
            sprite.setPosition(member.x + Math.cos(angle) * lunge, member.y + Math.sin(angle) * lunge + (still ? 0 : 8 * (1 - alpha)))
              .setFrame(attacking ? 1 : 0).setFlipX(member.aimX < member.x).setAlpha(alpha).setDepth(bodyDepth(member.y));
          });
          break;
        }
      }
    }
    for (const [id, sprites] of this.bodies) if (!alive.has(id)) {
      for (const sprite of sprites) sprite.destroy();
      this.bodies.delete(id);
    }
  }
}
