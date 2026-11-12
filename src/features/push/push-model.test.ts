import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(async () => undefined) },
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock("../permissions/device-permissions", () => ({ notifications: vi.fn() }));
import { decodePushPreferences, pushTarget } from "./push-model";
import { isViewingSession, setViewingSession } from "./push-viewing";
import { expoProjectId, pushRegistration } from "./push-registration";

const copy = (_tr: string, en: string) => en;

describe("push preferences", () => {
  it("defaults to every event and keeps explicit choices", () => {
    expect(decodePushPreferences(null)).toEqual({
      enabled: true,
      events: { finished: true, input: true, failed: true, assistant: true, approvals: true },
      assistantUrgentDuringQuiet: true,
    });
    expect(decodePushPreferences("{bad")).toEqual(decodePushPreferences(null));
    expect(
      decodePushPreferences(JSON.stringify({ enabled: false, events: { finished: false } })),
    ).toEqual({
      enabled: false,
      events: { finished: false, input: true, failed: true, assistant: true, approvals: true },
      assistantUrgentDuringQuiet: true,
    });
    expect(
      decodePushPreferences(
        JSON.stringify({ events: { approvals: false }, assistantUrgentDuringQuiet: false }),
      ),
    ).toMatchObject({ events: { approvals: false, assistant: true }, assistantUrgentDuringQuiet: false });
  });
});

describe("push targets", () => {
  it("opens only session events with a computer and conversation", () => {
    expect(pushTarget({ kind: "input", environmentId: "e", sessionId: "s", projectId: "p" })).toEqual({
      kind: "session",
      environmentId: "e",
      sessionId: "s",
      projectId: "p",
    });
    expect(pushTarget({ kind: "test" })).toBeNull();
    expect(pushTarget({ kind: "finished", environmentId: "e", sessionId: "" })).toBeNull();
    expect(pushTarget(null)).toBeNull();
  });

  it("routes approval and assistant pushes", () => {
    expect(pushTarget({ kind: "approval", approvalId: "a1", environmentId: "e" })).toEqual({
      kind: "approval",
      environmentId: "e",
      approvalId: "a1",
    });
    expect(pushTarget({ kind: "approval", environmentId: "e" })).toBeNull();
    expect(pushTarget({ kind: "approval", approvalId: "a1" })).toBeNull();
    expect(
      pushTarget({ kind: "assistant", notificationId: "n", assistantKind: "owner.question", environmentId: "e" }),
    ).toEqual({ kind: "assistant", environmentId: "e", questions: true });
    expect(pushTarget({ kind: "assistant", environmentId: "e", jobId: "j", assistantKind: "job.done" })).toEqual({
      kind: "assistant",
      environmentId: "e",
      questions: false,
      jobId: "j",
    });
    expect(pushTarget({ kind: "assistant" })).toBeNull();
  });

  it("suppresses banners only for the conversation on screen", () => {
    setViewingSession({ environmentId: "e", sessionId: "s" });
    expect(isViewingSession({ environmentId: "e", sessionId: "s" })).toBe(true);
    expect(isViewingSession({ environmentId: "e", sessionId: "other" })).toBe(false);
    setViewingSession(null);
    expect(isViewingSession({ environmentId: "e", sessionId: "s" })).toBe(false);
  });
});

describe("push registration", () => {
  it("carries only this phone's wording and computer name", () => {
    const params = pushRegistration(
      "ExpoPushToken[x]",
      "Home PC",
      {
        enabled: true,
        events: { finished: false, input: true, failed: true, assistant: true, approvals: false },
        assistantUrgentDuringQuiet: false,
      },
      copy,
    );
    expect(params).toMatchObject({
      pushToken: "ExpoPushToken[x]",
      title: "bycoda · Home PC",
      texts: { finished: "Agent finished", input: "Waiting for your approval or answer", failed: "A turn failed" },
      events: { finished: false, input: true, failed: true, assistant: true, approvals: false },
      assistantUrgentDuringQuiet: false,
    });
    expect(params.texts.assistant).toBe("Your assistant has an update");
    expect(params.texts.approvals).toBe("Your assistant needs your approval");
  });

  it("reports a build without an EAS project", () => {
    expect(expoProjectId()).toBeUndefined();
  });
});
