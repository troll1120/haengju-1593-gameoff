import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { launch } from "./review-browser";
import { ALLY_TEXTURES, allyAnimation, allyArt } from "../src/ally-animation";
import { enemyAnimation } from "../src/enemy-animation";
import { FULL_BOSS_ART } from "../src/bosses";
import { generalUnit, GENERALS } from "../src/roster";
import { SHIP_ART, SHIP_FRAME } from "../src/river";

const root = resolve(import.meta.dir, ".."), output = process.argv[2];
if (!output) throw new Error("Contact sheet output path is required");
type Cell = { readonly label: string; readonly file: string; readonly frame: number; readonly row?: number; readonly width: number; readonly height: number; readonly scale: number };
type Row = { readonly name: string; readonly cells: readonly Cell[] };
const rows: Row[] = [];
for await (const file of new Bun.Glob("*.png").scan(`${root}/public/art/units`)) {
  const base = file.slice(0, -4), cells: Cell[] = [];
  for (const pose of ["idle", "walk", "attack"] as const) {
    const animation = ALLY_TEXTURES.includes(base) ? allyAnimation(base, { moving: pose === "walk", attacking: pose === "attack", hurt: false, down: false, direction: "side" }) : null;
    const full = allyArt(base).full;
    for (const [index, frame] of (animation?.frames ?? (pose === "idle" ? [{ key: base, frame: 0 }] : [{ key: base, frame: 0 }, { key: base, frame: 1 }])).entries()) {
      const number = full ? index : frame.frame ?? 0;
      cells.push({ label: `${pose} ${number}`, file: full ? `generals/${allyArt(base).actor}/side_${pose}_${number}.png` : `units/${file}`,
        frame: full ? 0 : number, width: full ? 56 : 32, height: full ? 64 : 32, scale: full ? .5 : 1 });
    }
  }
  rows.push({ name: base, cells });
}
for (const general of GENERALS) {
  const base = generalUnit(general), source = rows.find(row => row.name === base);
  if (!source) throw new Error(`Missing general body: ${general}`);
  rows.push({ name: `${general} / ${base}`, cells: source.cells });
}
const fullBodies: readonly (readonly [string, string | undefined])[] = [...FULL_BOSS_ART.map(base => [base, undefined] as const),
  ...ALLY_TEXTURES.filter(ally => allyArt(ally).full).map(ally => [allyArt(ally).actor, ally] as const)];
for (const [base, ally] of fullBodies) for (const direction of ["front", "back", "side"] as const) {
  const cells: Cell[] = [];
  for (const pose of ["idle", "walk", "attack"] as const) {
    const animation = ally
      ? allyAnimation(ally, { moving: pose === "walk", attacking: pose === "attack", hurt: false, down: false, direction })
      : enemyAnimation({ base, full: true },
        { moving: pose === "walk", attacking: pose === "attack", hurt: false, dead: false, flashing: false, direction });
    for (const number of animation.frames.keys()) {
      cells.push({ label: `${pose} ${number}`, file: `generals/${base}/${direction}_${pose}_${number}.png`, frame: 0, width: 56, height: 64, scale: .5 });
    }
  }
  rows.push({ name: `${base} ${direction}`, cells });
}
for (const base of SHIP_ART) for (const direction of ["front", "back", "side"] as const) {
  const cells: Cell[] = [];
  for (const pose of ["idle", "walk", "attack"] as const) {
    const animation = enemyAnimation({ base, full: false, ship: true },
      { moving: pose === "walk", attacking: pose === "attack", hurt: false, flashing: false, direction });
    for (const frame of animation.frames) {
      const number = frame.frame ?? 0;
      cells.push({ label: `${pose} ${number % 14}`, file: `ships/${base}.png`, frame: number % 14, row: Math.floor(number / 14),
        width: SHIP_FRAME.width, height: SHIP_FRAME.height, scale: .5 });
    }
  }
  rows.push({ name: `${base} ${direction}`, cells });
}
const sources: Record<string, string> = {};
for (const row of rows) for (const cell of row.cells) if (!sources[cell.file])
  sources[cell.file] = `data:image/png;base64,${Buffer.from(await Bun.file(`${root}/public/art/${cell.file}`).bytes()).toString("base64")}`;
const profile = await mkdtemp(`${tmpdir()}/castle-contact-`), phone = await launch("about:blank", profile, 1600, 900, ["--single-process", "--no-zygote", "--disable-gpu"]);
try {
  const png = await phone.evaluate(`(async () => {
    const rows=${JSON.stringify(rows)}, sources=${JSON.stringify(sources)}, pictures={};
    await Promise.all(Object.entries(sources).map(([key,src])=>new Promise((resolve,reject)=>{
      const image=new Image(); image.onload=()=>{pictures[key]=image;resolve();};image.onerror=reject;image.src=src;
    })));
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=60+rows.length*164;
    const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.fillStyle='#eedab2';c.fillRect(0,0,canvas.width,canvas.height);
    c.fillStyle='#39251b';c.font='18px monospace';c.fillText('Game animation frames | 1x and 2x | nearest neighbour | idle / walk / attack',12,28);
    rows.forEach((row,index)=>{
      const top=60+index*164;c.fillStyle=index%2?'#d4b67f':'#e9cf99';c.fillRect(0,top,1600,164);
      c.fillStyle='#39251b';c.font='14px monospace';c.fillText(row.name,12,top+20);c.fillText('1x',12,top+62);c.fillText('2x',12,top+126);
      row.cells.forEach((cell,i)=>{
        const x=200+i*112;c.fillText(cell.label,x,top+18);
        for(const [scale,y] of [[cell.scale,top+68],[cell.scale*2,top+150]]){
          const w=cell.width*scale,h=cell.height*scale;
          c.strokeStyle='#8f6038';c.beginPath();c.moveTo(x-4,y+.5);c.lineTo(x+84,y+.5);c.stroke();
          c.drawImage(pictures[cell.file],cell.frame*cell.width,(cell.row??0)*cell.height,cell.width,cell.height,x,y-h,w,h);
        }
      });
    });
    return canvas.toDataURL('image/png');
  })()`);
  if (typeof png !== "string") throw new Error("Canvas did not return a PNG");
  await Bun.write(output, Buffer.from(png.split(",")[1] ?? "", "base64"));
  await Bun.write(`${output}.json`, JSON.stringify(rows, null, 2));
  console.log(`CONTACT rows=${rows.length} output=${output}`);
} finally {
  phone.view.close(); await rm(profile, { recursive: true });
}
