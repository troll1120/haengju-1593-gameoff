import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { passFirstBattleGuide, reviewBrowserSession } from "./review-browser";
import { previewResponse } from "./serve";

test("a fresh battle shows the unlock condition only after a locked slot is tapped", async () => {
  const root = resolve(process.env.GENERAL_HINT_BUILD ?? "dist");
  const capture = process.env.GENERAL_HINT_CAPTURE;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => previewResponse(request, root) });
  const session = reviewBrowserSession();
  try {
    const phone = await session.open(390, 844);
    const url = `http://127.0.0.1:${server.port}/?seed=144`;
    await phone.view.navigate(url);
    await phone.evaluate(`localStorage.setItem("haengju1593-lang", "ko")`);
    await phone.view.navigate(url);
    const ready = (condition: string, timeout = 15000) => phone.evaluate(`new Promise((resolve, reject) => {
      const deadline = performance.now() + ${timeout};
      function frame() {
        if (${condition}) resolve(true);
        else if (performance.now() >= deadline) reject(new Error(${JSON.stringify(condition)}));
        else requestAnimationFrame(frame);
      }
      frame();
    })`);
    await ready("window.castleSample && !document.querySelector('#start').disabled");
    expect(await phone.tapElement("#start")).toBe(true);
    await ready("document.querySelector('[data-bph-start]')");
    expect(await phone.tapElement("[data-bph-start]")).toBe(true);
    await ready("castleSample.snapshot().phase === 'playing' && !castleSample.snapshot().attract");
    await passFirstBattleGuide(phone);

    const slot = '[data-hire-slot="0"][data-hire-status="locked"]';
    const slotVisible = `document.querySelector(${JSON.stringify(slot)})?.getBoundingClientRect().width > 0`;
    const hintVisible = `document.querySelector('.bph-hire-hint')?.getBoundingClientRect().width > 0`;
    await ready(slotVisible);
    if (capture) {
      await phone.evaluate("document.fonts.ready");
      await phone.shot(`${capture}-initial.png`);
    }
    expect(await phone.evaluate(hintVisible)).toBe(false);

    expect(await phone.tapElement(slot)).toBe(true);
    expect(await phone.evaluate(hintVisible)).toBe(true);
    expect(await phone.evaluate("document.querySelector('.bph-hire-hint').textContent")).toBe("전투 1판 완료 (0/1)");
    if (capture) await phone.shot(`${capture}-tapped.png`);
    await ready(`!(${hintVisible})`, 3200);
    if (capture) await phone.shot(`${capture}-auto-hidden.png`);

    expect(await phone.tapElement(slot)).toBe(true);
    expect(await phone.evaluate(hintVisible)).toBe(true);
    expect(await phone.tapElement("#arena canvas")).toBe(true);
    expect(await phone.evaluate(hintVisible)).toBe(false);

    expect(await phone.tapElement(slot)).toBe(true);
    expect(await phone.evaluate(hintVisible)).toBe(true);
    expect(await phone.tapElement(slot)).toBe(true);
    expect(await phone.evaluate(hintVisible)).toBe(false);
    expect(phone.errors).toEqual([]);
  } finally {
    server.stop(true);
    await session.close();
  }
}, 45000);
