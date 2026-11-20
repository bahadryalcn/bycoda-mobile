import { describe, expect, it, vi } from "vitest";
import { RemoteHostError } from "@/remote/host-error";
import { childListInterval, readChildSummaries } from "./session-children-read";
import { childSessions } from "./subagent-sessions-model";

const link = (parentSessionId: string) => ({ parentSessionId, runId: "r", kind: "subagent" as const, model: "codex:gpt-5", startedAt: 1 });
const row = (id: string, parent?: string) =>
  ({ id, projectId: "p", title: id, status: "idle", harness: "codex", model: "codex:gpt-5", ...(parent ? { delegationParent: link(parent) } : {}) }) as never;

describe("readChildSummaries", () => {
  it("asks the Host for this parent's children only", async () => {
    const request = vi.fn().mockResolvedValue([row("c", "s")]);
    const signal = new AbortController().signal;
    expect(await readChildSummaries({ request } as never, "p", "s", signal)).toEqual([row("c", "s")]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("sessions.list", { projectId: "p", parentSessionId: "s" }, { signal });
  });

  it("falls back to the project list when an older Host rejects the parent filter", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new RemoteHostError("m", "host", "Invalid params"))
      .mockResolvedValueOnce([row("c", "s"), row("x", "other"), row("top")]);
    const rows = await readChildSummaries({ request } as never, "p", "s", new AbortController().signal);
    expect(request.mock.calls[1]![1]).toEqual({ projectId: "p" });
    // Authoritative identity still comes from each row's own delegation link.
    expect(childSessions(rows, "s").map((child) => child.sessionId)).toEqual(["c"]);
  });

  it.each(["network", "auth", "identity", "unsupported"] as const)("does not retry a %s failure as another read", async (kind) => {
    const request = vi.fn().mockRejectedValue(new RemoteHostError("m", kind, "failed"));
    await expect(readChildSummaries({ request } as never, "p", "s", new AbortController().signal)).rejects.toMatchObject({ kind });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not start the fallback after the read was cancelled", async () => {
    const abort = new AbortController();
    const request = vi.fn().mockImplementation(async () => {
      abort.abort();
      throw new RemoteHostError("m", "host", "Invalid params");
    });
    await expect(readChildSummaries({ request } as never, "p", "s", abort.signal)).rejects.toBeInstanceOf(RemoteHostError);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("childListInterval", () => {
  it("stays fast for an unread, empty or fully scoped answer", () => {
    expect(childListInterval(undefined, "s")).toBe(4_000);
    expect(childListInterval([], "s")).toBe(4_000);
    expect(childListInterval([row("c", "s")], "s")).toBe(4_000);
  });

  it("slows to the directory cadence once the answer holds rows of other sessions", () => {
    expect(childListInterval([row("c", "s"), row("top")], "s")).toBe(15_000);
    expect(childListInterval([row("c", "other")], "s")).toBe(15_000);
  });
});
