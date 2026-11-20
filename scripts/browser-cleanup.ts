import { rm } from "node:fs/promises";

/**
 * Bun keeps one Chrome per test process on the first view's profile, and view.close() only closes the tab,
 * so removing the profile right away races the live browser still writing it (ENOENT, or a recreated folder).
 * End that Chrome, wait for the kernel's exit notice (caffeinate -w), then remove the profile.
 */
export async function closeBrowser(view: { close(): void } | undefined, profile: string): Promise<void> {
  const ps = Bun.spawn(["/bin/ps", "-axww", "-o", "pid=,command="], { stdout: "pipe", stderr: "pipe" });
  const rows = await new Response(ps.stdout).text();
  if (await ps.exited !== 0) throw new Error("Could not list browser processes");
  const pids = rows.split("\n").flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    return match && match[2].includes(`--user-data-dir=${profile}`) ? [match[1]] : [];
  });
  view?.close();
  (Bun as unknown as { WebView: { closeAll(): void } }).WebView.closeAll();
  const waits = await Promise.all(pids.map(pid => Bun.spawn(["/usr/bin/caffeinate", "-w", pid]).exited));
  if (waits.some(code => code !== 0)) throw new Error(`Could not wait for browser exit: ${pids}`);
  await rm(profile, { recursive: true });
  console.log("BROWSER_PROFILE_RELEASED", JSON.stringify({ profile, exited: pids }));
}
