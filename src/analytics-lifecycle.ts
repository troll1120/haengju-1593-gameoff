import type { ChoiceObservation, InputKind, ScreenKind, SettingChange, Track, ViewportBand } from "./analytics-events";

function viewportBand(width: number): ViewportBand {
  return width < 600 ? "narrow" : width < 1024 ? "medium" : "wide";
}

type LifecycleHost = {
  readonly window: Pick<Window, "addEventListener">;
  readonly document: Pick<Document, "addEventListener" | "visibilityState">;
  readonly now?: () => number;
};

export function createAnalyticsLifecycle(track: Track, host: LifecycleHost) {
  const doc = host.document, now = host.now ?? (() => performance.now());
  let loaded = false, inputSeen = false, pageActive = true;
  let screen: ScreenKind | undefined, screenSince: number | undefined;
  let lastFrame: number | undefined, frameMs = 0, frameCount = 0;
  const visible = () => pageActive && doc.visibilityState === "visible";
  const closeScreen = () => {
    if (screen && screenSince !== undefined) {
      const dwell = (now() - screenSince) / 1000;
      if (dwell > 0) track("screen_dwell", { screen_kind: screen, dwell_seconds: dwell });
    }
    screenSince = undefined;
  };
  const resetFrames = () => {
    lastFrame = undefined;
    frameMs = frameCount = 0;
  };
  const syncVisibility = () => {
    if (visible()) {
      if (screen) screenSince ??= now();
    } else {
      closeScreen();
      resetFrames();
    }
  };
  doc.addEventListener("visibilitychange", syncVisibility);
  host.window.addEventListener("pagehide", () => {
    pageActive = false;
    syncVisibility();
  });
  host.window.addEventListener("pageshow", () => {
    pageActive = true;
    syncVisibility();
  });

  return {
    gameLoad(width: number, inputKind: Exclude<InputKind, "keyboard">): void {
      if (loaded) return;
      loaded = true;
      track("game_load", { viewport_band: viewportBand(width), input_kind: inputKind });
    },
    firstInput(inputKind: InputKind): void {
      if (inputSeen) return;
      inputSeen = true;
      track("game_first_input", { input_kind: inputKind });
    },
    tutorialStep(stepKind: "shown" | "completed" | "skipped"): void {
      track("tutorial_step", { step_kind: stepKind });
    },
    screen(next?: ScreenKind): void {
      if (screen === next) return;
      closeScreen();
      screen = next;
      if (screen && visible()) screenSince = now();
    },
    frame(timestampMs: number, activeBattle: boolean, width: number): void {
      if (!activeBattle || !visible()) {
        resetFrames();
        return;
      }
      const elapsed = lastFrame === undefined ? 0 : timestampMs - lastFrame;
      lastFrame = timestampMs;
      if (elapsed <= 0) return;
      frameMs += elapsed;
      ++frameCount;
      if (frameMs < 10_000) return;
      const fps = frameCount * 1000 / frameMs;
      track("performance_sample", {
        fps_band: fps < 20 ? "lt20" : fps < 30 ? "20to29" : fps < 50 ? "30to49" : "50plus",
        viewport_band: viewportBand(width),
      });
      frameMs = frameCount = 0;
    },
  };
}

export function trackChoice(track: Track, choice: ChoiceObservation): void {
  const { item_kind, item_key, choice_kind, pick_order, survival_seconds } = choice;
  track("choice_observed", { item_kind, item_key, choice_kind, pick_order, survival_seconds });
}

export function trackSetting(track: Track, change: SettingChange): void {
  track("setting_change", change);
}

type UpgradePurchase = {
  readonly nodeId: string;
  readonly level: number;
  readonly gold?: number;
};

export function trackUpgradePurchases(track: Track) {
  let pickOrder = 0;
  let previousNode: string | undefined;
  return ({ nodeId, level, gold }: UpgradePurchase): void => {
    track("upgrade_purchase", {
      node_id: nodeId, level, item_kind: "upgrade", item_key: nodeId, choice_kind: "purchase",
      pick_order: ++pickOrder,
      ...(previousNode === undefined ? {} : { previous_node: previousNode }),
      ...(gold === undefined ? {} : { gold }),
    });
    previousNode = nodeId;
  };
}
