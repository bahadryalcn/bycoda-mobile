import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => ({ randomUUID: () => "inbox-request-fixture" }));

import { RemoteHostError } from "@/remote/transport";
import { isInboxWriteUncertain, runInboxJob, type InboxRpcClient } from "./provider-jobs";
import type { InboxJobRequest } from "./provider-protocol";

const comment: InboxJobRequest<"comment"> = {
  action: "comment",
  input: {
    item: { provider: "github", kind: "pr", number: 7, repo: "demo/repo", projectPath: "/demo" },
    projectId: "project-a",
    body: "Owner approved text",
    inReplyTo: "review-thread-1",
    confirm: "SEND_COMMENT",
  },
};

function fixture() {
  const request = vi.fn<(...args: Parameters<InboxRpcClient["request"]>) => Promise<unknown>>();
  const client: InboxRpcClient = {
    async request<T>(...args: Parameters<InboxRpcClient["request"]>): Promise<T> {
      return (await request(...args)) as T;
    },
  };
  return { client, request };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("durable provider inbox RPC adapter", () => {
  it("sends only the confirmed target and text with automatic write retries disabled", async () => {
    const { client, request } = fixture();
    request.mockResolvedValue({ id: "job-1", state: "completed", result: { sent: true } });
    await expect(runInboxJob<"comment">(client, comment)).resolves.toEqual({ sent: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "inbox.provider.request",
      { requestId: "inbox-request-fixture", action: "comment", ...comment.input },
      { signal: undefined, retry: false },
    );
  });

  it("recovers a lost acceptance response by looking up the same receipt without replaying the write", async () => {
    const { client, request } = fixture();
    request
      .mockRejectedValueOnce(new RemoteHostError("machine-a", "network", "Response lost.", true))
      .mockResolvedValueOnce({ id: "job-1", state: "completed", result: { sent: true } });
    await expect(runInboxJob<"comment">(client, comment)).resolves.toEqual({ sent: true });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]).toEqual([
      "inbox.provider.result",
      { requestId: "inbox-request-fixture" },
      { signal: undefined },
    ]);
  });

  it("keeps a write uncertain when its acceptance cannot be confirmed", async () => {
    const { client, request } = fixture();
    request
      .mockRejectedValueOnce(new RemoteHostError("machine-a", "network", "Response lost.", true))
      .mockRejectedValueOnce(new RemoteHostError("machine-a", "auth", "Device key revoked."));
    await expect(runInboxJob<"comment">(client, comment)).rejects.toMatchObject({
      uncertain: true,
      kind: "auth",
    });
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "inbox.provider.request",
      "inbox.provider.result",
    ]);
  });

  it("does not retry or look up a receipt when authorization rejects the initial request", async () => {
    const { client, request } = fixture();
    const error = new RemoteHostError("machine-a", "auth", "Device key revoked.");
    request.mockRejectedValue(error);
    await expect(runInboxJob<"comment">(client, comment)).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("polls only receipts after acceptance and retains uncertainty if that poll fails", async () => {
    vi.useFakeTimers();
    const { client, request } = fixture();
    request
      .mockResolvedValueOnce({ id: "job-1", state: "running" })
      .mockRejectedValueOnce(new RemoteHostError("machine-a", "network", "Computer unavailable."));
    const result = runInboxJob<"comment">(client, comment);
    const rejection = expect(result).rejects.toMatchObject({ uncertain: true });
    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "inbox.provider.request",
      "inbox.provider.result",
    ]);
    expect(request.mock.calls[1][1]).toEqual({ requestId: "inbox-request-fixture" });
  });

  it("keeps an explicit uncertain desktop receipt distinct from a completed send", async () => {
    const { client, request } = fixture();
    request.mockResolvedValue({
      id: "job-1",
      state: "uncertain",
      error: "Provider result unknown.",
    });
    await expect(runInboxJob<"comment">(client, comment)).rejects.toMatchObject({
      uncertain: true,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(
      isInboxWriteUncertain(new RemoteHostError("machine-a", "network", "Response lost.", true)),
    ).toBe(true);
    expect(isInboxWriteUncertain(new Error("Could not open the provider link."))).toBe(false);
  });

  it("cancels a pending read without issuing a later receipt request", async () => {
    const { client, request } = fixture();
    const controller = new AbortController();
    request.mockResolvedValue({ id: "job-1", state: "queued" });
    const result = runInboxJob<"thread">(
      client,
      {
        action: "thread",
        input: { item: comment.input.item, projectId: comment.input.projectId },
      },
      controller.signal,
    );
    const rejection = expect(result).rejects.toThrow("cancelled");
    await Promise.resolve();
    controller.abort();
    await rejection;
    expect(request).toHaveBeenCalledTimes(1);
  });
});
