import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type Phaser from "phaser";
import { PaintedArt, paintedUrl } from "./painted-art";

const RGBA = [
  255,0,0,255, 255,0,0,255, 0,255,0,128, 0,0,255,255,
  10,20,30,255, 40,50,60,64, 70,80,90,255, 100,110,120,255,
  130,140,150,255, 160,170,180,128, 190,200,210,255, 220,230,240,255,
  25,50,75,255, 80,60,40,255, 90,100,110,255, 0,0,0,0,
];
type Rect = { x: number; y: number; width: number; height: number; color: number; alpha: number };

class Graphics {
  color = 0;
  alpha = 1;
  styles = 0;
  rectangles: Rect[] = [];
  fillStyle(color: number, alpha: number): this {
    this.color = color; this.alpha = alpha; this.styles++; return this;
  }
  fillRect(x: number, y: number, width: number, height: number): this {
    this.rectangles.push({ x,y,width,height,color:this.color,alpha:this.alpha });
    return this;
  }
  get graphics(): Phaser.GameObjects.Graphics { return this as unknown as Phaser.GameObjects.Graphics; }
  raster(): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(32*32*4), visited = new Set<number>();
    for (const r of this.rectangles) {
      expect([r.x,r.y,r.width,r.height].every(Number.isInteger)).toBe(true);
      expect(r.width > 0 && r.height > 0).toBe(true);
      for (let y=r.y; y<r.y+r.height; y++) for (let x=r.x; x<r.x+r.width; x++) {
        expect(x>=0 && x<32 && y>=0 && y<32).toBe(true);
        const pixel = y*32+x;
        expect(visited.has(pixel)).toBe(false);
        visited.add(pixel);
        pixels.set([r.color>>>16, r.color>>>8&255, r.color&255, Math.round(r.alpha*255)],pixel*4);
      }
    }
    return pixels;
  }
}

let originalDocument: PropertyDescriptor | undefined;
let readbacks: number;
let data: Uint8ClampedArray;
let image: HTMLImageElement;
let loaded: [string,string][];
let art: PaintedArt;
beforeEach(() => {
  originalDocument = Object.getOwnPropertyDescriptor(globalThis,"document");
  readbacks = 0; data = new Uint8ClampedArray(RGBA); loaded = [];
  image = { naturalWidth:4, naturalHeight:4 } as HTMLImageElement;
  Object.defineProperty(globalThis,"document",{ configurable:true,value:{
    createElement: (tag: string) => {
      expect(tag).toBe("canvas");
      return { width:0,height:0,getContext: (kind: string) => {
        expect(kind).toBe("2d");
        return {
          drawImage: (source: HTMLImageElement) => expect(source).toBe(image),
          getImageData: () => { readbacks++; return { data }; },
        };
      }};
    },
  }});
  const scene = {
    load:{ image:(key:string,url:string) => { loaded.push([key,url]); } },
    textures:{ get:(key:string) => {
      expect(key).toBe("painted:fixture");
      return { getSourceImage:() => image };
    }},
  } as unknown as Phaser.Scene;
  art = new PaintedArt(scene);
});
afterEach(() => {
  if (originalDocument) Object.defineProperty(globalThis,"document",originalDocument);
  else Reflect.deleteProperty(globalThis,"document");
});

function expectRender(g: Graphics, xs: number[], ys: number[],
  origin: [number,number] = [0,0], alpha=1, clip?: [number,number,number,number]): void {
  const expected = new Uint8ClampedArray(32*32*4);
  for (let y=0;y<ys.length;y++) for (let x=0;x<xs.length;x++) {
    if (clip && (x<clip[0] || y<clip[1] || x>=clip[0]+clip[2] || y>=clip[1]+clip[3])) continue;
    const source = (ys[y]*4+xs[x])*4;
    if (!RGBA[source+3]) continue;
    expected.set([RGBA[source],RGBA[source+1],RGBA[source+2],Math.round(RGBA[source+3]*alpha)],
      ((origin[1]+y)*32+origin[0]+x)*4);
  }
  expect(g.raster()).toEqual(expected);
}

describe("PaintedArt Graphics pixel contract",() => {
  test("matching vertical runs render as one rectangle without changing pixels", () => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++)
      data.set([25, 50, 75, 255], (y * 4 + x) * 4);
    art.prepare(["fixture"]);
    const g = new Graphics();
    art.draw(g.graphics, "fixture", 0, 0);
    expect(g.rectangles).toEqual([{ x: 0, y: 0, width: 4, height: 4, color: 0x19324b, alpha: 1 }]);
    const raster = g.raster();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++)
      expect([...raster.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)]).toEqual([25, 50, 75, 255]);
  });
  test("URL, loader key, source identity and immutable horizontal-run cache",() => {
    expect(paintedUrl("fixture")).toBe("./art/icons/fixture.webp");
    art.preload(["fixture"]);
    expect(loaded).toEqual([["painted:fixture","./art/icons/fixture.webp"]]);
    expect(art.source("fixture")).toBe(image);
    art.prepare(["fixture"]);
    expect(readbacks).toBe(1);
    data.fill(0);
    const g = new Graphics();
    expect(art.draw(g.graphics,"fixture",0,0)).toBe(g.graphics);
    expectRender(g,[0,1,2,3],[0,1,2,3]);
    expect(g.rectangles.find(r=>r.y===0 && r.x===0)?.width).toBe(2);
    const second = new Graphics();
    art.draw(second.graphics,"fixture",0,0);
    expect(second.rectangles).toEqual(g.rectangles);
    expect(readbacks).toBe(1);
  });
  test("nearest rounded integer edges preserve colors when enlarging and shrinking",() => {
    art.prepare(["fixture"]);
    const large = new Graphics(), small = new Graphics();
    art.draw(large.graphics,"fixture",2.4,3.6,{width:7.2,height:5.2});
    expectRender(large,[0,0,1,1,2,3,3],[0,1,1,2,3],[2,4]);
    art.draw(small.graphics,"fixture",0,0,{width:3,height:2});
    expectRender(small,[0,1,3],[0,2]);
  });
  test("source crop uses full-image default dimensions and can request crop dimensions",() => {
    art.prepare(["fixture"]);
    const full = new Graphics(), crop = new Graphics();
    const source = {x:1,y:1,width:2,height:2};
    art.draw(full.graphics,"fixture",0,0,{source});
    expectRender(full,[1,1,2,2],[1,1,2,2]);
    art.draw(crop.graphics,"fixture",0,0,{source,width:2,height:2});
    expectRender(crop,[1,2],[1,2]);
  });
  test("output-local clip preserves fill ratio after scaling and translation",() => {
    art.prepare(["fixture"]);
    const g = new Graphics();
    art.draw(g.graphics,"fixture",5,7,{width:7,height:5,clip:{x:2,y:1,width:3,height:2}});
    expectRender(g,[0,0,1,1,2,3,3],[0,1,1,2,3],[5,7],1,[2,1,3,2]);
    const empty = new Graphics();
    expect(art.draw(empty.graphics,"fixture",0,0,{clip:{x:0,y:0,width:0,height:4}})).toBe(empty.graphics);
    expect(empty.rectangles).toHaveLength(0);
  });
  test("source alpha multiplies requested opacity without color changes",() => {
    art.prepare(["fixture"]);
    const g = new Graphics();
    art.draw(g.graphics,"fixture",0,0,{alpha:0.5});
    expectRender(g,[0,1,2,3],[0,1,2,3],[0,0],0.5);
    const invisible = new Graphics();
    art.draw(invisible.graphics,"fixture",0,0,{alpha:0});
    expect(invisible.rectangles).toHaveLength(0);
  });
  test("nine-slice caps stay one pixel and center tiles truncate at boundaries",() => {
    art.prepare(["fixture"]);
    const g = new Graphics();
    art.draw(g.graphics,"fixture",0,0,{width:9,height:7,insets:{left:1,right:1,top:1,bottom:1}});
    expectRender(g,[0,1,2,1,2,1,2,1,3],[0,1,2,1,2,1,3]);
    const caps = new Graphics();
    art.draw(caps.graphics,"fixture",0,0,{width:2,height:2,insets:{left:1,right:1,top:1,bottom:1}});
    expectRender(caps,[0,3],[0,3]);
    const short = new Graphics();
    art.draw(short.graphics,"fixture",0,0,{width:1,height:1,insets:{left:1,right:1,top:1,bottom:1}});
    expectRender(short,[0],[0]);
  });
  test("source crop, tiling and clipping share output coordinates without overlaps",() => {
    art.prepare(["fixture"]);
    const g = new Graphics();
    art.draw(g.graphics,"fixture",3,2,{
      source:{x:1,y:1,width:2,height:2},width:5,height:3,
      insets:{left:0,right:0,top:0,bottom:0},clip:{x:1,y:1,width:3,height:2},
    });
    expectRender(g,[1,2,1,2,1],[1,2,1],[3,2],1,[1,1,3,2]);
  });
});
