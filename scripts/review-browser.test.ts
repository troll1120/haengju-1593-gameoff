import { expect, test } from "bun:test";

// No Chrome is started: the native boundary owns an in-memory resource instead.
test("launch releases its owned view on each startup rejection and transfers it on success", async () => {
  const build = await Bun.build({
    entrypoints: [`${import.meta.dir}/review-browser.ts`], target: "bun",
    define: { Bun: "globalThis.__launcherTestRuntime" },
  });
  expect(build.success).toBe(true);
  const bundle = build.outputs[0];
  if (!bundle) throw new Error("Missing helper bundle");
  const subject: typeof import("./review-browser") = await import(
    `data:text/javascript;base64,${Buffer.from(await bundle.text()).toString("base64")}`);
  const failure = new Error("startup rejected");
  const profile = import.meta.dir;
  try {
    for (const [url, steps] of [["about:blank", [1, 2, 3, 4, 5, 0]],
      ["http://fixture.test/", [1, 2, 3, 4, 5, 6, 0]]] as const) for (const failAt of steps) {
      const active = new Set<object>();
      let step = 0;
      class TestView {
        constructor() { active.add(this); }
        async navigate() { if (++step === failAt) throw failure; }
        async cdp() { if (++step === failAt) throw failure; }
        addEventListener() { if (++step === failAt) throw failure; }
        close() { active.delete(this); }
      }
      Reflect.set(globalThis, "__launcherTestRuntime", { WebView: TestView });
      if (failAt === 0) {
        const page = await subject.launch(url, profile);
        expect(active.size).toBe(1);
        page.view.close();
      } else {
        const error = await subject.launch(url, profile).then(() => undefined, error => error);
        expect(error).toBe(failure);
      }
      expect(active.size).toBe(0);
    }
  } finally {
    Reflect.deleteProperty(globalThis, "__launcherTestRuntime");
  }
});
