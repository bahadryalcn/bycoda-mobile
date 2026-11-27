import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => ({ randomUUID: () => "inbox-request-fixture" }));

import { RemoteHostError } from "@/remote/transport";
import { inboxReceiptPollDelay, isInboxWriteUncertain, runInboxJob, type InboxRpcClient } from "./provider-jobs";
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
  it("does not replay metadata or reaction writes after acceptance when polling fails", async () => {
    vi.useFakeTimers();
    const commands: InboxJobRequest[] = [
      { action: "reviewers", input: { item: comment.input.item, mode: "request", logins: ["alice"], confirm: "CHANGE_PR_REVIEWERS" } },
      { action: "labels", input: { item: comment.input.item, mode: "add", names: ["bug"], confirm: "CHANGE_PR_LABELS" } },
      { action: "reaction", input: { item: comment.input.item, mode: "remove", subjectId: "IC_123", content: "HEART", confirm: "CHANGE_PR_REACTION" } },
    ];
    for (const command of commands) {
      const { client, request } = fixture();
      request.mockResolvedValueOnce({ id: "job", state: "running" }).mockRejectedValueOnce(new RemoteHostError("machine-a", "network", "Disconnected"));
      const pending = runInboxJob(client, command), failure = expect(pending).rejects.toMatchObject({ uncertain: true });
      await vi.advanceTimersByTimeAsync(1000);
      await failure;
      expect(request.mock.calls.map(call => call[0])).toEqual(["inbox.provider.request", "inbox.provider.result"]);
    }
  });
  it("checks a pending receipt soon after acceptance and settles at one check a second", async () => {
    expect([0, 1, 2, 3, 4, 7, 8, 30].map(inboxReceiptPollDelay)).toEqual([400, 600, 800, 1000, 1000, 1000, 2000, 2000]);
    vi.useFakeTimers();
    const { client, request } = fixture();
    request.mockResolvedValueOnce({ id: "job", state: "queued" }).mockResolvedValueOnce({ id: "job", state: "completed", result: { items: [] } });
    const pending = runInboxJob(client, { action: "list", input: { projectId: "project-a", query: { assignedToMe: false, state: "open", search: "" } } });
    await vi.advanceTimersByTimeAsync(400);
    await expect(pending).resolves.toEqual({ items: [] });
    expect(request.mock.calls.map(call => call[0])).toEqual(["inbox.provider.request", "inbox.provider.result"]);
  });
  it("reports a read the desktop never answers instead of waiting the write deadline", async () => {
    vi.useFakeTimers();
    const { client, request } = fixture();
    request.mockResolvedValue({ id: "job", state: "running" });
    const pending = runInboxJob(client, { action: "checks", input: { item: comment.input.item } });
    const failure = expect(pending).rejects.toMatchObject({ uncertain: false, message: expect.stringContaining("did not answer in time") });
    await vi.advanceTimersByTimeAsync(62_000);
    await failure;
  });
  it("uses a previously persisted attempt ID without changing existing callers and marks known failed receipts terminal", async () => {
    const { client, request } = fixture();
    request.mockResolvedValueOnce({ id: "known-job", state: "failed", error: "Owner rejected" });
    await expect(runInboxJob(client, comment, undefined, "persisted-attempt")).rejects.toMatchObject({ terminal: true, uncertain: false });
    expect(request).toHaveBeenLastCalledWith("inbox.provider.request", { requestId: "persisted-attempt", action: "comment", ...comment.input }, { signal: undefined, retry: false });
    await expect(runInboxJob(client, comment, undefined, "bad/id")).rejects.toThrow(/request ID/);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("routes exact review payloads as writes and validates read context before returning it", async () => {
    const { client, request } = fixture();
    const review: InboxJobRequest<"review"> = { action: "review", input: { item: comment.input.item, projectId: "project-a", commitId: "a".repeat(40), event: "APPROVE", body: "", comments: [], confirm: "SUBMIT_PR_REVIEW" } };
    request.mockResolvedValueOnce({ id: "review-job", state: "completed", result: "approved" });
    await expect(runInboxJob(client, review)).resolves.toBe("approved");
    expect(request).toHaveBeenLastCalledWith("inbox.provider.request", { requestId: "inbox-request-fixture", action: "review", ...review.input }, { signal: undefined, retry: false });
    request.mockResolvedValueOnce({ id: "context-job", state: "completed", result: { commitId: "HEAD", patch: "unsafe" } });
    await expect(runInboxJob(client, { action: "review-context", input: { item: comment.input.item } })).rejects.toThrow(/Invalid reviewed/);
  });
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
