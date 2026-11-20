import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

// Each character is one art pixel. "." is transparent; O is the ink outline.
// Run: bun scripts/relic-art.ts [--sheet /tmp/relic-art-sheet.png]
const ink = "#39251b";
type Sprite = {
  readonly id: string;
  readonly palette: Readonly<Record<string, string>>;
  readonly map: readonly string[];
};

const sprites: readonly Sprite[] = [
  {
    id: "Relic1_CharmWarrior",
    palette: { O: ink, d: "#a67113", g: "#d7ad54", h: "#ffe29a", r: "#a43b2c" },
    map: [
      "................",
      "..........OO....",
      ".........OghO...",
      ".........OgOhO..",
      "........OhgdOhO.",
      ".......OhgdgggO.",
      ".......OhgdOOO..",
      "......OhgdO.....",
      ".....OhgdO......",
      "....OhgdO.......",
      "...OhgdOrOO.....",
      "..OhgO.OrO......",
      ".OhgO..OrO......",
      "..OO..OrOrO.....",
      ".......O.O......",
      "................",
    ],
  },
  {
    id: "Relic1_Rapier",
    palette: { O: ink, s: "#8a8f97", h: "#c9ced4", g: "#d7ad54", r: "#a43b2c" },
    map: [
      "................",
      ".............O..",
      "............OhO.",
      "............OhO.",
      "...........OhsO.",
      "..........OhhsO.",
      ".........OhhsO..",
      "........OhhsO...",
      ".......OhhsO....",
      "......OhhsO.....",
      "...OOOhssO......",
      "..OgggOOO.......",
      "...OgOOrO.......",
      "..OrO.OrO.......",
      "...O.OrOrO......",
      "................",
    ],
  },
  {
    id: "Relic1_FourLeafClover",
    palette: { O: ink, d: "#5b5f66", s: "#8a8f97", h: "#c9ced4" },
    map: [
      "................",
      ".....OOOOOO.....",
      "...OOhhhhssOO...",
      "..OhhOsOsOssO...",
      "..OhssOOOOdssO..",
      ".OhOsO....OsOdO.",
      ".OhssO....OssdO.",
      ".OhssO....OssdO.",
      ".OhOsO....OsOdO.",
      ".OhssO....OssdO.",
      ".OhssO....OssdO.",
      ".OhOsO....OsOdO.",
      ".OhssO....OssdO.",
      "..OOO......OOO..",
      "................",
      "................",
    ],
  },
  {
    id: "Relic2_Nature_TalkingBeet",
    palette: { O: ink, g: "#327965", w: "#f9e9c4", s: "#d4b67f", p: "#965b91" },
    map: [
      "................",
      "....OO...OO.....",
      "...OggO.OggO....",
      "....OggOggO.....",
      ".....OgggO......",
      "....OOOgOOO.....",
      "...OpppppppO....",
      "..OpppppppppO...",
      "..OwwwwwwwwwO...",
      "..OwOwwwOwwwO...",
      "..OwwwwwwwwwO...",
      "...OwwOOwwsO....",
      "....OwOOwsO.....",
      ".....OwwsO......",
      "......OOO.......",
      "................",
    ],
  },
  {
    id: "Relic1_GiantsMight",
    palette: { O: ink, d: "#3d424b", s: "#5b5f66", h: "#8a8f97", g: "#d7ad54" },
    map: [
      "................",
      "....OOOOOOOO....",
      "...OhhOhOhhsO...",
      "...OhsOsOsssO...",
      "..OOssOsOsssO...",
      ".OhOssssssssO...",
      ".OhOssOOOOssO...",
      ".OhsOOshhhOsO...",
      "..OssOssssOsO...",
      "...OssssssdO....",
      "....OdddddO.....",
      "...OOgggggOO....",
      "...OhsssssdO....",
      "...OhsssssdO....",
      "...OOOOOOOOO....",
      "................",
    ],
  },
  {
    id: "Relic1_Club",
    palette: { O: ink, s: "#5b5f66", h: "#c9ced4", w: "#68442b", l: "#b88a55" },
    map: [
      "................",
      ".........OO.....",
      ".......OOhhOO...",
      ".....OOhshhssO..",
      ".....OOshOsssOO.",
      ".....OhhsOsshsO.",
      "......OssOsshOO.",
      ".......OOssOO...",
      ".......OlOO.....",
      "......OlwO......",
      ".....OlwO.......",
      "....OlwO........",
      "...OlwO.........",
      "..OlwO..........",
      "...OO...........",
      "................",
    ],
  },
  {
    id: "R_HeroMoveSpeed",
    palette: { O: ink, d: "#8f6038", s: "#b88a55", h: "#eedab2", l: "#fff2c6" },
    // A straw shoe seen from the side, toe to the right: high heel, dark foot opening, straw cords down the side, flat sole.
    map: [
      "................",
      "................",
      "................",
      "................",
      ".....OOOO.......",
      ".OO.OlddddO.....",
      "....OlhdddhOO...",
      ".OO.OhshshshhOO.",
      "....OhshshshshO.",
      ".OO.OhshshshshO.",
      "....OdddddddddO.",
      ".....OOOOOOOOO..",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  {
    id: "Relic1_TomeDuration",
    palette: { O: ink, r: "#862e25", p: "#eedab2", s: "#d4b67f", g: "#d7ad54" },
    map: [
      "................",
      "......OO.OO.....",
      ".....OrgOrgO....",
      "......OgOgO.....",
      "...OOOOggOOOO...",
      "..OgrrrggrrrgO..",
      ".OrrggrggrggrO..",
      ".OpppppgpppppO..",
      ".OsssssgsssssO..",
      "..OrrrrgrrrrrO..",
      ".OpppppgpppppO..",
      ".OsssssgsssssO..",
      "..OrrrrgrrrrrO..",
      ".OpppppgpppppO..",
      "..OOOOOOOOOOO...",
      "................",
    ],
  },
  {
    id: "R_AutomaticBallista",
    palette: { O: ink, w: "#68442b", d: "#a67113", g: "#d7ad54", h: "#ffe29a", s: "#c9ced4" },
    map: [
      "................",
      ".......O........",
      "......OsO.......",
      "......OsO.......",
      ".OO...OgO...OO..",
      ".OhO..OhO..OhO..",
      ".OgdO.OhO.OdgO..",
      "..OwgdOhOdgwO...",
      "...OggghgggO....",
      "..OOOOOhOOOOO...",
      "..O...OgwO..O...",
      "...O..OgwO.O....",
      "....OOOgwOO.....",
      ".....OghgO......",
      "......OOO.......",
      "................",
    ],
  },
];

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(name, "ascii"), data]);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([header, body, checksum]);
}

function png(width: number, height: number, pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6; // RGBA, eight bits per channel.
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    // Buffer.alloc leaves the first byte of every scanline at filter 0.
    scanlines.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", new Uint8Array()),
  ]);
}

class ArtError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "ArtError";
  }
}

function rgb(hex: string): readonly [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new ArtError(`Invalid palette color: ${hex}`);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function raster(sprite: Sprite, scale: number): Uint8Array {
  if (sprite.map.length !== 16) throw new ArtError(`${sprite.id}: expected 16 rows`);
  const size = 16 * scale;
  const pixels = new Uint8Array(size * size * 4);
  for (const [y, row] of sprite.map.entries()) {
    if (row.length !== 16) throw new ArtError(`${sprite.id}: row ${y + 1} has ${row.length} characters`);
    for (const [x, key] of [...row].entries()) {
      if (key === ".") continue;
      if (x === 0 || y === 0 || x === 15 || y === 15) {
        throw new ArtError(`${sprite.id}: art must leave an empty border`);
      }
      const color = sprite.palette[key];
      if (!color) throw new ArtError(`${sprite.id}: unknown palette key ${key}`);
      const [r, g, b] = rgb(color);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          pixels.set([r, g, b, 255], ((y * scale + dy) * size + x * scale + dx) * 4);
        }
      }
    }
  }
  return pixels;
}

const output = resolve(import.meta.dir, "../public/art/relics");
const args = Bun.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--sheet" || !args[1])) {
  throw new ArtError("Usage: bun scripts/relic-art.ts [--sheet <path.png>]");
}

// Validate all maps before writing any assets.
const images = sprites.map((sprite) => ({ sprite, pixels: raster(sprite, 2) }));
await mkdir(output, { recursive: true });
for (const { sprite, pixels } of images) {
  await Bun.write(resolve(output, `${sprite.id}.png`), png(32, 32, pixels));
  console.log(`${sprite.id}.png: 32x32 RGBA`);
}

if (args[0] === "--sheet" && args[1]) {
  // Two 3x3 panels: left paper, right dark. Reading order within each is the
  // requested order. Each 32px asset is enlarged 4x by integer pixel copying.
  const cell = 160;
  const panel = cell * 3;
  const width = panel * 2;
  const height = panel;
  const sheet = new Uint8Array(width * height * 4);
  for (let side = 0; side < 2; side++) {
    const background = rgb(side === 0 ? "#eedab2" : "#231d17");
    for (let y = 0; y < height; y++) {
      for (let x = side * panel; x < (side + 1) * panel; x++) {
        sheet.set([...background, 255], (y * width + x) * 4);
      }
    }
    for (const [index, { pixels }] of images.entries()) {
      const left = side * panel + (index % 3) * cell + 16;
      const top = Math.floor(index / 3) * cell + 16;
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const source = (Math.floor(y / 4) * 32 + Math.floor(x / 4)) * 4;
          if (pixels[source + 3] === 255) {
            sheet.set(pixels.subarray(source, source + 4), ((top + y) * width + left + x) * 4);
          }
        }
      }
    }
  }
  await mkdir(dirname(resolve(args[1])), { recursive: true });
  await Bun.write(args[1], png(width, height, sheet));
  console.log(`Contact sheet: ${args[1]} (${width}x${height}, nearest-neighbor 4x)`);
}
