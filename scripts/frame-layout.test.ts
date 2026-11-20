import { afterAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";

const session = reviewBrowserSession(["--single-process", "--no-zygote", "--disable-gpu"]);
afterAll(() => session.close());

test("native frame cuts preserve ornaments and keep reward previews inside small screens", async () => {
  const root = resolve(import.meta.dir, "..");
  const main = await Bun.file(`${root}/src/main.ts`).text();
  const gauge = main.match(/  private gauge\([\s\S]*?\n  }/)![0];
  const gaugeClass = new Bun.Transpiler({ loader: "ts" }).transformSync(
    `class NativeGauge {\n${gauge}\n}\nwindow.NativeGauge = NativeGauge;`,
  );
  const wall = main.match(/"wall-hit-flash", tile\.x[\s\S]*?(\{ width: TILE,[\s\S]*?\}\s*\})\);/)![1];
  const coin = main.match(/"coin-hud-highlight", 5, 12,[\s\S]*?(\{ width: 52,[\s\S]*?\}\s*\})\);/)![1];
  const wallOptions = new Function("TILE", "heat", `return (${wall})`)(32, 1);
  const coinOptions = new Function(`return (${coin})`)();
  const offsets = JSON.parse(main.match(/reelStrip\.innerHTML = (\[[^\]]+\])\.map/)![1]);
  const moduleUrl = "data:text/javascript;base64," + Buffer.from(await Bun.file(`${root}/review-fixtures/painted-art.js`).text()).toString("base64");
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: request => previewResponse(request, `${root}/review-dist`),
  });
  const phone = await session.open();
  try {
    await phone.view.navigate(`http://127.0.0.1:${server.port}/?seed=7`);
    await phone.evaluate(`new Promise((resolve, reject) => {
      const deadline = performance.now() + 30000;
      function ready() {
        if (window.castleSample && !document.querySelector("#start").disabled) resolve(true);
        else if (performance.now() > deadline) reject(new Error("Frame probe did not reach the ready title"));
        else requestAnimationFrame(ready);
      } ready();
    })`);
    const frames = await phone.evaluate(`(async () => {
      const { PaintedArt } = await import(${JSON.stringify(moduleUrl)});
      (function(Phaser, LAYER) { ${gaugeClass} })(Phaser, { bars: 1 });
      const gauges = ["hp-base","hp-chief","hp-general-boss","revive-progress","hp-soldier"];
      const tree = ["owned","available","locked","selected"].map(s => "tree-ownership-state-" + s);
      const slugs = [...gauges.flatMap(s => [s+"-frame",s+"-fill"]), ...tree,
        "purchase-ready-border-bright","purchase-ready-border-dim","reward-selection-frame",
        "wall-hit-flash","coin-hud-highlight"];
      const images = new Map();
      for (const slug of slugs) {
        const image = new Image(); image.src = "/art/icons/" + slug + ".webp";
        await image.decode(); images.set("painted:" + slug,image);
      }
      const art = new PaintedArt({ textures: { get: key => ({ getSourceImage: () => images.get(key) }) } });
      art.prepare(slugs);
      const rgba = image => {
        const c=document.createElement("canvas"); c.width=32; c.height=32;
        const ctx=c.getContext("2d"); ctx.drawImage(image,0,0);
        return ctx.getImageData(0,0,32,32).data;
      };
      const ready = document.querySelector("#result-upgrade"); ready.classList.add("ready");
      document.querySelector("#result").hidden=false;
      const arrow=ready.querySelector('img[data-icon="up"]');
      await arrow.decode();
      await Promise.all(document.querySelector("#result").getAnimations({subtree:true})
        .filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished));
      const buttonRect=ready.getBoundingClientRect(),arrowRect=arrow.getBoundingClientRect();
      const arrowFit={
        native:arrowRect.width===arrow.naturalWidth&&arrowRect.height===arrow.naturalHeight,
        visible:arrowRect.width>=16&&arrowRect.height>=16,
        clear:arrowRect.left>=buttonRect.left+8&&arrowRect.right<=buttonRect.right-8&&
          arrowRect.top>=buttonRect.top+13&&arrowRect.bottom<=buttonRect.bottom-12,
      };
      document.querySelector("#result").hidden=true;
      const reel = document.querySelector("#strip");
      // 30359836 took the striped purchase frame off the result button; ready cards still wear it.
      const card = document.createElement("button"); card.className="card upgrade ready";
      const node = document.createElement("button"); node.className="tree-node";
      node.setAttribute("aria-pressed","true"); document.querySelector("#app").append(node, card);
      const slices = {
        purchase: getComputedStyle(card,"::before").borderImageSlice,
        resultButton: getComputedStyle(ready,"::before").content,
        reward: getComputedStyle(reel,"::before").borderImageSlice,
        tree: getComputedStyle(node,"::before").borderImageSlice,
        selectedTree: getComputedStyle(node,"::after").borderImageSlice,
        rewardBox: getComputedStyle(reel,"::before").boxSizing,
      };
      const center = (slug, cuts) => {
        const d=rgba(images.get("painted:"+slug)); let count=0;
        for(let y=cuts[0];y<32-cuts[2];y++) for(let x=cuts[3];x<32-cuts[1];x++)
          if(d[(y*32+x)*4+3]) count++;
        return { slug, count };
      };
      const centers = [
        ...["bright","dim"].map(s=>center("purchase-ready-border-"+s,[13,8,12,8])),
        center("reward-selection-frame",[12,8,8,8]),
        ...tree.map(s=>center(s,[11,8,8,11])),
      ];
      const canvas=document.createElement("canvas"); canvas.width=140; canvas.height=220;
      const ctx=canvas.getContext("2d");
      const graphics={
        fillStyle(color,alpha) { ctx.fillStyle="#"+color.toString(16).padStart(6,"0");ctx.globalAlpha=alpha;return this; },
        fillRect(x,y,w,h) { ctx.fillRect(x,y,w,h);return this; },
      };
      // The native gauge now caches textures and displays cropped Images.
      // Exercise those operations with Phaser's real managers and renderer.
      const gaugeGame = await new Promise(resolve => {
        const game = new Phaser.Game({
          type: Phaser.CANVAS, width: canvas.width, height: canvas.height,
          canvas, parent: document.createElement("div"), transparent: true,
          banner: false, audio: { noAudio: true },
          scene: { create() {
            const probe = new NativeGauge();
            probe.painted = art; probe.textures = this.textures; probe.add = this.add;
            probe.gaugeImages = []; probe.gaugeCount = 0;
            for (const [n, slug] of gauges.entries()) probe.gauge(slug, 10, 20 + n * 35, 30, .5);
            this.game.events.once("postrender", () => { this.game.loop.sleep(); resolve(this.game); });
          } },
        });
      });
      const gaugePixels=[];
      for(const [n,slug] of gauges.entries()) {
        const top=20+n*35;
        const original=rgba(images.get("painted:"+slug+"-frame"));
        const actual=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let missing=0,opaque=0;
        for(let y=0;y<32;y++) for(let x=0;x<32;x++) if(original[(y*32+x)*4+3]) {
          opaque++;if(!actual[((top+y-10)*canvas.width+10+x-1)*4+3])missing++;
        }
        gaugePixels.push({slug,opaque,missing});
      }
      gaugeGame.destroy(true);
      const nine = (slug, options) => {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        art.draw(graphics,slug,10,20,options);
        const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let middle=0,bottom=0;
        for(let y=options.insets.top;y<options.height-options.insets.bottom;y++)
          for(let x=options.insets.left;x<options.width-options.insets.right;x++)
            if(data[((20+y)*canvas.width+10+x)*4+3])middle++;
        for(let y=options.height-options.insets.bottom;y<options.height;y++)
          for(let x=0;x<options.width;x++)if(data[((20+y)*canvas.width+10+x)*4+3])bottom++;
        return {slug,middle,bottom};
      };
      node.remove(); card.remove();
      reel.innerHTML=${JSON.stringify(offsets)}.map(n=>'<span class="cell'+(n?'':' on')+'"><i class="pic card-illustration"></i></span>').join("");
      reel.style.cssText="display:flex!important;animation:none!important;transform:translateX(-50%) scale(1.12)!important";
      return {slices,centers,gaugePixels,arrowFit,
        wall:nine("wall-hit-flash",${JSON.stringify(wallOptions)}),
        coin:nine("coin-hud-highlight",${JSON.stringify(coinOptions)})};
    })()`) as {
      slices: Record<string,string>; centers: {slug:string;count:number}[];
      gaugePixels: {slug:string;opaque:number;missing:number}[];
      arrowFit: {native:boolean;visible:boolean;clear:boolean};
      wall: {middle:number;bottom:number}; coin: {middle:number;bottom:number};
    };
    expect(frames.slices).toEqual({
      purchase: "13 8 12 fill", resultButton: "none", reward: "12 8 8 fill", tree: "11 8 8 11 fill",
      selectedTree: "11 8 8 11 fill", rewardBox: "border-box",
    });
    for (const frame of frames.centers) expect({slug:frame.slug,count:frame.count}).toEqual({slug:frame.slug,count:0});
    for (const gauge of frames.gaugePixels) {
      expect(gauge.opaque).toBeGreaterThan(0);
      expect({slug:gauge.slug,missing:gauge.missing}).toEqual({slug:gauge.slug,missing:0});
    }
    expect(frames.arrowFit).toEqual({native:true,visible:true,clear:true});
    if (process.env.CASTLE_FRAME_SCREENSHOT) {
      await phone.evaluate(`document.querySelector("#result").hidden=false`);
      await Bun.write(process.env.CASTLE_FRAME_SCREENSHOT,
        await phone.view.screenshot({format:"png",encoding:"buffer"}));
      await phone.evaluate(`document.querySelector("#result").hidden=true`);
    }
    expect(frames.wall.middle).toBe(0); expect(frames.wall.bottom).toBeGreaterThan(0);
    expect(frames.coin.middle).toBe(0); expect(frames.coin.bottom).toBeGreaterThan(0);
    const viewports = [];
    for (const width of [390, 412, 900]) {
      await phone.view.cdp("Emulation.setDeviceMetricsOverride", {
        width, height:844, deviceScaleFactor:1, mobile:width<480,
      });
      const measure = await phone.evaluate(`(() => {
        const reel=document.querySelector("#strip"),r=reel.getBoundingClientRect();
        const cells=[...reel.children],visible=cells.filter(c=>c.getClientRects().length);
        return {width:innerWidth,model:cells.length,visible:visible.length,
          fit:r.left>=0&&r.right<=innerWidth,native:visible.every(c=>c.offsetWidth===80),
          selected:cells[2].classList.contains("on")&&cells[2].getClientRects().length>0};
      })()`);
      expect(measure).toEqual({width,model:5,visible:width<480?3:5,fit:true,native:true,selected:true});
      viewports.push(measure);
    }
    expect(phone.errors).toEqual([]);
    if (process.env.CASTLE_FRAME_EVIDENCE)
      await Bun.write(process.env.CASTLE_FRAME_EVIDENCE, JSON.stringify({frames,viewports,errors:phone.errors},null,2));
  } finally {
    await session.reset();server.stop(true);
  }
});
