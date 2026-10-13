import { describe, expect, it, vi } from "vitest";
import { createRemoteApi, resolveSessionSync } from "./api";
import { HostTransport } from "./transport";
import type { HostSession, MobileMachine, SocialDraft } from "./types";

const machine: MobileMachine = {
  id: "pc-1",
  name: "Work PC",
  endpoint: "https://pc.example",
  environmentId: "env-1",
};
const value: HostSession = {
  projectId: "project-1",
  revision: 1,
  status: "idle",
  updatedAt: 1,
  session: {
    id: "session-1",
    cwd: "/repo",
    title: "Demo session",
    harness: "codex",
    model: "codex:model",
    modelSettings: {},
    runtimeMode: "supervised",
    blocks: [],
  },
};

function client(handler: (method: string, params: Record<string, unknown>) => unknown) {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_address, init) => {
    const { method, params } = JSON.parse(String(init?.body)) as {
      method: string;
      params: Record<string, unknown>;
    };
    calls.push({ method, params });
    return new Response(JSON.stringify({ result: handler(method, params) }), { status: 200 });
  });
  const transport = new HostTransport(machine, async () => "a".repeat(43), fetcher);
  return { api: createRemoteApi(transport), transport, calls };
}

describe("typed remote API", () => {
  it("reassembles exact bounded transcript chunks with machine and session scope", async () => {
    const serialized = JSON.stringify({ kind: "snapshot", value });
    const split = Math.floor(serialized.length / 2);
    const { transport, calls } = client((_method, params) => ({
      data: serialized.slice(
        Number(params.offset),
        Number(params.offset) === 0 ? split : undefined,
      ),
    }));
    const sync = await resolveSessionSync(transport, "session-1", {
      kind: "chunked",
      transfer: "transfer-1",
      length: serialized.length,
    });
    expect(sync).toEqual({ kind: "snapshot", value });
    expect(calls.map((call) => call.params)).toEqual([
      { sessionId: "session-1", transfer: "transfer-1", offset: 0 },
      { sessionId: "session-1", transfer: "transfer-1", offset: split },
    ]);
  });

  it("rejects oversized or empty transcript transfers", async () => {
    const { transport, calls } = client(() => ({ data: "" }));
    await expect(
      resolveSessionSync(transport, "session-1", {
        kind: "chunked",
        transfer: "x",
        length: 33 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ kind: "protocol" });
    expect(calls).toHaveLength(0);
    await expect(
      resolveSessionSync(transport, "session-1", { kind: "chunked", transfer: "x", length: 10 }),
    ).rejects.toMatchObject({ kind: "protocol" });
    expect(calls).toHaveLength(1);
  });

  it("reads account policy before drafting and honors Unicode character limits", async () => {
    const { api, calls } = client((_method, params) =>
      params.action === "policy.get"
        ? { platform: "x", effective: { maxCommentCharacters: 1 } }
        : { id: "draft-1", text: "🙂" },
    );
    await expect(
      api.social.draftReply(
        { accountId: "account-1", projectId: "project-1", threadId: "thread-1", text: "🙂" },
        "comment",
      ),
    ).resolves.toMatchObject({ id: "draft-1" });
    expect(calls.map((call) => call.params.action)).toEqual(["policy.get", "replies.draft"]);
    await expect(
      api.social.draftReply(
        { accountId: "account-1", projectId: "project-1", threadId: "thread-1", text: "🙂🙂" },
        "comment",
      ),
    ).rejects.toThrow("character limit");
    expect(calls.map((call) => call.params.action)).toEqual([
      "policy.get",
      "replies.draft",
      "policy.get",
    ]);
  });

  it("keeps approval separate from sending and requires an approved draft to send", async () => {
    const draft = {
      id: "draft-1",
      accountId: "account-1",
      projectId: "project-1",
      kind: "reply",
      text: "hello",
    } as SocialDraft;
    const { api, calls } = client((_method, params) =>
      params.action === "drafts.approve" ? { ...draft, approvedAt: 1 } : { id: "job-1" },
    );
    expect(() => api.social.sendApprovedDraft(draft, "operation-1")).toThrow("approve");
    expect(calls).toHaveLength(0);
    const approved = await api.social.approveDraft(draft.id);
    expect(calls.map((call) => call.params.action)).toEqual(["drafts.approve"]);
    await api.social.sendApprovedDraft(approved, "operation-1");
    expect(calls.map((call) => call.params.action)).toEqual(["drafts.approve", "replies.send"]);
    expect(calls[1].params.requestId).toBe("operation-1");
  });

  it("preserves file optimistic concurrency and nested PR-watch contracts", async () => {
    const { api, calls } = client(() => null);
    await api.files.write({ projectId: "project-1", cwd: "/worktree" }, "src/app.ts", "old", "new");
    await api.inbox.linkWatch({ projectId: "project-1", repo: "owner/repo", number: 7 });
    expect(calls[0]).toEqual({
      method: "files.write",
      params: {
        projectId: "project-1",
        cwd: "/worktree",
        path: "src/app.ts",
        expected: "old",
        content: "new",
      },
    });
    expect(calls[1].params).toEqual({
      input: { projectId: "project-1", repo: "owner/repo", number: 7 },
    });
  });

  it("scopes note lists to projects and preserves note concurrency stamps", async () => {
    const { api, calls } = client(() => null);
    await api.notes.list("project-1");
    await api.notes.save({ id: "note-1", title: "Plan", body: "Next steps", tags: [] }, 7);
    await api.notes.delete("note-1", 8);
    expect(calls.map((call) => call.method)).toEqual([
      "notes.list",
      "notes.upsert",
      "notes.delete",
    ]);
    expect(calls[0].params).toEqual({ projectId: "project-1" });
    expect(calls[1].params.expectedUpdatedAt).toBe(7);
    expect(calls[2].params).toEqual({ id: "note-1", expectedUpdatedAt: 8 });
  });
});
