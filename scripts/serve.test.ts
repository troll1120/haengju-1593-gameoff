import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { previewResponse } from "./serve";

const root = resolve(import.meta.dir, ".."), key = "preview-test-only";
test("private staging requires the capability link or its secure session cookie", async () => {
  expect((await previewResponse(new Request("https://preview.test/"), root, key)).status).toBe(404);
  expect((await previewResponse(new Request("https://preview.test/play/wrong/"), root, key)).status).toBe(404);
  const response = await previewResponse(new Request(`https://preview.test/play/${key}/`), root, key);
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=Lax");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(await response.text()).toContain("행주");
});
test("private staging serves absolute font URLs only to an authorized session", async () => {
  const url = "https://preview.test/public/fonts/DNFBitBitv2.otf";
  expect((await previewResponse(new Request(url), root, key)).status).toBe(404);
  const response = await previewResponse(new Request(url, { headers: { Cookie: `castle_preview=${key}` } }), root, key);
  expect(response.status).toBe(200);
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
});
