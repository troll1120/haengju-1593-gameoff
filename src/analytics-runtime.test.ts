import { expect, mock, test } from "bun:test";
import { createAnalytics, createAnalyticsLifecycle, trackBattle, trackUpgradePurchases } from "./analytics";
import type { SurveyResponse } from "./analytics";

function setup() {
  const gtag = mock((..._args: unknown[]) => {});
  const win = Object.assign(new EventTarget(), { gtag });
  const visibility: { visibilityState: DocumentVisibilityState } = { visibilityState: "visible" };
  const doc = Object.assign(new EventTarget(), visibility, {
    head: { append: (_script: { async: boolean; src: string }) => {} },
    createElement: (_tag: "script") => ({ async: false, src: "" }),
  });
  const track = createAnalytics("G-TEST123", win, doc);
  if (!track) throw new TypeError("Missing mock analytics");
  return {
    track, win, doc,
    events: (...names: readonly string[]) => gtag.mock.calls
      .filter(([kind, name]) => kind === "event" && (names.length === 0 || names.some(key => key === name)))
      .map(([, name, params]) => [name, params]),
  };
}

test("emits each crossed minute and milestone once before the first final result", () => {
  const { track, win, doc, events } = setup();
  const battle = trackBattle(track, win, doc, 30);
  const snapshot = { gold: 70, playerLevel: 4 };

  battle.start("survival");
  battle.progress(900, snapshot);
  battle.progress(900, snapshot);
  battle.finish({ outcome: "lost", cause: "teppo", bossKind: "midboss", gold: 72 });
  battle.finish({ outcome: "won" });
  battle.progress(960, snapshot);

  expect(events("survival_minute").map(([, params]) => params)).toEqual(
    Array.from({ length: 15 }, (_, index) => ({ minute: index + 1, gold: 70, player_level: 4 })),
  );
  expect(events("wave_reached").map(([, params]) => params)).toEqual(
    Array.from({ length: 31 }, (_, index) => ({ wave: index + 1 })),
  );
  expect(events("survive_1m", "survive_3m", "survive_5m", "survive_10m", "survive_15m", "game_over")).toEqual([
    ["survive_1m", {}], ["survive_3m", {}], ["survive_5m", {}], ["survive_10m", {}], ["survive_15m", {}],
    ["game_over", {
      survival_seconds: 900, wave: 31, minute_band: "m15_plus", survival_band: "15plus",
      cause: "teppo", boss_kind: "midboss", gold: 72,
    }],
  ]);
});

test("excludes endless runs and retries from public gameplay, and reports an explicit quit once", () => {
  const { track, win, doc, events } = setup();
  const battle = trackBattle(track, win, doc, 30);

  battle.start("endless");
  battle.progress(900);
  battle.finish({ outcome: "lost" });
  track("retry", { mode: "endless" });
  battle.start("survival");
  battle.progress(42.2);
  battle.quit();
  battle.quit();
  battle.finish({ outcome: "lost" });
  win.dispatchEvent(new Event("pagehide"));

  expect(events()).toEqual([
    ["game_start", { mode: "survival" }], ["wave_reached", { wave: 1 }], ["wave_reached", { wave: 2 }],
    ["run_quit", { survival_seconds: 42, minute_band: "m00", exit_kind: "quit_to_title" }],
    ["session_end", { seconds_played: 42 }],
  ]);
});

test("reports victory in the survival distribution at a bucket boundary without death fields", () => {
  const { track, win, doc, events } = setup();
  const battle = trackBattle(track, win, doc, 30);
  battle.start("survival");
  battle.progress(180);

  battle.finish({ outcome: "won", gold: 25 });

  expect(events("game_over")).toEqual([["game_over", {
    survival_seconds: 180, wave: 7, minute_band: "m03", survival_band: "3to5", gold: 25,
  }]]);
});

test("rejects unlisted survey values and strips surplus form fields before calling gtag", () => {
  const { track, events } = setup();
  const response: SurveyResponse = { fun_rating: 3, difficulty: "hard", liked_topic: "none", disliked_topic: "controls" };
  const extra = { ...response, feedback_text: "private@example.invalid" };
  // A dynamically loaded form can carry malformed values despite the declared callback type.
  const invalid = Object.assign({}, response);
  Object.defineProperty(invalid, "liked_topic", { value: "private@example.invalid" });

  track("survey_show", {});
  track("survey_submit", invalid);
  track("survey_submit", extra);

  expect(events()).toEqual([["survey_show", {}], ["survey_submit", response]]);
});

test("excludes hidden time from screen dwell and reopens the current screen on return", () => {
  const { track, win, doc, events } = setup();
  let clock = 0;
  const lifecycle = createAnalyticsLifecycle(track, { window: win, document: doc, now: () => clock });
  lifecycle.screen("codex");

  clock = 2500;
  lifecycle.screen("codex");
  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  clock = 52_500;
  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  clock = 53_750;
  lifecycle.screen("tree");

  expect(events("screen_dwell")).toEqual([
    ["screen_dwell", { screen_kind: "codex", dwell_seconds: 2.5 }],
    ["screen_dwell", { screen_kind: "codex", dwell_seconds: 1.25 }],
  ]);
});

test("samples a fresh visible battle window after pause without including the paused frame gap", () => {
  const { track, win, doc, events } = setup();
  const lifecycle = createAnalyticsLifecycle(track, { window: win, document: doc });
  lifecycle.frame(0, true, 800);
  lifecycle.frame(40, true, 800);
  lifecycle.frame(50, false, 800);

  for (let ms = 20_000; ms <= 30_000; ms += 20) lifecycle.frame(ms, true, 800);

  expect(events("performance_sample")).toEqual([
    ["performance_sample", { fps_band: "50plus", viewport_band: "medium" }],
  ]);
});

test("keeps the first load and input for the document even if their hooks repeat", () => {
  const { track, win, doc, events } = setup();
  const lifecycle = createAnalyticsLifecycle(track, { window: win, document: doc });

  lifecycle.gameLoad(400, "touch");
  lifecycle.gameLoad(1200, "pointer");
  lifecycle.firstInput("keyboard");
  lifecycle.firstInput("pointer");

  expect(events()).toEqual([
    ["game_load", { viewport_band: "narrow", input_kind: "touch" }],
    ["game_first_input", { input_kind: "keyboard" }],
  ]);
});

test("records a successful repeat purchase as another transaction with the previous stable key", () => {
  const { track, events } = setup();
  const purchased = trackUpgradePurchases(track);

  purchased({ nodeId: "unit:attack", level: 2, gold: 40 });
  purchased({ nodeId: "unit:attack", level: 3, gold: 12 });

  expect(events("upgrade_purchase")).toEqual([
    ["upgrade_purchase", {
      node_id: "unit:attack", level: 2, item_kind: "upgrade", item_key: "unit:attack",
      choice_kind: "purchase", pick_order: 1, gold: 40,
    }],
    ["upgrade_purchase", {
      node_id: "unit:attack", level: 3, item_kind: "upgrade", item_key: "unit:attack",
      choice_kind: "purchase", pick_order: 2, previous_node: "unit:attack", gold: 12,
    }],
  ]);
});
