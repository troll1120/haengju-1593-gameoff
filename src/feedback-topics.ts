import type { SurveyRating, SurveyTopic } from "./analytics-events";

const topics = [
  ["performance", /끊김|렉|프레임|\b(?:lag|fps|stutter|performance)\b/iu],
  ["controls", /조작|입력|터치|\b(?:controls?|input|touch|keyboard|mouse)\b/iu],
  ["codex_tree", /도감|강화망|\b(?:codex|skill tree|upgrade tree)\b/iu],
  ["relic", /유물|\brelics?\b/iu],
  ["upgrade", /강화|\bupgrades?\b/iu],
  ["difficulty", /난이도|어려움|어려웠|쉬웠|\b(?:difficulty|easy|hard)\b/iu],
  ["combat", /전투|\b(?:combat|battle)\b/iu],
  ["presentation", /연출|그래픽|음향|\b(?:visuals?|graphics|sound|music)\b/iu],
] as const satisfies readonly (readonly [SurveyTopic, RegExp])[];

export function feedbackTopic(text: string): SurveyTopic {
  const opinion = [...text.trim()].slice(0, 200).join("");
  if (opinion === "") return "none";
  return topics.find(([, pattern]) => pattern.test(opinion))?.[0] ?? "other";
}

export function feedbackRating(value: FormDataEntryValue | null): SurveyRating | undefined {
  return [1, 2, 3, 4, 5].find((rating): rating is SurveyRating => String(rating) === value);
}

export function feedbackDestination(configured: string): URL | undefined {
  const url = URL.canParse(configured) ? new URL(configured) : undefined;
  if (!url || !["https:", "http:"].includes(url.protocol) || url.username || url.password) return;
  url.search = "";
  url.hash = "";
  return url;
}
