import { expect, mock, test } from "bun:test";
import { createAnalytics, trackBattle } from "./analytics";
import { feedbackTopic } from "./feedback-topics";

function browserFixture() {
  const gtag = mock((..._args: unknown[]) => {});
  const win = Object.assign(new EventTarget(), { gtag });
  const append = mock((_script: { async: boolean; src: string }) => {});
  const visibility: { visibilityState: DocumentVisibilityState } = { visibilityState: "visible" };
  const doc = Object.assign(new EventTarget(), visibility, {
    head: { append },
    createElement: (_tag: "script") => ({ async: false, src: "" }),
  });
  return { win, doc, gtag, append };
}

test("does not inject a script or call gtag when the measurement ID is empty", () => {
  const { win, doc, gtag, append } = browserFixture();
  expect(createAnalytics(" ", win, doc)).toBeUndefined();
  expect(append).not.toHaveBeenCalled();
  expect(gtag).not.toHaveBeenCalled();
});

test("loads gtag asynchronously and reports cumulative playtime across visibility changes and runs", () => {
  const { win, doc, gtag, append } = browserFixture();
  const track = createAnalytics("G-TEST123", win, doc);
  if (!track) throw new TypeError("Analytics should be enabled");
  const battle = trackBattle(track, win, doc, 30);

  battle.start("survival");
  battle.progress(29);
  battle.progress(30);
  battle.progress(62.8);
  battle.finish("army");
  track("upgrade_purchase", { node_id: "unit:attack", level: 2 });
  track("codex_open", { source: "title" });
  track("retry", { mode: "survival" });
  doc.dispatchEvent(new Event("visibilitychange"));
  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  win.dispatchEvent(new Event("pagehide"));
  doc.visibilityState = "visible";
  battle.start("survival");
  battle.progress(12.4);
  win.dispatchEvent(new Event("pagehide"));

  expect(append.mock.calls).toEqual([[{ async: true, src: "https://www.googletagmanager.com/gtag/js?id=G-TEST123" }]]);
  expect(gtag.mock.calls).toEqual([
    ["js", expect.any(Date)], ["set", { cookie_flags: "SameSite=None;Secure;Partitioned" }], ["config", "G-TEST123"],
    ["event", "game_start", { mode: "survival" }],
    ["event", "wave_reached", { wave: 1 }], ["event", "wave_reached", { wave: 2 }],
    ["event", "survival_minute", { minute: 1 }], ["event", "survive_1m", {}], ["event", "wave_reached", { wave: 3 }],
    ["event", "game_over", {
      survival_seconds: 62, wave: 3, minute_band: "m01", survival_band: "1to3", cause: "unknown", boss_kind: "unknown",
    }],
    ["event", "upgrade_purchase", { node_id: "unit:attack", level: 2 }],
    ["event", "codex_open", { source: "title" }],
    ["event", "retry", { mode: "survival" }],
    ["event", "session_end", { seconds_played: 62 }],
    ["event", "game_start", { mode: "survival" }],
    ["event", "wave_reached", { wave: 1 }],
    ["event", "session_end", { seconds_played: 75 }],
  ]);
});

test("sends only the classified topic and rating from the legacy feedback flow", () => {
  const { win, doc, gtag } = browserFixture();
  const track = createAnalytics("G-TEST123", win, doc);
  if (!track) throw new TypeError("Analytics should be enabled");
  const feedbackText = "조작 tester@example.invalid";
  const feedback = { feedback_topic: feedbackTopic(feedbackText), fun_rating: 5, feedback_text: feedbackText } as const;
  const invalid = { ...feedback };
  Object.defineProperty(invalid, "feedback_topic", { value: feedbackText });

  track("feedback_submit", invalid);
  track("feedback_submit", feedback);

  expect(gtag.mock.calls.filter(([command]) => command === "event")).toEqual([
    ["event", "feedback_submit", { feedback_topic: "controls", fun_rating: 5 }],
  ]);
});
