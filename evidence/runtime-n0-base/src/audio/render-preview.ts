// Run on the Mac mini: bun src/audio/render-preview.ts [destination.wav].
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachPreview } from "./preview-cdp";

const destination = process.argv[2] ?? "review/stage4-fable/audio/preview.wav";
const kind = process.argv[3] ?? "all";
const bundle = await Bun.build({
  entrypoints: [new URL("./preview-browser.ts", import.meta.url).pathname],
  target: "browser", minify: true,
});
if (!bundle.success) throw new AggregateError(bundle.logs, "Preview bundle failed");
const script = await bundle.outputs[0].text();
const profile = await mkdtemp(join(tmpdir(), "haengju-audio-"));
const saved = Promise.withResolvers<void>();
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/preview.js") return new Response(script, { headers: { "content-type": "text/javascript" } });
    if (path === "/preview.wav" && request.method === "POST") {
      const data = await request.arrayBuffer();
      await Bun.write(destination, data);
      console.log(`WAV_SAVED ${destination} ${data.byteLength} bytes`);
      console.log(`AUDIO_METRICS ${request.headers.get("x-audio-metrics")}`);
      saved.resolve();
      return new Response("saved");
    }
    return new Response('<body>Rendering...</body><script type="module" src="/preview.js"></script>',
      { headers: { "content-type": "text/html" } });
  },
});
const browser = Bun.spawn([
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "--headless", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`,
  "--disable-background-networking", "--disable-extensions", "--disable-gpu", "--remote-debugging-port=0",
  "--password-store=basic", "--use-mock-keychain",
  `http://127.0.0.1:${server.port}/?kind=${kind}`,
], { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "inherit" });
let timeout: ReturnType<typeof setTimeout> | undefined;
try {
  await Promise.race([
    saved.promise,
    browser.exited.then(code => { throw new Error(`Chrome exited before render: ${code}`); }),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Render exceeded 90s")), 90000);
    }),
  ]);
  const page = await attachPreview(profile);
  try {
    console.log(await page.evaluate('import("/preview.js").then(m => m.prepareGestureCheck())'));
    await page.command("Input.dispatchMouseEvent", { type: "mousePressed", x: 20, y: 20, button: "left", clickCount: 1 });
    await page.command("Input.dispatchMouseEvent", { type: "mouseReleased", x: 20, y: 20, button: "left", clickCount: 1 });
    console.log(await page.evaluate('import("/preview.js").then(m => m.verifyGestureCheck())'));
  } finally {
    page.close();
  }
} finally {
  clearTimeout(timeout);
  browser.kill();
  await browser.exited;
  server.stop(true);
  await rm(profile, { recursive: true, force: true });
}
