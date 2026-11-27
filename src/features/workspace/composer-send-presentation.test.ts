import { expect, it } from "vitest";
import {
  acceptedStop,
  composerTrailingAction,
  failedStop,
  sentStop,
  STOP_REPLY_MS,
  STOP_SETTLE_MS,
  stopDeadline,
  stopPhase,
  stopStillPending,
  stopUnconfirmedMessage,
} from "./composer-send-presentation";

it("keeps one trailing action: Send idle, one Stop for an empty running draft, delivery otherwise", () => {
  expect(composerTrailingAction({ canStop: false, hasContent: false, mode: "send", alternate: null })).toEqual({ kind: "deliver", mode: "send", alternate: null });
  expect(composerTrailingAction({ canStop: true, hasContent: false, mode: "steer", alternate: "queue" })).toEqual({ kind: "stop" });
  expect(composerTrailingAction({ canStop: true, hasContent: true, mode: "steer", alternate: "queue" })).toEqual({ kind: "deliver", mode: "steer", alternate: "queue" });
  expect(composerTrailingAction({ canStop: true, hasContent: true, mode: "queue", alternate: null })).toEqual({ kind: "deliver", mode: "queue", alternate: null });
  // Sending never offers a busy choice, even if one was computed.
  expect(composerTrailingAction({ canStop: false, hasContent: true, mode: "send", alternate: "queue" })).toEqual({ kind: "deliver", mode: "send", alternate: null });
});

const running = { status: "running", runId: "r1" };

it("bounds both Stop waits so the spinner always ends, never inventing a stop", () => {
  expect(stopPhase(null, running, 0)).toBe("idle");
  // In flight: a spinner only until the reply bound, even if the request never settles.
  expect(stopPhase({ runId: "r1", attempt: 1, sentAt: 1000 }, running, 1000 + STOP_REPLY_MS - 1)).toBe("sending");
  expect(stopPhase({ runId: "r1", attempt: 1, sentAt: 1000 }, running, 1000 + STOP_REPLY_MS)).toBe("unconfirmed");
  expect(stopPhase({ runId: "r1", attempt: 1, sentAt: 1000 }, running, 1e12)).toBe("unconfirmed");
  // Accepted: the run is winding down until the snapshot moves or the settle bound passes.
  const accepted = { runId: "r1", attempt: 1, sentAt: 1000, acceptedAt: 2000 };
  expect(stopPhase(accepted, running, 2000 + STOP_SETTLE_MS - 1)).toBe("settling");
  expect(stopPhase(accepted, running, 2000 + STOP_SETTLE_MS)).toBe("unconfirmed");
  // The snapshot shows the run ended, a new run started, or there is no session: nothing to wait for.
  expect(stopPhase(accepted, { status: "idle", runId: "r1" }, 2001)).toBe("idle");
  expect(stopPhase({ runId: "r1", attempt: 1, sentAt: 1000 }, { status: "running", runId: "r2" }, 1001)).toBe("idle");
  expect(stopPhase(accepted, undefined, 2001)).toBe("idle");
});

it("holds Stop only while a wait is running and offers it again once the bound passes", () => {
  const sent = { runId: "r1", attempt: 1, sentAt: 1000 };
  expect(stopStillPending(null, running, 0)).toBe(false);
  expect(stopStillPending(sent, running, 1001)).toBe(true);
  expect(stopStillPending({ ...sent, acceptedAt: 2000 }, running, 2001)).toBe(true);
  // After either bound Stop is pressable again; a second cancel for the same run is harmless.
  expect(stopStillPending(sent, running, 1000 + STOP_REPLY_MS)).toBe(false);
  expect(stopStillPending({ ...sent, acceptedAt: 2000 }, running, 2000 + STOP_SETTLE_MS)).toBe(false);
  expect(stopStillPending({ ...sent, acceptedAt: 2000 }, { status: "idle", runId: "r1" }, 2001)).toBe(false);
});

it("outlasts the Host's measured wind-down so one Stop is enough", () => {
  // The Host keeps status "running" while it retires the provider and captures the turn's files.
  expect(STOP_SETTLE_MS).toBeGreaterThanOrEqual(30_000);
});

it("wakes the owner exactly when the current wait ends", () => {
  expect(stopDeadline(null)).toBeUndefined();
  expect(stopDeadline({ runId: "r1", attempt: 1, sentAt: 1000 })).toBe(1000 + STOP_REPLY_MS);
  expect(stopDeadline({ runId: "r1", attempt: 1, sentAt: 1000, acceptedAt: 2000 })).toBe(2000 + STOP_SETTLE_MS);
});

it("moves a request forward only for its own attempt", () => {
  const first = sentStop("r1", 1, 1000);
  expect(first).toEqual({ runId: "r1", attempt: 1, sentAt: 1000 });
  expect(acceptedStop(first, 1, 2000)).toEqual({ runId: "r1", attempt: 1, sentAt: 1000, acceptedAt: 2000 });
  // A late reply from an attempt that was replaced must not restart or clear the newer wait.
  const second = sentStop("r1", 2, 40_000);
  expect(acceptedStop(second, 1, 41_000)).toBe(second);
  expect(failedStop(second, 1)).toBe(second);
  expect(failedStop(second, 2)).toBeNull();
  expect(acceptedStop(null, 1, 2000)).toBeNull();
});

it("says honestly why Stop is offered again", () => {
  const copy = (_tr: string, en: string) => en;
  expect(stopUnconfirmedMessage({ runId: "r1", attempt: 1, sentAt: 0 }, copy)).toBe("No reply from the computer yet. Tap Stop to try again.");
  expect(stopUnconfirmedMessage({ runId: "r1", attempt: 1, sentAt: 0, acceptedAt: 1 }, copy)).toBe("The computer accepted Stop, but the turn is still running. Tap Stop to try again.");
});
