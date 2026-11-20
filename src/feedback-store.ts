import type { SurveyRating, SurveyTopic } from "./analytics-events";

export interface PlayerFeedback {
  readonly text: string;
  readonly rating: SurveyRating;
  readonly topic: SurveyTopic;
  readonly build: string;
  readonly lang: string;
}

export type FeedbackPost = (url: string, init: RequestInit) => Promise<unknown>;

const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;

export function feedbackCommitUrl(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
}

export function feedbackCommitBody(projectId: string, documentId: string, feedback: PlayerFeedback): string {
  return JSON.stringify({
    writes: [{
      update: {
        name: `projects/${projectId}/databases/(default)/documents/feedback/${documentId}`,
        fields: {
          text: { stringValue: feedback.text.trim() },
          rating: { integerValue: String(feedback.rating) },
          topic: { stringValue: feedback.topic },
          build: { stringValue: feedback.build },
          lang: { stringValue: feedback.lang },
        },
      },
      currentDocument: { exists: false },
      updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
    }],
  });
}

/** Fire-and-forget: the game shows its thanks regardless of Firestore's answer. */
export function sendPlayerFeedback(
  projectId: string, feedback: PlayerFeedback,
  post: FeedbackPost = (url, init) => fetch(url, init),
  documentId: string = crypto.randomUUID(),
): void {
  if (!PROJECT_ID.test(projectId)) return;
  try {
    post(feedbackCommitUrl(projectId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: feedbackCommitBody(projectId, documentId, feedback),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    return;
  }
}
