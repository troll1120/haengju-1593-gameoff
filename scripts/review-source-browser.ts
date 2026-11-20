import { resolve } from "node:path";
import { createServer } from "vite";
import type { reviewBrowserSession } from "./review-browser";

export type ReviewStep = { eval: string } | { shot: string } | { tap: string } | { waitFor: string };

/** Serve the real source modules locally without a preview daemon or a second test process. */
export async function captureSourceReview(session: ReturnType<typeof reviewBrowserSession>, worktree: string,
  viewport: { width: number; height: number }, evidence: string, steps: readonly ReviewStep[]) {
  const server = await createServer({ root: worktree, server: { host: "127.0.0.1", port: 0, open: false } });
  try {
    await server.listen();
    const url = server.resolvedUrls?.local[0];
    if (!url) throw new Error("Missing preview server URL");
    const page = await session.open(viewport.width, viewport.height);
    const ready = (condition: string) => page.evaluate(`new Promise((resolve, reject) => {
      const deadline = performance.now() + 15000;
      function frame() {
        if (${condition}) requestAnimationFrame(() => resolve(true));
        else if (performance.now() > deadline) reject(new Error(${JSON.stringify(`Timed out: ${condition}`)}));
        else requestAnimationFrame(frame);
      } frame();
    })`).catch((error: unknown) => {
      throw new Error(`Preview condition failed: ${condition}\n${page.errors.join("\n")}`, { cause: error });
    });
    await page.view.navigate(new URL("?seed=7", url).href);
    await ready("Boolean(window.castleSample) && !document.querySelector('#start').disabled");
    for (const step of steps) {
      if ("eval" in step) await page.evaluate(step.eval);
      else if ("shot" in step) await page.shot(step.shot);
      else if ("waitFor" in step) await ready(step.waitFor);
      else if (!await page.tapElement(step.tap)) throw new Error(`Touch target not visible: ${step.tap}`);
    }
    await page.shot(resolve(evidence, "final.png"));
    return page.errors.slice();
  } finally {
    try { await session.reset(); } finally { await server.close(); }
  }
}
