import { afterAll, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { reviewBrowserSession } from "./review-browser";
import { captureSourceReview } from "./review-source-browser";

const session = reviewBrowserSession();
afterAll(() => session.close());

test.each([[390, 844], [320, 640]])("the title frame and upgrade wallet fit at %dx%d", async (width, height) => {
  const worktree = process.env.CASTLE_MASTERY_WORKTREE ?? resolve(import.meta.dir, "..");
  const evidence = resolve(process.env.CASTLE_MASTERY_EVIDENCE ?? resolve(worktree, "evidence/mastery-wallet"), `${width}x${height}`);
  await mkdir(evidence, { recursive: true });
  expect(await captureSourceReview(session, worktree, { width, height }, evidence, [
    { eval: `(() => {
      const buttons = [...document.querySelectorAll(".title-menu > button")];
      if (buttons.length !== 5 || !document.querySelector(".title-menu > #codex-open") ||
        buttons.some(button => !button.classList.contains("tile-frame")))
        throw new Error("All five title buttons, codex included, must share the mastery frame");
      window.masteryFrameSource = getComputedStyle(buttons[0]).borderImageSource;
      if (window.masteryFrameSource === "none" || buttons.some(button =>
        getComputedStyle(button).borderImageSource !== window.masteryFrameSource))
        throw new Error("Title frame missing");
      const ready = document.querySelector("#barracks-open");
      ready.classList.add("ready");
      const badge = ready.querySelector(".rise");
      if (getComputedStyle(badge).position !== "absolute" || getComputedStyle(badge).display === "none" ||
        getComputedStyle(ready).borderImageSource !== window.masteryFrameSource)
        throw new Error("Ready badge or shared frame missing");
    })()` },
    { shot: resolve(evidence, "title.png") },
    { tap: "#barracks-open" },
    { waitFor: "document.querySelector('[data-prep-group=\"shared\"]')" },
    { eval: `(() => {
      const wallet = document.querySelector(".bph-web-wallet"), icon = wallet.querySelector("img");
      if (wallet.children.length !== 2 || wallet.querySelectorAll("img").length !== 1 ||
        icon.getAttribute("src") !== "./art/icons/star-mastery.webp")
        throw new Error("Only the upgrade-point icon and balance may remain");
      if (wallet.scrollWidth > wallet.clientWidth) throw new Error("Upgrade wallet is clipped");
    })()` },
  ])).toEqual([]);
}, 120_000);
