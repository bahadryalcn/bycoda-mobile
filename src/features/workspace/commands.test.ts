import { describe, expect, it, vi } from "vitest";
import { dispatchCommand, UncertainCommand } from "./commands";
import type { HostTransport } from "@/remote/transport";

const mockClient = (request: ReturnType<typeof vi.fn>) => ({
  machine: {
    id: "original-machine",
    name: "PC",
    endpoint: "https://pc.example",
    environmentId: "environment",
  },
  request: request as HostTransport["request"],
});

describe("mobile command recovery", () => {
  it("reconciles an accepted timed-out send through its receipt without dispatching again", async () => {
    const receipt = { commandId: "command", sessionId: "session", revision: 2 };
    const request = vi
      .fn()
      .mockRejectedValueOnce({ kind: "timeout", uncertain: true })
      .mockResolvedValueOnce(receipt);
    await expect(
      dispatchCommand(mockClient(request), "command", {
        type: "send",
        sessionId: "session",
        text: "Run",
      }),
    ).resolves.toEqual(receipt);
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "commands.dispatch",
      "commands.status",
    ]);
    expect(request.mock.calls[0][2]).toEqual({ retry: false });
  });

  it("retains the originating computer and credential reader when delivery cannot be checked", async () => {
    const request = vi.fn().mockRejectedValue({ kind: "network", uncertain: true });
    const origin = mockClient(request);
    const error = await dispatchCommand(origin, "command", { type: "send" }).catch(
      (error) => error,
    );
    expect(error).toBeInstanceOf(UncertainCommand);
    expect(error.machineId).toBe("original-machine");
    expect(error.commandId).toBe("command");
    expect(error.client).toBe(origin);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not label a definite host validation error as uncertain delivery", async () => {
    const error = Object.assign(new Error("This session is already running"), {
      kind: "host",
      uncertain: false,
    });
    const request = vi.fn().mockRejectedValue(error);
    await expect(dispatchCommand(mockClient(request), "command", { type: "send" })).rejects.toBe(
      error,
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("checks a write receipt after a malformed response that may follow an accepted command", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce({ kind: "protocol", uncertain: true })
      .mockResolvedValueOnce(null);
    await expect(
      dispatchCommand(mockClient(request), "command", { type: "draft" }),
    ).rejects.toBeInstanceOf(UncertainCommand);
    expect(request.mock.calls[1][0]).toBe("commands.status");
  });
});
