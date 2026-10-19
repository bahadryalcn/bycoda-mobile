import { describe, expect, it, vi } from "vitest";
import type { HostRequest } from "../types";
import { createTerminalApi } from "./terminal-api";

describe("paired terminal API", () => {
  it("freezes project and terminal identity, bounds output and disables every mutation retry", async () => {
    const request = vi.fn(async () => ({})) as unknown as HostRequest;
    const api = createTerminalApi(request);
    await api.terminalList("project");
    await api.terminalRead("project", "terminal", 123);
    await api.terminalCreate({ projectId: "project", requestId: "unique-create" });
    await api.terminalWrite("project", "terminal", "echo hi\n");
    await api.terminalInterrupt("project", "terminal");
    await api.terminalClose("project", "terminal");
    const calls = vi.mocked(request).mock.calls;
    expect(calls[1]).toEqual(["terminals.read", { projectId: "project", id: "terminal", after: 123, limit: 16_384 }, undefined]);
    for (const call of calls.slice(2)) expect(call[2]).toEqual({ retry: false });
    expect(calls[3][1]).toEqual({ projectId: "project", id: "terminal", data: "echo hi\n" });
  });
});
