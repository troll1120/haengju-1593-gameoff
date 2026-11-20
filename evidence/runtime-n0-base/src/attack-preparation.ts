import type Phaser from "phaser";
import { reserveHealthBar } from "./health-bars";
import type { HealthBar } from "./health-bars";
import { PALETTE } from "./presentation";
import { spriteHealthAnchor } from "./sprite-health";

/** Read the combat deadline without advancing combat or consuming randomness. */
export function drawAttackPreparation(
  bars: Phaser.GameObjects.Graphics, sprite: Phaser.GameObjects.Sprite, occupied: HealthBar[],
  strikeAt: number, time: number, windupMs: number, leader: boolean,
): void {
  if (strikeAt <= 0) return;
  const head = spriteHealthAnchor(sprite), width = leader ? 40 : 22;
  const share = Math.max(0, Math.min(1, 1 - (strikeAt - time) / (windupMs / 1000)));
  const box = reserveHealthBar({ x: Math.round(head.x) - width / 2, y: Math.round(head.y) - 6, width, height: 4 }, occupied);
  bars.fillStyle(PALETTE.outline).fillRect(box.x, box.y, width, 4)
    .fillStyle(PALETTE.dark).fillRect(box.x + 1, box.y + 1, width - 2, 2)
    .fillStyle(PALETTE.gold).fillRect(box.x + 1, box.y + 1, Math.round((width - 2) * share), 2);
}
