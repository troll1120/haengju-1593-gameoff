import { GA_MEASUREMENT_ID } from "./release-config";
import { createTrack } from "./analytics-events";
import type { Track } from "./analytics-events";

export { trackBattle } from "./analytics-battle";
export { createAnalyticsLifecycle, trackChoice, trackSetting, trackUpgradePurchases } from "./analytics-lifecycle";
export { surveyTopics } from "./analytics-events";
export type {
  BossKind, DeathCause, ScreenKind, SurveyDifficulty, SurveyRating, SurveyResponse, SurveyTopic, Track,
} from "./analytics-events";

type TagWindow = EventTarget & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
type ScriptHost<Script> = {
  createElement(tag: "script"): Script;
  readonly head: { append(script: Script): void };
};

export function createAnalytics<Script extends Pick<HTMLScriptElement, "async" | "src">>(
  measurementId: string, win: TagWindow, doc: ScriptHost<Script>,
): Track | undefined {
  const id = measurementId.trim();
  if (!id) return;

  const queue = win.dataLayer ??= [];
  const gtag = win.gtag ??= function () { queue.push(arguments); };
  gtag("js", new Date());
  // itch serves the game from a cross-site iframe, where gtag's default SameSite=Lax cookie is rejected and no hit is sent.
  // The flags must be set before config: passed as a config parameter they do not reach the first cookie write in the iframe.
  gtag("set", { cookie_flags: "SameSite=None;Secure;Partitioned" });
  gtag("config", id);
  const script = doc.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  doc.head.append(script);
  return createTrack(gtag);
}

export const track = typeof window === "undefined"
  ? undefined : createAnalytics<HTMLScriptElement>(GA_MEASUREMENT_ID, window, document);
