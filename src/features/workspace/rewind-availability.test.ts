import { expect, it } from "vitest";
import { rewindAvailability } from "./rewind-availability";

const ready = { blocked: false, sameMachine: true, capabilities: ["sessions.rewind"], running: false, rewindable: true };

it("offers Edit from here when the computer and session allow it", () => {
  expect(rewindAvailability(ready)).toBe("available");
});

it("keeps the action visible with a reason the owner can act on", () => {
  expect(rewindAvailability({ ...ready, capabilities: ["sessions.block"] })).toBe("update");
  expect(rewindAvailability({ ...ready, capabilities: undefined })).toBe("update");
  expect(rewindAvailability({ ...ready, running: true })).toBe("running");
  // An older computer is the first thing to fix, even while a turn runs.
  expect(rewindAvailability({ ...ready, capabilities: [], running: true })).toBe("update");
});

it("offers nothing where no action could ever succeed", () => {
  expect(rewindAvailability({ ...ready, blocked: true })).toBe("none");
  expect(rewindAvailability({ ...ready, sameMachine: false })).toBe("none");
  expect(rewindAvailability({ ...ready, rewindable: false })).toBe("none");
});
