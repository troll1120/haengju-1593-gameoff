import { describe, expect, test } from "bun:test";
import { feedbackCommitBody, feedbackCommitUrl, sendPlayerFeedback } from "./feedback-store";
import { FEEDBACK_FIRESTORE_PROJECT } from "./release-config";

const project = "haengju-1593-feedback";
const feedback = { text: "  성벽이 너무 빨리 무너져요  ", rating: 4, topic: "difficulty", build: "itch5-1120", lang: "ko" } as const;

describe("player feedback store", () => {
  test("commits one new feedback document with a server timestamp", () => {
    expect(JSON.parse(feedbackCommitBody(project, "doc-1", feedback))).toEqual({
      writes: [{
        update: {
          name: "projects/haengju-1593-feedback/databases/(default)/documents/feedback/doc-1",
          fields: {
            text: { stringValue: "성벽이 너무 빨리 무너져요" },
            rating: { integerValue: "4" },
            topic: { stringValue: "difficulty" },
            build: { stringValue: "itch5-1120" },
            lang: { stringValue: "ko" },
          },
        },
        currentDocument: { exists: false },
        updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
      }],
    });
  });

  test("posts the commit to the project's Firestore REST endpoint", () => {
    const calls: [string, RequestInit][] = [];
    sendPlayerFeedback(project, feedback, async (url, init) => { calls.push([url, init]); }, "doc-2");
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]!;
    expect(url).toBe("https://firestore.googleapis.com/v1/projects/haengju-1593-feedback/databases/(default)/documents:commit");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(feedbackCommitBody(project, "doc-2", feedback));
  });

  test("swallows a rejected or throwing post", async () => {
    let rejected = false;
    expect(() => sendPlayerFeedback(project, feedback, () => {
      rejected = true;
      return Promise.reject(new TypeError("offline"));
    })).not.toThrow();
    expect(rejected).toBe(true);
    expect(() => sendPlayerFeedback(project, feedback, () => { throw new TypeError("blocked"); })).not.toThrow();
    await Promise.resolve();
  });

  test("does not post without a valid project id", () => {
    const calls: string[] = [];
    for (const id of ["", "x", "Bad/Project", "a".repeat(40)]) {
      sendPlayerFeedback(id, feedback, async url => { calls.push(url); });
    }
    expect(calls).toEqual([]);
  });

  test("release config names the Firestore feedback project", () => {
    expect(feedbackCommitUrl(FEEDBACK_FIRESTORE_PROJECT)).toBe(feedbackCommitUrl(project));
  });
});
