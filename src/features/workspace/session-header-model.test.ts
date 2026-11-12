import { expect, it } from "vitest";
import { sessionHeaderStatus } from "./session-header-model";
import type { HostSession } from "./wire";
const copy = (_tr: string, en: string) => en;
const session = (status: string, extra: object = {}) => ({ status, session: { ...extra } }) as unknown as HostSession;
it("reports loading and failed states before a snapshot exists", () => {
  expect(sessionHeaderStatus(undefined, false, copy)).toEqual({ label: "Loading", tone: "muted" });
  expect(sessionHeaderStatus(undefined, true, copy)).toEqual({ label: "Status unavailable", tone: "danger" });
});
it("maps run state to a label and dot tone", () => {
  expect(sessionHeaderStatus(session("running"), false, copy)).toEqual({ label: "Running", tone: "live" });
  expect(sessionHeaderStatus(session("interrupted"), false, copy)).toEqual({ label: "Interrupted", tone: "warning" });
  expect(sessionHeaderStatus(session("idle"), false, copy)).toEqual({ label: "Ready", tone: "muted" });
});
it("lets a blocking question that needs attention win over the run state", () => {
  const blocking = session("running", { pendingQuestion: { behavior: "blocking" } });
  expect(sessionHeaderStatus(blocking, false, copy)).toEqual({ label: "Waiting for your answer", tone: "warning" });
});
it("marks a stale or paused snapshot in the header instead of a transcript banner", () => {
  expect(sessionHeaderStatus(session("running"), true, copy)).toEqual({ label: "Offline", tone: "warning" });
  expect(sessionHeaderStatus(session("idle"), false, copy, true)).toEqual({ label: "Offline", tone: "warning" });
});
