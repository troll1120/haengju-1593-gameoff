import { expect, test } from "bun:test";
import { createAnalytics } from "./analytics";
import { createBphRun } from "./bph-session";
import { moveEnemy } from "./enemy-wall";
import { createGameAnalytics } from "./game-analytics";
import { CENTER, guardPoint } from "./geometry";
import { freshMeta } from "./meta";
import { advance, spawn } from "./rules";

function fixture() {
  const events: unknown[][] = [];
  const window = Object.assign(new EventTarget(), { gtag: (...args: unknown[]) => events.push(args) });
  const visibility: { readonly visibilityState: DocumentVisibilityState } = { visibilityState: "visible" };
  const document = Object.assign(new EventTarget(), {
    ...visibility,
    getElementById: () => null,
    head: { append: () => undefined },
    createElement: () => ({ async: false, src: "" }),
  });
  const track = createAnalytics("G-WIRING-FIXTURE", window, document);
  if (!track) throw new TypeError("Missing fixture tracker");
  const analytics = createGameAnalytics(track, {
    window: Object.assign(window, {
      innerWidth: 800, matchMedia: globalThis.matchMedia, performance,
    }),
    document,
    waveSeconds: 30,
  });
  return { analytics, payloads: (...names: string[]) => events
    .filter(([kind, name]) => kind === "event" && names.some(key => key === name))
    .map(([, name, payload]) => [name, payload]) };
}

test("a lethal combat step supplies the final minute snapshot and the actual attacker", () => {
  const { analytics, payloads } = fixture();
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  analytics.start(run);
  run.time = 59.99;
  run.gold = 13;
  run.squads = [];
  run.enemies = [];
  run.base = .1;
  run.walls.위 = 0;
  const attacker = spawn(run, false, false, undefined, false, "위");
  Object.assign(attacker, guardPoint(run.fort, "위", 10), { kind: "teppo" });
  moveEnemy(run, attacker, CENTER);
  expect(attacker.breach).toBe("위");
  advance(run, .05);

  analytics.progress(run);
  analytics.finish(run);
  analytics.finish(run);

  expect(payloads("survival_minute", "survive_1m", "game_over")).toEqual([
    ["survival_minute", { minute: 1, gold: 18, player_level: 1 }],
    ["survive_1m", {}],
    ["game_over", { survival_seconds: 60, wave: 3, minute_band: "m01", survival_band: "1to3", gold: 18, cause: "teppo", boss_kind: "regular" }],
  ]);
});

test("redrawing the same general hand does not increase the offer count", () => {
  const { analytics, payloads } = fixture();
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  analytics.start(run);
  run.time = 30;
  run.generalOffers = ["김시민", "곽재우"];

  analytics.offerGenerals(run);
  analytics.offerGenerals(run);

  expect(payloads("choice_observed")).toEqual([
    ["choice_observed", { item_kind: "general", item_key: "김시민", choice_kind: "offered", pick_order: 1, survival_seconds: 30 }],
    ["choice_observed", { item_kind: "general", item_key: "곽재우", choice_kind: "offered", pick_order: 2, survival_seconds: 30 }],
  ]);
});
