import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
function scripts(dir: string): string {
  return readdirSync(join(dir, "assets")).filter(name => name.endsWith(".js"))
    .map(name => readFileSync(join(dir, "assets", name), "utf8")).join("\n");
}
async function build(flags: Record<string, string>): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "castle-sandbox-build-"));
  const env = { ...process.env, CASTLE_CODEX_PREVIEW: "", CASTLE_SANDBOX_PREVIEW: "", ...flags };
  const child = Bun.spawn(["bun", "--bun", "vite", "build", "--outDir", out, "--emptyOutDir"], { cwd: root, env, stdout: "pipe", stderr: "pipe" });
  const [code, log] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (code !== 0) throw new Error(`vite build failed (${code}): ${log}`);
  try { return scripts(out); } finally { rmSync(out, { recursive: true, force: true }); }
}

test("the ?sandbox=1 bench ships only in preview builds", async () => {
  const [product, preview, codexPreview] = await Promise.all([
    build({}), build({ CASTLE_SANDBOX_PREVIEW: "1" }), build({ CASTLE_CODEX_PREVIEW: "1" })]);
  for (const marker of ["sbx-toggle", "mountSandbox", "\"sandbox\""]) expect(product).not.toContain(marker);
  expect(preview).toContain("sbx-toggle");
  expect(codexPreview).toContain("sbx-toggle");
}, 300_000);
