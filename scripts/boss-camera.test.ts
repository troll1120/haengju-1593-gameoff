import { afterAll, expect, test } from "bun:test";
import { reviewBrowserSession } from "./review-browser";

const session = reviewBrowserSession(["--single-process", "--no-zygote", "--disable-gpu", "--disable-extensions", "--disable-breakpad"]);
afterAll(() => session.close());

test("boss camera accents settle in 400ms, preserve HUD and cancel for reduced motion", async () => {
  const script = await Bun.file(`${import.meta.dir}/../review-fixtures/boss-camera-probe.js`).text();
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch: request => new URL(request.url).pathname === "/probe.js" ? new Response(script, { headers: { "Content-Type": "application/javascript" } })
      : new Response('<!doctype html><html><body><script src="/probe.js"></script></body></html>', { headers: { "Content-Type": "text/html" } }) });
  const page = await session.open();
  try {
    await page.view.navigate(`http://127.0.0.1:${server.port}`);
    const result = await page.evaluate(`new Promise((resolve,reject)=>{
      const end=performance.now()+10000;
      requestAnimationFrame(function f(){if(window.cameraProbe)resolve(cameraProbe);
        else if(performance.now()>end)reject(new Error("Camera probe timed out"));
        else requestAnimationFrame(f);});
    })`);
    expect(result).toMatchObject({
      onset: { world: 1, hud: 1 }, peak: { world: 1.025, hud: 1, fixedPoint: { x: 14, y: 24 },
        centre: { y: 400 }, edgesCovered: true },
      hold: { world: 1.025 }, settling: { world: 1.0125 }, end: { world: 1 },
      active: { world: 1.025 }, reduced: { world: 1 }, reset: { world: 1 },
      visible: { worldOnMain: true, worldOnHud: false, hudOnMain: false, hudOnHud: true },
    });
    expect(await page.evaluate("cameraProbe.peak.centre.x")).toBeCloseTo(195, 5);
    expect(page.errors).toEqual([]);
  } finally {
    await session.reset();
    server.stop(true);
  }
}, 30000);
