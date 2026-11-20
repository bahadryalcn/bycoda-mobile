import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HostStore } from "../../../../host/store";
import { HostAssistant } from "../../../../host/assistant/service";
import { assistantDomain } from "../../../../host/domains/assistant/service";
import { AssistantMobileClient, type AssistantMobilePort } from "./assistant-client";
import { assistantHistoryPage } from "./assistant-history";
const cleanups: Array<() => Promise<void>> = [];
// Every test boots a real HostStore and assistant domain on disk: about a second alone, well past
// the 5 s default when the full suite runs ~700 files in parallel.
vi.setConfig({ testTimeout: 60_000 });
it("refuses runtime attempts to turn the finite reader into arbitrary assistant writes", async () => {
  const f = await fixture();
  await expect(f.client.read({ op: "pauseAll" } as never)).rejects.toMatchObject({
    code: "unsupported",
  });
  await expect(f.client.read({ op: "presence.set", state: "away" } as never)).rejects.toMatchObject(
    { code: "unsupported" },
  );
  await expect(f.client.setPresence("idle" as never)).rejects.toMatchObject({
    code: "unsupported",
  });
  expect(f.request).not.toHaveBeenCalled();
});
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
it("gives the Room snapshot time to finish on a busy Host", async () => {
  const f = await fixture();
  const signal = new AbortController().signal;

  await f.client.read({ op: "snapshot", limit: 100 }, signal);

  expect(f.request).toHaveBeenLastCalledWith(
    "assistant.request",
    { op: "snapshot", limit: 100 },
    { retry: false, signal, timeoutMs: 30_000 },
  );
});
async function fixture(now?: () => number) {
  const folder = mkdtempSync(join(tmpdir(), "mobile-assistant-")),
    store = new HostStore(join(folder, "host.db"));
  await store.ready;
  const service = new HostAssistant(store, {
    now,
    listProjects: async () =>
      (await store.projects()).map((project) => ({
        id: project.id,
        path: project.cwd,
        name: project.name,
      })),
  });
  await service.ready;
  let current = true,
    authorized = true,
    environmentId = store.environmentId,
    capabilities = ["assistant.v1"];
  const dispatch = assistantDomain(service, store),
    request = vi.fn<AssistantMobilePort["request"]>(async (method, params) =>
      method === "environment.describe"
        ? { environmentId, capabilities }
        : dispatch(params, {
            principalId: "paired-test-owner",
            authorized: async () => authorized,
          }),
    );
  const client = new AssistantMobileClient({
    environmentId: store.environmentId,
    current: () => current,
    request,
  });
  cleanups.push(async () => {
    await service.close();
    await store.close();
    rmSync(folder, { recursive: true, force: true });
  });
  return {
    client,
    request,
    service,
    store,
    setCurrent(value: boolean) {
      current = value;
    },
    setAuthorized(value: boolean) {
      authorized = value;
    },
    setEnvironment(value: string) {
      environmentId = value;
    },
    setCapabilities(value: string[]) {
      capabilities = value;
    },
  };
}
it("loads every record across a >100-message exact-timestamp boundary through the canonical mobile owner transport", async () => {
  const f = await fixture(() => 1793664000000),
    thread = (await f.client.read({ op: "threads.open" })).thread!,
    expected: string[] = [];
  for (let index = 0; index < 135; index++) {
    const message = (
      await f.service.request(
        {
          op: "threads.append",
          threadId: thread.id,
          role: "user",
          via: "text",
          text: `Same-timestamp canonical message ${index}`,
          idempotencyKey: `tie-${index}`,
        },
        "owner",
      )
    ).message!;
    expected.push(message.id);
  }
  let page = await f.client.read({ op: "threads.messages", threadId: thread.id, limit: 100 }),
    result = assistantHistoryPage(page.messages!, thread.id);
  expect(result.messages).toHaveLength(100);
  expect(result.messages[0].id).toBe(expected[35]);
  let pages = 1;
  while (page.messages!.length) {
    page = await f.client.read({
      op: "threads.messages",
      threadId: thread.id,
      limit: 100,
      before: result.before,
      beforeId: result.beforeId,
    });
    if (!page.messages!.length) break;
    result = assistantHistoryPage(page.messages!, thread.id, result.messages, true);
    pages++;
    if (pages > 5) throw new Error("Pagination did not advance");
  }
  expect(pages).toBe(2);
  expect(result.messages.map((message) => message.id)).toEqual(expected);
  expect(new Set(result.messages.map((message) => message.id)).size).toBe(135);
  expect(
    f.request.mock.calls
      .filter(
        ([method, params]) =>
          method === "assistant.request" &&
          params.op === "threads.messages" &&
          params.before !== undefined,
      )
      .every(([, params]) => typeof params.beforeId === "string"),
  ).toBe(true);
});
it("retains the loaded page when its exact cursor is deleted or its timestamp mismatches", async () => {
  const f = await fixture(() => 1793664000000),
    thread = (await f.client.read({ op: "threads.open" })).thread!;
  for (let index = 0; index < 4; index++)
    await f.service.request(
      {
        op: "threads.append",
        threadId: thread.id,
        role: "user",
        via: "text",
        text: `Cursor source ${index}`,
        idempotencyKey: `cursor-${index}`,
      },
      "owner",
    );
  const response = await f.client.read({ op: "threads.messages", threadId: thread.id, limit: 2 }),
    loaded = assistantHistoryPage(response.messages!, thread.id),
    ids = loaded.messages.map((message) => message.id);
  await expect(
    f.client.read({
      op: "threads.messages",
      threadId: thread.id,
      limit: 2,
      before: loaded.before! + 1,
      beforeId: loaded.beforeId,
    }),
  ).rejects.toThrow("history cursor changed");
  await f.service.request(
    { op: "messages.delete", id: loaded.beforeId!, expectedVersion: loaded.messages[0].version },
    "owner",
  );
  await expect(
    f.client.read({
      op: "threads.messages",
      threadId: thread.id,
      limit: 2,
      before: loaded.before,
      beforeId: loaded.beforeId,
    }),
  ).rejects.toThrow("history cursor changed");
  expect(loaded.messages.map((message) => message.id)).toEqual(ids);
});
it("reads canonical persistent threads/history and changes presence through the actual owner domain with exact paired identity", async () => {
  const f = await fixture(),
    opened = await f.client.read({ op: "threads.open" });
  const thread = opened.thread!;
  await f.service.request(
    {
      op: "threads.append",
      threadId: thread.id,
      role: "user",
      via: "voice",
      text: "Canonical retained owner text",
      idempotencyKey: "mobile-history-proof",
    },
    "owner",
  );
  const first = await f.client.read({ op: "threads.messages", threadId: thread.id, limit: 100 });
  expect(first.thread?.id).toBe(thread.id);
  expect(first.messages?.[0]).toMatchObject({
    text: "Canonical retained owner text",
    via: "voice",
    projectIds: [],
  });
  await f.client.setPresence("away");
  expect((await f.client.inspectPresence()).presence.state).toBe("away");
  expect(f.request.mock.calls.every(([, , options]) => options.retry === false)).toBe(true);
  expect(
    f.request.mock.calls
      .filter(([method]) => method === "assistant.request")
      .map(([, params]) => params.op),
  ).toContain("presence.set");
});
it("refuses capability/environment changes before dispatch and rejects a late old-connection result without retargeting", async () => {
  const f = await fixture();
  f.setCapabilities([]);
  await expect(f.client.setPresence("dnd")).rejects.toMatchObject({ code: "unsupported" });
  expect(f.request.mock.calls.some(([m]) => m === "assistant.request")).toBe(false);
  expect(f.client.pendingPresence).toBeUndefined();
  f.setCapabilities(["assistant.v1"]);
  f.setEnvironment("another-environment");
  await expect(f.client.read({ op: "snapshot", limit: 100 })).rejects.toMatchObject({
    code: "source",
  });
  f.setEnvironment(f.store.environmentId);
  const original = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (...args) => {
    const value = await original(...args);
    if (args[0] === "assistant.request") f.setCurrent(false);
    return value;
  });
  await expect(f.client.read({ op: "snapshot", limit: 100 })).rejects.toMatchObject({
    code: "source",
  });
});
it("never retries an uncertain presence write or emits another write while its owner review is pending", async () => {
  const f = await fixture(),
    original = f.request.getMockImplementation()!;
  let lost = true;
  f.request.mockImplementation(async (...args) => {
    const value = await original(...args);
    if (args[0] === "assistant.request" && args[1].op === "presence.set" && lost) {
      lost = false;
      throw new Error("Lost reply after actual effect");
    }
    return value;
  });
  await expect(f.client.setPresence("dnd")).rejects.toThrow("Lost reply");
  expect(f.client.pendingPresence).toEqual({ state: "dnd", status: "unknown" });
  await expect(f.client.setPresence("present")).rejects.toMatchObject({ code: "uncertain" });
  expect(
    f.request.mock.calls.filter(([m, p]) => m === "assistant.request" && p.op === "presence.set"),
  ).toHaveLength(1);
  const actual = await f.client.inspectPresence();
  expect(actual.presence.state).toBe("dnd");
  expect(f.client.pendingPresence).toBeUndefined();
  expect(
    f.request.mock.calls.filter(([m, p]) => m === "assistant.request" && p.op === "presence.set"),
  ).toHaveLength(1);
});
it("retains actual server authorization and rejects malformed response data", async () => {
  const f = await fixture();
  f.setAuthorized(false);
  await expect(f.client.setPresence("away")).rejects.toThrow();
  expect((await f.service.request({ op: "snapshot" }, "owner")).snapshot!.presence.state).toBe(
    "present",
  );
  f.setAuthorized(true);
  f.request
    .mockResolvedValueOnce({ environmentId: f.store.environmentId, capabilities: ["assistant.v1"] })
    .mockResolvedValueOnce({ messages: [{ id: "untrusted", text: "No canonical metadata" }] });
  await expect(
    f.client.read({ op: "threads.messages", threadId: "actual", limit: 100 }),
  ).rejects.toMatchObject({ code: "response" });
});
