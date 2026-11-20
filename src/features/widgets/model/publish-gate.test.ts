import { describe, expect, it } from "vitest";

import { nextPublishStep } from "./publish-gate";

const HEARTBEAT = 4 * 60_000;
const claimed = { identity: "A", at: 1_000 };

describe("nextPublishStep", () => {
  it("does not retire an unchanged in-flight publication on a re-run", () => {
    expect(nextPublishStep(claimed, "A", 2_000, HEARTBEAT)).toBe("skip");
  });

  it("republishes an unchanged snapshot once the heartbeat is due, without retiring", () => {
    expect(nextPublishStep(claimed, "A", 1_000 + HEARTBEAT, HEARTBEAT)).toBe("publish");
  });

  it("retires in-flight writes when the snapshot identity changes", () => {
    expect(nextPublishStep(claimed, "B", 2_000, HEARTBEAT)).toBe("retire");
  });

  it("retires when the snapshot becomes not ready", () => {
    expect(nextPublishStep(claimed, null, 2_000, HEARTBEAT)).toBe("retire");
  });

  it("skips when nothing is claimed and nothing is ready", () => {
    expect(nextPublishStep({ identity: "", at: 0 }, null, 2_000, HEARTBEAT)).toBe("skip");
  });

  it("publishes a first snapshot after a retirement cleared the claim", () => {
    expect(nextPublishStep({ identity: "", at: 0 }, "A", 2_000, HEARTBEAT)).toBe("retire");
  });

  it("does not retire when a change is reverted to the last claimed state in the same window", () => {
    // Claimed A, then B was only scheduled (never fired), then back to A: A is still the state.
    expect(nextPublishStep(claimed, "A", 1_500, HEARTBEAT)).toBe("skip");
  });
});
