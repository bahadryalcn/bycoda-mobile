import { expect, it } from "vitest";
import { sessionListPollInterval } from "./session-list-poll";

it("polls slowly only while a live stream is healthy", () => {
  expect(sessionListPollInterval(true, "ready", false)).toBe(30_000);
  expect(sessionListPollInterval(true, "connecting", false)).toBe(5_000);
  expect(sessionListPollInterval(true, "ready", true)).toBe(5_000);
  expect(sessionListPollInterval(false, "legacy-http", false)).toBe(5_000);
});
