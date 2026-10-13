import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "./single-flight";

describe("asynchronous action single flight", () => {
  it("prevents a rapid second submit before asynchronous validation starts", async () => {
    let release!: () => void;
    const validation = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = vi.fn().mockResolvedValue("receipt");
    const flight = createSingleFlight<string>();
    const first = flight.run(async () => {
      await validation;
      return write();
    });
    const secondAction = vi.fn().mockResolvedValue("duplicate");
    const second = flight.run(secondAction);
    expect(second).toBe(first);
    expect(flight.isPending()).toBe(true);
    release();
    expect(await first).toBe("receipt");
    expect(write).toHaveBeenCalledTimes(1);
    expect(secondAction).not.toHaveBeenCalled();
    expect(flight.isPending()).toBe(false);
  });
  it("releases a failed validation or write so the retained draft can be retried", async () => {
    const flight = createSingleFlight<string>();
    await expect(
      flight.run(async () => {
        throw new Error("Policy unavailable");
      }),
    ).rejects.toThrow("Policy unavailable");
    expect(flight.isPending()).toBe(false);
    expect(await flight.run(async () => "saved")).toBe("saved");
  });
});
