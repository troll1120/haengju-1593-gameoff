import { track } from "./analytics";
import { feedbackDestination, feedbackRating, feedbackTopic } from "./feedback-topics";
import { sendPlayerFeedback } from "./feedback-store";
import { language } from "./i18n";
import {
  FEEDBACK_BUILD, FEEDBACK_FIRESTORE_PROJECT, FEEDBACK_URL, GA_MEASUREMENT_ID,
} from "./release-config";
import { bindSurvivalSurvey } from "./survival-survey";
import "./player-feedback.css";

function feedbackElement<T extends HTMLElement>(
  id: string, elementType: { new(): T },
): T {
  const element = document.getElementById(id);
  if (element instanceof elementType) return element;
  throw new TypeError(`Missing feedback element: ${id}`);
}

let onRunEnd: ((run: object) => void) | undefined;

export function notifySurveyRunEnd(run: object): void {
  onRunEnd?.(run);
}

export function initPlayerFeedback(): void {
  const dialog = feedbackElement("player-feedback", HTMLDialogElement);
  const form = feedbackElement("player-feedback-form", HTMLFormElement);
  const text = feedbackElement("player-feedback-text", HTMLTextAreaElement);
  const thanks = feedbackElement("player-feedback-thanks", HTMLElement);
  feedbackElement("player-analytics-notice", HTMLElement).hidden = GA_MEASUREMENT_ID.trim() === "";
  const destination = feedbackDestination(FEEDBACK_URL);
  const surveyLink = feedbackElement("survey-feedback", HTMLAnchorElement);
  if (destination) {
    surveyLink.href = destination.href;
    surveyLink.hidden = false;
  }
  for (const id of ["settings-feedback", "result-feedback"]) {
    const link = feedbackElement(id, HTMLAnchorElement);
    if (destination) {
      link.href = destination.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      continue;
    }
    const button = document.createElement("button");
    button.id = link.id;
    button.className = link.className;
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    button.append(...Array.from(link.childNodes));
    link.replaceWith(button);
    button.addEventListener("click", () => {
      form.reset();
      form.hidden = false;
      thanks.hidden = true;
      dialog.showModal();
    });
  }

  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") event.stopPropagation();
  });
  dialog.addEventListener("close", () => form.reset());
  feedbackElement("player-feedback-close", HTMLButtonElement).addEventListener("click", () => dialog.close());
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!dialog.open || form.hidden) return;
    const rating = feedbackRating(new FormData(form).get("fun_rating"));
    if (rating === undefined) return;
    const opinion = text.value;
    const topic = feedbackTopic(opinion);
    form.reset();
    form.hidden = true;
    thanks.hidden = false;
    thanks.focus();
    track?.("feedback_submit", { feedback_topic: topic, fun_rating: rating });
    sendPlayerFeedback(FEEDBACK_FIRESTORE_PROJECT, {
      text: opinion, rating, topic, build: FEEDBACK_BUILD, lang: language(),
    });
  });

  onRunEnd = bindSurvivalSurvey({
    result: feedbackElement("result", HTMLElement),
    panel: feedbackElement("survival-survey", HTMLElement),
    form: feedbackElement("survival-survey-form", HTMLFormElement),
    close: feedbackElement("survival-survey-close", HTMLButtonElement),
    liked: feedbackElement("survival-survey-liked", HTMLTextAreaElement),
    disliked: feedbackElement("survival-survey-disliked", HTMLTextAreaElement),
    retry: feedbackElement("retry", HTMLButtonElement),
    exitControls: ["retry", "result-upgrade", "result-endless", "home"]
      .map(id => feedbackElement(id, HTMLButtonElement)),
  }, event => {
    switch (event.name) {
      case "survey_show":
      case "survey_dismiss":
        track?.(event.name, {});
        break;
      case "survey_submit":
        track?.(event.name, event.response);
        break;
      default: {
        const unreachable: never = event;
        return unreachable;
      }
    }
  }, () => localStorage);
}
