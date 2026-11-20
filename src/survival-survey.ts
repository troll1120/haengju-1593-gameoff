import type { SurveyResponse } from "./analytics-events";
import { feedbackRating, feedbackTopic } from "./feedback-topics";

type SurveyEvent =
  | { readonly name: "survey_show" | "survey_dismiss" }
  | { readonly name: "survey_submit"; readonly response: SurveyResponse };

type SurveyScreen = {
  readonly result: HTMLElement;
  readonly panel: HTMLElement;
  readonly form: HTMLFormElement;
  readonly close: HTMLButtonElement;
  readonly liked: HTMLTextAreaElement;
  readonly disliked: HTMLTextAreaElement;
  readonly retry: HTMLButtonElement;
  readonly exitControls: readonly HTMLButtonElement[];
};

const cadenceKey = "haengju1593-survey-remainder";

export function bindSurvivalSurvey(
  screen: SurveyScreen, emit: (event: SurveyEvent) => void,
  storage: () => Pick<Storage, "getItem" | "setItem">,
): (run: object) => void {
  const { result, panel, form, close, liked, disliked, retry, exitControls } = screen;
  let remainder = 0;
  try {
    const saved = storage().getItem(cadenceKey);
    if (saved === "1" || saved === "2") remainder = Number(saved);
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
  }
  const seen = new WeakSet<object>();
  let pending = false;

  function finish(event: SurveyEvent): void {
    if (panel.hidden) return;
    if (!result.hidden && panel.contains(panel.ownerDocument.activeElement)) retry.focus();
    panel.hidden = true;
    form.reset();
    resultVisibility.disconnect();
    emit(event);
  }

  function syncResult(): void {
    if (result.hidden) {
      finish({ name: "survey_dismiss" });
    } else if (pending) {
      pending = false;
      panel.hidden = false;
      emit({ name: "survey_show" });
    }
  }

  const resultVisibility = new MutationObserver(syncResult);
  close.addEventListener("click", () => finish({ name: "survey_dismiss" }));
  for (const control of exitControls) {
    control.addEventListener("click", () => finish({ name: "survey_dismiss" }));
  }
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      finish({ name: "survey_dismiss" });
    }
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (panel.hidden || result.hidden) return;
    const data = new FormData(form);
    const rating = feedbackRating(data.get("fun_rating"));
    const difficulty = data.get("difficulty");
    if (rating === undefined || (difficulty !== "easy" && difficulty !== "right" && difficulty !== "hard")) return;
    finish({ name: "survey_submit", response: {
      fun_rating: rating, difficulty, liked_topic: feedbackTopic(liked.value), disliked_topic: feedbackTopic(disliked.value),
    } });
  });

  return run => {
    if (seen.has(run)) return;
    seen.add(run);
    finish({ name: "survey_dismiss" });
    remainder = (remainder + 1) % 3;
    try {
      storage().setItem(cadenceKey, String(remainder));
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
    }
    pending = remainder === 0;
    if (pending) {
      resultVisibility.observe(result, { attributes: true, attributeFilter: ["hidden"] });
      syncResult();
    }
  };
}
