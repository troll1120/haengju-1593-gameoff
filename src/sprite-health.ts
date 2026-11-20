import type Phaser from "phaser";
import { healthAnchor } from "./sprite-layout";

type Bounds = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
const opaqueFrames = new WeakMap<Phaser.Textures.Frame, Bounds>();
const scan = document.createElement("canvas");
const context = scan.getContext("2d", { willReadFrequently: true });

function opaqueBounds(frame: Phaser.Textures.Frame): Bounds {
  let bounds = opaqueFrames.get(frame);
  if (!bounds) {
    if (!context) throw new Error("Sprite bounds canvas is unavailable");
    scan.width = frame.width; scan.height = frame.height;
    const image = frame.source.image;
    if (image instanceof Uint8Array) throw new Error("Sprite bounds require an image texture");
    context.drawImage(image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
      frame.x, frame.y, frame.cutWidth, frame.cutHeight);
    const pixels = context.getImageData(0, 0, frame.width, frame.height).data;
    let left = frame.width, top = frame.height, right = 0, bottom = 0;
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
      if (pixels[(y * frame.width + x) * 4 + 3] < 32) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    }
    bounds = { x: left, y: top, width: right - left, height: bottom - top };
    opaqueFrames.set(frame, bounds);
  }
  return bounds;
}

/** Transparent padding in the 56x64 boss art is not part of its body. */
export function spriteHealthAnchor(sprite: Phaser.GameObjects.Sprite) {
  const frame = sprite.frame, bounds = opaqueBounds(frame);
  const matrix = sprite.getWorldTransformMatrix();
  const x = sprite.flipX ? frame.width - bounds.x - bounds.width : bounds.x;
  const y = sprite.flipY ? frame.height - bounds.y - bounds.height : bounds.y;
  const corners = [[x, y], [x + bounds.width, y], [x, y + bounds.height], [x + bounds.width, y + bounds.height]]
    .map(([px, py]) => matrix.transformPoint(px - sprite.displayOriginX, py - sprite.displayOriginY));
  const left = Math.min(...corners.map(p => p.x)), right = Math.max(...corners.map(p => p.x));
  return healthAnchor({ x: left, y: Math.min(...corners.map(p => p.y)), width: right - left });
}

/** Head bars ride the unit's resting point (its ground position less any fixed lift) at the height of its animation's first
 *  frame, so walk bob, step frames, lunges and hit recoil do not move them (owner DM 1794893457.152139). */
export function restingHealthAnchor(sprite: Phaser.GameObjects.Sprite, rest: { readonly x: number; readonly y: number }) {
  const frame = sprite.anims.currentAnim?.frames[0]?.frame ?? sprite.frame, bounds = opaqueBounds(frame);
  const scaleX = Math.abs(sprite.scaleX), scaleY = Math.abs(sprite.scaleY);
  const x = sprite.flipX ? frame.width - bounds.x - bounds.width : bounds.x;
  return healthAnchor({ x: rest.x + (x - sprite.originX * frame.width) * scaleX,
    y: rest.y + (bounds.y - sprite.originY * frame.height) * scaleY, width: bounds.width * scaleX });
}
