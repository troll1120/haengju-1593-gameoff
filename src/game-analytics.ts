import { trackBattle } from "./analytics-battle";
import { createAnalyticsLifecycle, trackChoice, trackSetting, trackUpgradePurchases } from "./analytics-lifecycle";
import type { ChoiceObservation, ScreenKind, SettingChange, Track } from "./analytics-events";
import { takeBphRelicAcquisitions } from "./bph-account";
import { BPH_PROFILES } from "./bph-data";
import type { BphSave } from "./bph-contract";
import { castleLethalHit } from "./castle-damage";
import type { Run } from "./rules";

export function createGameAnalytics(track: Track, options: {
  readonly window: Pick<Window, "addEventListener" | "innerWidth" | "matchMedia" | "performance">;
  readonly document: Pick<Document, "addEventListener" | "visibilityState" | "getElementById">;
  readonly waveSeconds: number;
}) {
  const { window, document } = options;
  const lifecycle = createAnalyticsLifecycle(track, options);
  const battle = trackBattle(track, window, document, options.waveSeconds);
  const upgrade = trackUpgradePurchases(track);
  const draws = new WeakSet<object>();
  const generalOffers = new WeakSet<Run["generalOffers"]>();
  const retries = new WeakSet<Run>();
  let run: Run | undefined;
  let order = 0;
  let screen: ScreenKind | undefined;
  let codex = false;
  let feedback = false;
  const syncScreen = () => lifecycle.screen(feedback ? "feedback_dialog" : codex ? "codex" : screen);
  const accepts = (current: Run) => run === current && !current.endless;
  const choice = (item: Pick<ChoiceObservation, "item_kind" | "item_key" | "choice_kind">, seconds = 0) =>
    trackChoice(track, { ...item, pick_order: ++order, survival_seconds: seconds });

  window.addEventListener("pointerdown", event => {
    if (event.isTrusted) lifecycle.firstInput(event.pointerType === "touch" ? "touch" : "pointer");
  }, { capture: true, passive: true });
  window.addEventListener("keydown", event => {
    if (event.isTrusted) lifecycle.firstInput("keyboard");
  }, { capture: true });
  const dialog = document.getElementById("player-feedback");
  if (dialog && dialog instanceof HTMLDialogElement) {
    new MutationObserver(() => { feedback = dialog.open; syncScreen(); })
      .observe(dialog, { attributes: true, attributeFilter: ["open"] });
  }

  return {
    accepts,
    upgrade,
    choice,
    ready: () => lifecycle.gameLoad(window.innerWidth, window.matchMedia("(pointer: coarse)").matches ? "touch" : "pointer"),
    tutorial: lifecycle.tutorialStep,
    setting: (change: SettingChange) => trackSetting(track, change),
    screen(next?: ScreenKind) { screen = next; syncScreen(); },
    codex(source?: "title" | "battle") {
      if (source) track("codex_open", { source });
      codex = source !== undefined;
      syncScreen();
    },
    frame: (active: boolean) => lifecycle.frame(window.performance.now(), active && screen === "battle" && !codex && !feedback, window.innerWidth),
    start(current: Run) {
      run = current;
      battle.start("survival");
    },
    progress(current: Run) {
      if (accepts(current)) battle.progress(current.time, { gold: current.gold, playerLevel: current.chaos?.level ?? current.level });
    },
    finish(current: Run) {
      if (!accepts(current)) return;
      if (current.phase === "lost") {
        const hit = castleLethalHit(current);
        battle.finish({ outcome: "lost", gold: current.gold, cause: hit?.cause ?? "unknown", bossKind: hit?.boss_kind ?? "unknown" });
      } else if (current.phase === "won") battle.finish({ outcome: "won", gold: current.gold });
    },
    quit(current: Run) {
      if (accepts(current)) battle.quit();
    },
    retry(current: Run) {
      if (accepts(current) && !retries.has(current)) {
        retries.add(current);
        track("retry", { mode: "survival" });
      }
    },
    offerGenerals(current: Run) {
      if (!accepts(current) || generalOffers.has(current.generalOffers)) return;
      generalOffers.add(current.generalOffers);
      for (const general of current.generalOffers) choice({ item_kind: "general", item_key: general, choice_kind: "offered" }, current.time);
    },
    draws(current: Run) {
      if (!accepts(current) || !current.bph) return;
      for (const receipt of current.bph.receipts) {
        if (draws.has(receipt)) continue;
        draws.add(receipt);
        for (const card of receipt.cards) if (BPH_PROFILES[card.profileId]) {
          choice({ item_kind: "unit", item_key: card.profileId, choice_kind: "auto" }, current.time);
        }
      }
    },
    relics(save: BphSave, context: { readonly eligible: boolean; readonly seconds?: number }) {
      for (const { relicId } of takeBphRelicAcquisitions(save)) if (context.eligible) {
        choice({ item_kind: "relic", item_key: relicId, choice_kind: "acquired" }, context.seconds);
      }
    },
  };
}
