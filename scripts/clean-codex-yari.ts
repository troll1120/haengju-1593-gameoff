import { mkdir } from "node:fs/promises";
import { root, decode, crop, components, encode } from "./codex-portrait-pixels";

// One-time source cleanup. Refuse to overwrite the original evidence on a second run.
const out = `${root}/review/codex-unknown/sprite-blobs`;
if (await Bun.file(`${out}/before-yari.png`).exists()) throw new Error("Original yari evidence already exists");
await mkdir(out, { recursive: true });
const file = `${root}/public/art/units/yari.png`, originalBytes = await Bun.file(file).bytes();
const image = await decode(file), before = image.data.slice();
const removed = new Set<number>();
for (const [name, x, y] of [["yari", 0, 0], ["yari-frame1", 32, 0]] as const) {
  const rect = { x, y, width: 32, height: 32 }, frame = crop(image, rect);
  const blob = components(frame).find(component => component.x === 2 && component.y === (x ? 11 : 12)
    && component.width === 4 && component.height === 4 && component.count === 12);
  if (!blob) throw new Error(`Expected detached yari blob in ${name}`);
  await Bun.write(`${out}/before-${name}.png`, encode(crop(image, rect, 8)));
  for (const pixel of blob.pixels) {
    const globalPixel = (Math.floor(pixel / 32) + y) * image.width + pixel % 32 + x;
    removed.add(globalPixel);
    image.data.fill(0, globalPixel * 4, globalPixel * 4 + 4);
  }
  await Bun.write(`${out}/after-${name}.png`, encode(crop(image, rect, 8)));
}
for (let at = 0; at < before.length; at++)
  if (!removed.has(Math.floor(at / 4)) && before[at] !== image.data[at])
    throw new Error(`Changed a non-blob byte: ${at}`);
if (removed.size !== 24) throw new Error(`Unexpected removal count: ${removed.size}`);
await Bun.write(file, encode(image));
const written = await decode(file);
if (written.width !== image.width || written.height !== image.height || !written.data.every((v, at) => v === image.data[at]))
  throw new Error("Written PNG changed dimensions or pixel values");
console.log(JSON.stringify({
  file: "public/art/units/yari.png", removedPixels: removed.size,
  beforeSha256: new Bun.CryptoHasher("sha256").update(originalBytes).digest("hex"),
  afterSha256: new Bun.CryptoHasher("sha256").update(await Bun.file(file).bytes()).digest("hex"),
  figureAndAllOtherPixelsUnchanged: true,
}, null, 2));
