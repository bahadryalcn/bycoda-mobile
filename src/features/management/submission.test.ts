import { describe, expect, it } from "vitest";
import { createSubmissionGate } from "./submission";

describe("management submissions", () => {
  it("prevents a second write while policy validation and the first write are pending", async () => {
    const gate = createSubmissionGate();
    let release!: () => void;
    let writes = 0;
    const validation = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = gate.run(async () => {
      await validation;
      writes++;
    });
    expect(gate.isPending()).toBe(true);
    expect(
      await gate.run(async () => {
        writes++;
      }),
    ).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(writes).toBe(1);
    expect(gate.isPending()).toBe(false);
  });
  it("permits a corrected attempt after validation fails", async () => {
    const gate = createSubmissionGate();
    await expect(
      gate.run(async () => {
        throw new Error("Policy unavailable");
      }),
    ).rejects.toThrow("Policy unavailable");
    expect(await gate.run(async () => undefined)).toBe(true);
  });
});
