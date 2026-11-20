import type { EnemyKind } from "./rules";

export type DeathCause = EnemyKind | "fire" | "ladder" | "unknown";
export type BossKind = "regular" | "midboss" | "boss" | "unknown";
export type InputKind = "touch" | "pointer" | "keyboard";
export type ViewportBand = "narrow" | "medium" | "wide";
export type ScreenKind = "title" | "prep" | "tree" | "relic" | "codex" | "tutorial" |
  "battle" | "pause" | "settings" | "result" | "feedback_dialog";
type MinuteBand = `m0${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | `m1${0 | 1 | 2 | 3 | 4}` | "m15_plus";
type SurvivalBand = "lt1" | "1to3" | "3to5" | "5to10" | "10to15" | "15plus";
type FpsBand = "lt20" | "20to29" | "30to49" | "50plus";

export type ChoiceObservation = {
  readonly item_kind: "unit" | "general" | "relic";
  readonly item_key: string;
  readonly choice_kind: "offered" | "selected" | "auto" | "acquired";
  readonly pick_order: number;
  readonly survival_seconds: number;
};

export type SettingChange =
  | { readonly setting_key: "sound" | "timer" | "motion" | "flash" | "damage_numbers"; readonly setting_value: "on" | "off" }
  | { readonly setting_key: "language"; readonly setting_value: "ko" | "en" };

export const surveyTopics = [
  "performance", "controls", "codex_tree", "relic", "upgrade", "difficulty", "combat", "presentation", "none", "other",
] as const;
const surveyDifficulties = ["easy", "right", "hard"] as const;
const surveyRatings = [1, 2, 3, 4, 5] as const;
export type SurveyTopic = typeof surveyTopics[number];
export type SurveyDifficulty = typeof surveyDifficulties[number];
export type SurveyRating = typeof surveyRatings[number];
export type SurveyResponse = {
  readonly fun_rating: SurveyRating;
  readonly difficulty: SurveyDifficulty;
  readonly liked_topic: SurveyTopic;
  readonly disliked_topic: SurveyTopic;
};

type Empty = Readonly<Record<string, never>>;
type AnalyticsEvents = {
  game_load: { readonly viewport_band: ViewportBand; readonly input_kind: Exclude<InputKind, "keyboard"> };
  game_first_input: { readonly input_kind: InputKind };
  tutorial_step: { readonly step_kind: "shown" | "completed" | "skipped" };
  game_start: { readonly mode: "survival" };
  wave_reached: { readonly wave: number };
  survival_minute: { readonly minute: number; readonly gold?: number; readonly player_level?: number };
  survive_1m: Empty;
  survive_3m: Empty;
  survive_5m: Empty;
  survive_10m: Empty;
  survive_15m: Empty;
  game_over: {
    readonly survival_seconds: number; readonly wave: number; readonly minute_band: MinuteBand;
    readonly survival_band: SurvivalBand; readonly gold?: number; readonly cause?: DeathCause; readonly boss_kind?: BossKind;
  };
  upgrade_purchase: {
    readonly node_id: string; readonly level: number; readonly item_kind?: "upgrade"; readonly item_key?: string;
    readonly choice_kind?: "purchase"; readonly pick_order?: number; readonly previous_node?: string; readonly gold?: number;
  };
  choice_observed: ChoiceObservation;
  codex_open: { readonly source: "battle" | "title" };
  screen_dwell: { readonly screen_kind: ScreenKind; readonly dwell_seconds: number };
  setting_change: SettingChange;
  retry: { readonly mode: "survival" | "endless" };
  run_quit: { readonly survival_seconds: number; readonly minute_band: MinuteBand; readonly exit_kind: "quit_to_title" };
  session_end: { readonly seconds_played: number };
  performance_sample: { readonly fps_band: FpsBand; readonly viewport_band: ViewportBand };
  survey_show: Empty;
  survey_dismiss: Empty;
  survey_submit: SurveyResponse;
  feedback_submit: { readonly feedback_topic: SurveyTopic; readonly fun_rating: SurveyRating };
};

type EventName = keyof AnalyticsEvents;
type EventCall = { [Name in EventName]: [name: Name, params: AnalyticsEvents[Name]] }[EventName];
export type Track = (...event: EventCall) => void;

export function createTrack(gtag: (...args: unknown[]) => void): Track {
  return (...[name, params]) => {
    if (name === "feedback_submit") {
      const { feedback_topic, fun_rating } = params;
      if (!surveyTopics.includes(feedback_topic) || !surveyRatings.includes(fun_rating)) return;
      gtag("event", name, { feedback_topic, fun_rating });
      return;
    }
    if (name === "survey_submit") {
      const { fun_rating, difficulty, liked_topic, disliked_topic } = params;
      if (!surveyRatings.includes(fun_rating) || !surveyDifficulties.includes(difficulty) ||
        !surveyTopics.includes(liked_topic) || !surveyTopics.includes(disliked_topic)) return;
      gtag("event", name, { fun_rating, difficulty, liked_topic, disliked_topic });
      return;
    }
    if (name === "survey_show" || name === "survey_dismiss") {
      gtag("event", name, {});
      return;
    }
    if (name === "retry" && params.mode !== "survival") return;
    gtag("event", name, params);
  };
}
