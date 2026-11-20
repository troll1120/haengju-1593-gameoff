// Headless phone for review play. Always spawns its own Chrome with a dedicated profile; it never attaches to a running browser.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** Existing entry flows acknowledge onboarding through its real visible control. */
export async function passFirstBattleGuide(page: Awaited<ReturnType<typeof launch>>): Promise<void> {
  if (!await page.evaluate("Boolean(document.querySelector('#first-battle-guide[open]'))")) return;
  if (!await page.tapElement("#first-guide-skip")) throw new Error("First battle guide skip is unreachable");
}
/** Fresh-account result flows acknowledge every commander the result earned through its visible control. */
export async function confirmFirstResultUnlock(page: Awaited<ReturnType<typeof launch>>): Promise<void> {
  await page.evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 30000;
    function frame() {
      if (document.querySelector("#result-unlock-modal[open]")) resolve(true);
      else if (performance.now() > deadline) reject(new Error("First commander unlock did not open"));
      else requestAnimationFrame(frame);
    } frame();
  })`);
  // Commanders unlock on their own milestones, so one result can step through several in place.
  const total = await page.evaluate(`(() => { const counter = document.querySelector("#result-unlock-counter");
    return counter.hidden ? 1 : Number(counter.textContent.split("/")[1]); })()`);
  if (typeof total !== "number" || !Number.isInteger(total) || total < 1) throw new Error("Unlock counter is unreadable");
  for (let step = 1; step <= total; step++) {
    if (!await page.tapElement("#result-unlock-modal button")) throw new Error("Unlock confirmation is unreachable");
    if (step < total && await page.evaluate("document.querySelector('#result-unlock-counter').textContent") !== `${step + 1}/${total}`)
      throw new Error(`Unlock ${step + 1}/${total} did not follow`);
  }
  if (await page.evaluate("Boolean(document.querySelector('#result-unlock-modal[open]'))"))
    throw new Error("First commander unlock did not close");
}
export type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type View = {
  navigate(url: string): Promise<void>; evaluate(script: string): Promise<unknown>; close(): void;
  resize(width: number, height: number): Promise<void>;
  cdp(method: string, params?: Record<string, unknown>): Promise<unknown>;
  screenshot(options: { format: "png"; encoding: "buffer" }): Promise<Uint8Array>;
  addEventListener(type: string, listener: (event: { data?: { exceptionDetails?: { text?: string; exception?: { description?: string } } } }) => void): void;
};
const webViewClass = () => (Bun as unknown as { WebView: {
  new (options: Record<string, unknown>): View;
  closeAll(): void;
} }).WebView;

export async function launch(url: string, profile: string, width = 390, height = 844, browserArgs: readonly string[] = []) {
  await mkdir(profile, { recursive: true });
  const errors: string[] = [];
  const WebView = webViewClass();
  const view = new WebView({
    width, height,
    // Headless BeginFrame limiting can deliver 200ms RAF gaps even when rendering takes only a few ms.
    backend: { type: "chrome", url: false, argv: ["--headless=new", "--hide-scrollbars", "--mute-audio", "--disable-frame-rate-limit", "--disable-component-extensions-with-background-pages", "--disable-features=PreloadTopChromeWebUI", ...browserArgs] },
    dataStore: { directory: profile },
    console: (type: string, ...args: unknown[]) => {
      if (type === "error" || type === "warn" || type === "warning")
        errors.push(`${type}: ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}`.slice(0, 500));
    },
  });
  try {
    await view.navigate("about:blank");
    await view.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
    await view.cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await view.cdp("Runtime.enable");
    view.addEventListener("Runtime.exceptionThrown", event => {
      const details = event.data?.exceptionDetails;
      errors.push(`exception: ${details?.exception?.description ?? details?.text ?? "unknown"}`.slice(0, 600));
    });
    if (url !== "about:blank") await view.navigate(url);
  } catch (error) {
    view.close();
    throw error;
  }

  const touch = (type: string, point?: Point) => view.cdp("Input.dispatchTouchEvent", {
    type, touchPoints: point ? [{ x: Math.round(point.x), y: Math.round(point.y), id: 1, radiusX: 8, radiusY: 8, force: 1 }] : [],
  });
  async function tap(point: Point, hold = 40): Promise<void> {
    await touch("touchStart", point); await sleep(hold); await touch("touchEnd");
  }
  async function drag(from: Point, to: Point, steps = 6, ms = 140): Promise<void> {
    await touch("touchStart", from);
    for (let i = 1; i <= steps; i++) {
      await sleep(ms / steps);
      await touch("touchMove", { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps });
    }
    await sleep(20); await touch("touchEnd");
  }
  async function rect(selector: string): Promise<Box | null> {
    return await view.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null;
      return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`) as Box | null;
  }
  async function tapElement(selector: string): Promise<boolean> {
    await view.evaluate(`(async () => {
      const animations = [];
      for (let node = document.querySelector(${JSON.stringify(selector)}); node; node = node.parentElement)
        animations.push(...node.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity));
      await Promise.all(animations.map(a => a.finished));
    })()`);
    const box = await rect(selector);
    if (!box) return false;
    await tap({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
    return true;
  }
  async function fieldMapper(fieldWidth: number, fieldHeight: number): Promise<(p: Point) => Point> {
    const box = await rect("#arena canvas");
    if (!box) throw new Error("canvas not found");
    return p => ({ x: box.x + p.x / fieldWidth * box.w, y: box.y + p.y / fieldHeight * box.h });
  }
  async function shot(path: string): Promise<void> {
    await Bun.write(path, await view.screenshot({ format: "png", encoding: "buffer" }));
  }
  return { view, errors, tap, drag, rect, tapElement, fieldMapper, shot, evaluate: (script: string) => view.evaluate(script) };
}

/** One Chrome profile and page for one test file or capture script. */
export function reviewBrowserSession(browserArgs: readonly string[] = ["--single-process", "--no-zygote", "--disable-gpu"]) {
  let profile: string | undefined, page: Awaited<ReturnType<typeof launch>> | undefined;
  return {
    async open(width = 390, height = 844) {
      if (!page) {
        profile = await mkdtemp(`${tmpdir()}/castle-review-file-`);
        page = await launch("about:blank", profile, width, height, browserArgs);
      } else {
        await page.view.resize(width, height);
        await page.view.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
        // A reused page keeps CDP media overrides, so each case restarts from a fresh launch's media.
        await page.view.cdp("Emulation.setEmulatedMedia", { media: "", features: [] });
        page.errors.length = 0;
      }
      console.log("REVIEW_BROWSER_CASE_OPEN", JSON.stringify({ profile, width, height }));
      return page;
    },
    async reset() {
      if (!page) return;
      await page.view.navigate("about:blank");
      const response = await page.view.cdp("Target.getTargets");
      if (typeof response !== "object" || response === null || !("targetInfos" in response)
        || !Array.isArray(response.targetInfos)) throw new Error("Missing browser target inventory");
      const targets = response.targetInfos.map((value: unknown) => {
        if (typeof value !== "object" || value === null || !("targetId" in value) || typeof value.targetId !== "string"
          || !("type" in value) || typeof value.type !== "string" || !("url" in value) || typeof value.url !== "string")
          throw new Error("Invalid browser target inventory");
        return { id: value.targetId, type: value.type, url: value.url };
      });
      const pages = targets.filter(target => target.type === "page");
      if (pages.length !== 1 || pages[0].url !== "about:blank")
        throw new Error(`Previous browser pages remain: ${JSON.stringify(targets)}`);
      console.log("REVIEW_BROWSER_TARGETS", JSON.stringify(targets));
    },
    async close() {
      if (!profile) return;
      const ps = Bun.spawn(["/bin/ps", "-axww", "-o", "pid=,command="], {
        env: process.env, stdin: "ignore", stdout: "pipe", stderr: "pipe",
      });
      const rows = await new Response(ps.stdout).text();
      if (await ps.exited !== 0) throw new Error("Could not inspect owned browser processes");
      const owned = new Set(rows.split("\n").flatMap(line => {
        const match = line.trim().match(/^(\d+)\s+(.*)$/);
        return match && match[2].includes(`--user-data-dir=${profile}`) ? [Number(match[1])] : [];
      }));
      const pids = [...owned];
      page?.view.close();
      webViewClass().closeAll();
      await new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + 5000;
        const exited = () => {
          for (const pid of owned) {
            try { process.kill(pid, 0); }
            catch (error) {
              if (error instanceof Error && "code" in error && error.code === "ESRCH") owned.delete(pid);
              else { reject(error); return; }
            }
          }
          if (!owned.size) { resolve(); return; }
          if (performance.now() > deadline) { reject(new Error(`Browser processes did not exit: ${[...owned]}`)); return; }
          setImmediate(exited);
        };
        exited();
      });
      await rm(profile, { recursive: true, force: true });
      console.log("REVIEW_BROWSER_PROFILE_RELEASED", JSON.stringify({ profile, exited: pids }));
    },
  };
}
