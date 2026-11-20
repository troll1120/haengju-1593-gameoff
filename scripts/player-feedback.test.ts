import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch } from "./review-browser";

const root = join(import.meta.dir, "..");
let fixture: ReturnType<typeof Bun.serve>;
let profiles: string;

beforeAll(async () => {
  const bundle = await Bun.build({
    entrypoints: [join(root, "src/player-feedback.ts")],
    target: "browser",
    plugins: [{
      name: "fixture-release-config",
      setup(build) {
        build.onLoad({ filter: /\/release-config\.ts$/ }, () => ({
          contents: `const flags = new URLSearchParams(location.search);
            export const GA_MEASUREMENT_ID = flags.has("measure") ? "G-FIXTURE" : "";
            export const FEEDBACK_URL = flags.has("external") ? "https://example.invalid/feedback?src=game#details" : "";
            export const FEEDBACK_BUILD = "fixture";
            export const FEEDBACK_FIRESTORE_PROJECT = "";`,
          loader: "js",
        }));
      },
    }],
  });
  const script = bundle.outputs.find(output => output.path.endsWith(".js"));
  const stylesheet = bundle.outputs.find(output => output.path.endsWith(".css"));
  if (!bundle.success || !script || !stylesheet) throw new Error("Feedback fixture did not build");
  const index = (await Bun.file(join(root, "index.html")).text())
    .replace("</head>", `<link rel="stylesheet" href="/style.css" /><link rel="stylesheet" href="/fixture.css" /></head>`)
    .replace('<script type="module" src="./src/bootstrap.ts"></script>', '<script type="module" src="/mount.js"></script>');
  profiles = await mkdtemp(join(tmpdir(), "castle-feedback-"));
  fixture = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      switch (path) {
        case "/":
          return new Response(index, { headers: {
            "content-type": "text/html", "content-security-policy": "script-src 'self'; connect-src 'self'",
          } });
        case "/style.css": return new Response(Bun.file(join(root, "src/style.css")), { headers: { "content-type": "text/css" } });
        case "/fixture.css": return new Response(stylesheet, { headers: { "content-type": "text/css" } });
        case "/feedback.js": return new Response(script, { headers: { "content-type": "text/javascript" } });
        case "/mount.js":
          return new Response(`
            window.events = [];
            window.gtag = (command, name, params) => { if (command === "event") events.push([name, params]); };
            if (new URLSearchParams(location.search).has("blocked"))
              Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Denied", "SecurityError"); } });
            else localStorage.clear();
            const { initPlayerFeedback, notifySurveyRunEnd } = await import("/feedback.js");
            initPlayerFeedback();
            document.querySelector("#app").className = "";
            document.querySelector("#title").hidden = true;
            window.finishRun = notifySurveyRunEnd;
          `, { headers: { "content-type": "text/javascript" } });
        default:
          return new Response(Bun.file(join(root, "public", path)));
      }
    },
  });
});

afterAll(async () => {
  await fixture?.stop(true);
  if (profiles) await rm(profiles, { recursive: true, force: true });
});

async function review(flags: string) {
  const page = await launch(`${fixture.url}?${flags}`, await mkdtemp(join(profiles, "chrome-")));
  await page.evaluate(`new Promise(resolve => {
    function ready() { if (window.finishRun) resolve(true); else requestAnimationFrame(ready); }
    ready();
  })`);
  return page;
}

test("third visible result opens once, and submitting drops all free text", async () => {
  const page = await review("measure&external");
  try {
    expect(await page.evaluate(`(() => {
      window.resultPanel = document.querySelector("#result");
      window.survey = document.querySelector("#survival-survey");
      window.form = document.querySelector("#survival-survey-form");
      const second = {};
      window.third = {};
      finishRun({}); finishRun(second); finishRun(second);
      resultPanel.hidden = false;
      return survey.hidden;
    })()`)).toBe(true);
    expect(await page.evaluate(`(async () => {
      resultPanel.hidden = true;
      finishRun(third); finishRun(third);
      await Promise.resolve();
      const beforeResult = events.length;
      resultPanel.hidden = false;
      await Promise.resolve();
      form.requestSubmit();
      const pristine = [...form.querySelectorAll("input:checked")].length;
      form.querySelector('[name=fun_rating][value="5"]').click();
      form.querySelector('[name=difficulty][value=right]').click();
      document.querySelector("#survival-survey-liked").value = "  ";
      document.querySelector("#survival-survey-disliked").value = "조작 tester@example.invalid +1 555-444-1212";
      const link = document.querySelector("#survey-feedback");
      let href, rel;
      link.addEventListener("click", event => {
        event.preventDefault();
        ({ href, rel } = event.currentTarget);
      }, { once: true });
      link.click();
      form.requestSubmit(); form.requestSubmit();
      document.querySelector("#survival-survey-close").click();
      const reset = [...form.querySelectorAll("textarea")].map(field => field.value);
      resultPanel.hidden = true; await Promise.resolve();
      resultPanel.hidden = false; finishRun(third); await Promise.resolve();
      finishRun({});
      return { beforeResult, pristine, reset, events, hidden: survey.hidden, href, rel,
        storage: { ...localStorage } };
    })()`)).toEqual({
      beforeResult: 0, pristine: 0, reset: ["", ""], events: [
        ["survey_show", {}],
        ["survey_submit", { fun_rating: 5, difficulty: "right", liked_topic: "none", disliked_topic: "controls" }],
      ], hidden: true, href: "https://example.invalid/feedback", rel: "noopener noreferrer",
      storage: { "haengju1593-survey-remainder": "1" },
    });
  } finally { page.view.close(); }
});

test("escape and leaving the result each dismiss once and discard the draft", async () => {
  const page = await review("measure");
  try {
    expect(await page.evaluate(`(async () => {
      const result = document.querySelector("#result"), close = document.querySelector("#survival-survey-close");
      const draft = document.querySelector("#survival-survey-liked");
      result.hidden = false;
      finishRun({}); finishRun({}); finishRun({});
      draft.value = "tester@example.invalid"; draft.focus();
      draft.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      const focus = document.activeElement.id;
      close.click();
      finishRun({}); finishRun({}); finishRun({});
      draft.value = "555-444-1212";
      result.hidden = true; await new Promise(resolve => setTimeout(resolve, 0));
      return { events, focus, draft: draft.value, linkHidden: document.querySelector("#survey-feedback").hidden };
    })()`)).toEqual({
      events: [["survey_show", {}], ["survey_dismiss", {}], ["survey_show", {}], ["survey_dismiss", {}]],
      focus: "retry", draft: "", linkHidden: true,
    });
  } finally { page.view.close(); }
});

test.each([["measure"], ["blocked"]])("existing dialog and retry remain usable (%s)", async flags => {
  const page = await review(flags);
  try {
    expect(await page.evaluate(`(() => {
      document.querySelector("#result").hidden = false;
      const retry = document.querySelector("#retry");
      let retries = 0;
      retry.onclick = () => { retries++; };
      finishRun({}); finishRun({}); finishRun({});
      const shown = !document.querySelector("#survival-survey").hidden;
      retry.click();
      document.querySelector("#result-feedback").click();
      const dialog = document.querySelector("#player-feedback");
      const text = document.querySelector("#player-feedback-text");
      const form = document.querySelector("#player-feedback-form");
      text.value = "combat tester@example.invalid 555-444-1212";
      form.querySelector('[name=fun_rating][value="3"]').click();
      form.requestSubmit(); form.requestSubmit();
      return { shown, retries, open: dialog.open, draft: text.value, events,
        keys: new URLSearchParams(location.search).has("blocked") ? [] : Object.keys(localStorage) };
    })()`)).toEqual({
      shown: true, retries: 1, open: true, draft: "",
      events: flags === "measure" ? [
        ["survey_show", {}], ["survey_dismiss", {}], ["feedback_submit", { fun_rating: 3, feedback_topic: "combat" }],
      ] : [],
      keys: flags === "measure" ? ["haengju1593-survey-remainder"] : [],
    });
  } finally { page.view.close(); }
});
