import { afterAll, expect, test } from "bun:test";
import { resolve } from "node:path";
import { reviewBrowserSession, type Point } from "./review-browser";
import { previewResponse } from "./serve";

const session = reviewBrowserSession([]);
afterAll(() => session.close());

const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

for (const viewport of viewports) {
  test(`game surface blocks selection and media dragging but preserves fields and sliders at ${viewport.width}x${viewport.height}`, async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: request => previewResponse(request, resolve(import.meta.dir, "../review-dist")),
    });
    const page = await session.open(viewport.width, viewport.height);

    const drag = async (from: Point, to: Point): Promise<void> => {
      await page.view.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
      await page.view.cdp("Input.dispatchMouseEvent", {
        type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1,
      });
      await page.view.cdp("Input.dispatchMouseEvent", {
        type: "mouseMoved", x: to.x, y: to.y, button: "left", buttons: 1,
      });
      await page.view.cdp("Input.dispatchMouseEvent", {
        type: "mouseReleased", x: to.x, y: to.y, button: "left", buttons: 0, clickCount: 1,
      });
    };

    try {
      await page.view.cdp("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.width === 390,
      });
      await page.view.navigate(`http://127.0.0.1:${server.port}/`);
      await page.evaluate(`new Promise((resolve, reject) => {
        const deadline = performance.now() + 30000;
        function frame() {
          if (document.querySelector("#arena canvas") && !document.querySelector("#start").disabled) resolve(true);
          else if (performance.now() > deadline) reject(new Error("Game canvas did not mount"));
          else requestAnimationFrame(frame);
        }
        frame();
      })`);

      const logo = await page.rect(".logo strong");
      if (!logo) throw new Error("Title logo was not visible");
      await page.evaluate("window.getSelection()?.removeAllRanges()");
      await drag(
        { x: logo.x + 2, y: logo.y + logo.h / 2 },
        { x: logo.x + logo.w - 2, y: logo.y + logo.h / 2 },
      );

      expect(await page.evaluate("window.getSelection()?.toString() ?? ''")).toBe("");
      expect(await page.evaluate(`(() => {
        const logo = document.querySelector(".logo strong");
        const select = new Event("selectstart", { bubbles: true, cancelable: true });
        const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        logo.dispatchEvent(select);
        logo.dispatchEvent(menu);
        return {
          userSelect: getComputedStyle(document.querySelector("#app")).userSelect,
          selectBlocked: select.defaultPrevented,
          menuBlocked: menu.defaultPrevented,
          mediaDraggable: Array.from(document.querySelectorAll("#app img, #app canvas, #app svg"))
            .every(node => node.getAttribute("draggable") === "false"),
        };
      })()`)).toEqual({
        userSelect: "none",
        selectBlocked: true,
        menuBlocked: true,
        mediaDraggable: true,
      });

      await page.evaluate(`(() => {
        const field = document.createElement("textarea");
        field.id = "surface-feedback";
        field.value = "";
        document.querySelector("#app").append(field);
        field.focus();
      })()`);
      await page.view.cdp("Input.insertText", { text: "feedback works" });
      expect(await page.evaluate(`(() => {
        const field = document.querySelector("#surface-feedback");
        field.setSelectionRange(0, field.value.length);
        const select = new Event("selectstart", { bubbles: true, cancelable: true });
        const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        field.dispatchEvent(select);
        field.dispatchEvent(menu);
        return {
          value: field.value,
          selected: field.value.slice(field.selectionStart, field.selectionEnd),
          selectBlocked: select.defaultPrevented,
          menuBlocked: menu.defaultPrevented,
        };
      })()`)).toEqual({
        value: "feedback works",
        selected: "feedback works",
        selectBlocked: false,
        menuBlocked: false,
      });
      await page.evaluate("document.querySelector('#surface-feedback').remove()");
      expect(await page.evaluate(`(() => {
        const outer = document.createElement("div");
        outer.contentEditable = "true";
        const valid = document.createElement("span");
        valid.textContent = "editable";
        const blocked = document.createElement("span");
        blocked.contentEditable = "false";
        blocked.textContent = "blocked";
        outer.append(valid, blocked);
        const invalid = document.createElement("span");
        invalid.setAttribute("contenteditable", "invalid");
        invalid.textContent = "invalid";
        document.querySelector("#app").append(outer, invalid);
        const probe = node => {
          const events = [
            new DragEvent("dragstart", { bubbles: true, cancelable: true }),
            new Event("selectstart", { bubbles: true, cancelable: true }),
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
          ];
          for (const event of events) node.dispatchEvent(event);
          return events.map(event => event.defaultPrevented);
        };
        const result = { valid: probe(valid), blocked: probe(blocked), invalid: probe(invalid) };
        outer.remove();
        invalid.remove();
        return result;
      })()`)).toEqual({
        valid: [false, false, false],
        blocked: [true, true, true],
        invalid: [true, true, true],
      });

      expect(await page.tapElement("#title-settings")).toBe(true);
      const slider = await page.rect("#volume-bgm");
      if (!slider) throw new Error("Volume slider was not visible");
      const before = Number(await page.evaluate("document.querySelector('#volume-bgm').value"));
      await drag(
        { x: slider.x + slider.w - 4, y: slider.y + slider.h / 2 },
        { x: slider.x + 4, y: slider.y + slider.h / 2 },
      );
      const after = Number(await page.evaluate("document.querySelector('#volume-bgm').value"));
      expect(after).toBeLessThan(before);
      expect(page.errors).toEqual([]);
    } finally {
      await session.reset();
      server.stop(true);
    }
  }, 60_000);
}
