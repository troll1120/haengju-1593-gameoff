import { resolve } from "node:path";
export async function previewResponse(request: Request, root: string, key = ""): Promise<Response> {
  const path = decodeURIComponent(new URL(request.url).pathname);
  const headers = new Headers({ "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers });
  const prefix = `/play/${key}/`, linkAccess = key !== "" && path.startsWith(prefix);
  const cookieAccess = request.headers.get("cookie")?.split(";").some(cookie => cookie.trim() === `castle_preview=${key}`);
  if (key && !linkAccess && !cookieAccess) return new Response("Not found", { status: 404, headers });
  if (path.split("/").includes("..")) return new Response("Not found", { status: 404, headers });
  if (linkAccess) headers.set("Set-Cookie", `castle_preview=${key}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
  const relative = linkAccess ? path.slice(prefix.length) : path.slice(1);
  const file = Bun.file(`${root}/${relative || "index.html"}`);
  if (!await file.exists()) return new Response("Not found", { status: 404, headers });
  return new Response(file, { headers });
}
if (import.meta.main) {
  const reviewing = Bun.env["CASTLE_REVIEW"] === "1";
  const root = resolve(import.meta.dir, reviewing ? "../review-dist" : "../dist");
  const port = Number(Bun.env["CASTLE_PORT"] ?? (reviewing ? 19498 : 19496));
  Bun.serve({ hostname: "127.0.0.1", port, fetch: request => previewResponse(request, root, Bun.env["CASTLE_PREVIEW_KEY"]) });
  console.log(`CASTLE_READY http://127.0.0.1:${port}`);
}
