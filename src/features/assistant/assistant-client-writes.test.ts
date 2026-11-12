import { expect, it, vi } from "vitest";
import {
  AssistantDispatchError,
  AssistantMobileClient,
  type AssistantMobilePort,
} from "./assistant-client";

// Mobile owner writes: Room messages, job control and owner questions.
const hex = "a".repeat(64);
const question = (overrides: Record<string, unknown> = {}) => ({
  id: "q1",
  version: 3,
  jobId: "job1",
  projectIds: ["p1"],
  sourceToken: hex,
  origin: "chief",
  prompt: {
    requestId: 1,
    occurrenceId: "o1",
    behavior: "nonBlocking",
    questions: [
      {
        id: "k1",
        prompt: "Which branch?",
        multiSelect: false,
        allowCustom: true,
        options: [{ id: "a", label: "Main" }],
      },
    ],
  },
  status: "open",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});
function mockPort(
  handler: (params: Record<string, unknown>) => unknown | Promise<unknown>,
  capabilities = ["assistant.v1"],
) {
  let current = true;
  const request = vi.fn<AssistantMobilePort["request"]>(async (method, params) =>
    method === "environment.describe" ? { environmentId: "env", capabilities } : handler(params),
  );
  const client = new AssistantMobileClient({
    environmentId: "env",
    current: () => current,
    request,
  });
  const assistantCalls = () =>
    request.mock.calls
      .filter(([method]) => method === "assistant.request")
      .map(([, params]) => params);
  return { client, request, assistantCalls, setCurrent: (value: boolean) => (current = value) };
}
const intent = { threadId: "t1", text: "Ship it", key: "key-1", hostInstance: "host-1" };
const message = (role: "user" | "assistant", id: string = role) => ({
  id,
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  threadId: "t1",
  role,
  via: "text",
  text: "x",
  jobIds: [],
  projectIds: [],
});

it("sends the Room message with its exact identity and Host instance, and omits an absent session", async () => {
  const f = mockPort((params) =>
    params.op === "threads.sendIdentity"
      ? { sendIdentity: { instanceId: "host-1" } }
      : { messages: [message("user"), message("assistant")] },
  );
  expect(await f.client.sendIdentity()).toBe("host-1");
  const sent = await f.client.send(intent);
  expect(sent.map((row) => row.role)).toEqual(["user", "assistant"]);
  expect(f.assistantCalls()[1]).toEqual({
    op: "threads.send",
    via: "text",
    threadId: "t1",
    text: "Ship it",
    idempotencyKey: "key-1",
    expectedHostInstance: "host-1",
  });
  expect(f.request.mock.calls.every(([, , options]) => options.retry === false)).toBe(true);
});
it("separates failures before dispatch from an uncertain send", async () => {
  const unsupported = mockPort(() => ({}), []);
  await expect(unsupported.client.send(intent)).rejects.toMatchObject({ code: "unsupported" });
  expect(unsupported.assistantCalls()).toHaveLength(0);
  const lost = mockPort(() => {
    throw new Error("Lost reply after effect");
  });
  await expect(lost.client.send(intent)).rejects.toBeInstanceOf(AssistantDispatchError);
  expect(lost.assistantCalls()).toHaveLength(1);
  const noReply = mockPort(() => ({ messages: [message("user")] }));
  await expect(noReply.client.send(intent)).rejects.toBeInstanceOf(AssistantDispatchError);
  const late = mockPort(() => ({}));
  late.request.mockImplementation(async (method) => {
    if (method === "environment.describe")
      return { environmentId: "env", capabilities: ["assistant.v1"] };
    late.setCurrent(false);
    return { messages: [message("assistant")] };
  });
  await expect(late.client.send(intent)).rejects.toBeInstanceOf(AssistantDispatchError);
});
it("reads the receipt of an earlier send with the same identity and rejects another thread's rows", async () => {
  const f = mockPort(() => ({
    sendReceipt: { status: "settled" },
    messages: [message("assistant")],
  }));
  const result = await f.client.sendStatus({ ...intent, sessionId: "s1" });
  expect(result.status).toBe("settled");
  expect(f.assistantCalls()[0]).toEqual({
    op: "threads.sendStatus",
    threadId: "t1",
    text: "Ship it",
    sessionId: "s1",
    idempotencyKey: "key-1",
    expectedHostInstance: "host-1",
  });
  const wrong = mockPort(() => ({
    sendReceipt: { status: "settled" },
    messages: [{ ...message("assistant"), threadId: "other" }],
  }));
  await expect(wrong.client.sendStatus(intent)).rejects.toMatchObject({ code: "response" });
  const missing = mockPort(() => ({}));
  await expect(missing.client.sendStatus(intent)).rejects.toMatchObject({ code: "response" });
});
it("controls jobs with the expected version and only the three mobile actions", async () => {
  const f = mockPort((params) => ({ job: { id: params.id } }));
  // The Host response is validated; a bare id is not a canonical job.
  await expect(
    f.client.controlJob({ id: "job1", expectedVersion: 4, action: "pause" }),
  ).rejects.toMatchObject({ code: "response" });
  expect(f.assistantCalls()[0]).toEqual({
    op: "jobs.control",
    id: "job1",
    expectedVersion: 4,
    action: "pause",
  });
  await expect(
    f.client.controlJob({ id: "job1", expectedVersion: 4, action: "delete" as never }),
  ).rejects.toMatchObject({ code: "unsupported" });
  expect(f.assistantCalls()).toHaveLength(1);
});
it("requests the snapshot without optional flags", async () => {
  const f = mockPort(() => ({}));
  await f.client
    .read({ op: "snapshot", limit: 100 })
    .catch(() => {});
  expect(f.assistantCalls()[0]).toEqual({ op: "snapshot", limit: 100 });
});

const answer = {
  op: "questions.answer" as const,
  id: "q1",
  expectedVersion: 3,
  requestId: "req-1",
  answers: { k1: ["a"] },
};
const receipt = (input: unknown) => ({
  requestId: "req-1",
  kind: "answer",
  version: 4,
  at: 5,
  input,
});
it("answers an owner question once: inspects first, dispatches the saved intent, verifies the receipt", async () => {
  const open = question();
  const done = question({ version: 4, status: "answered", lastOwnerAction: receipt(answer) });
  const f = mockPort((params) =>
    params.op === "questions.get" ? { ownerQuestion: open } : { ownerQuestion: done },
  );
  const result = await f.client.deliverQuestion(open as never, answer);
  expect(result.status).toBe("answered");
  expect(f.assistantCalls().map((call) => call.op)).toEqual(["questions.get", "questions.answer"]);
  expect(f.assistantCalls()[0]).toMatchObject({ id: "q1", requestId: "req-1" });
});
it("resolves a lost answer acknowledgement from the Host receipt without dispatching it again", async () => {
  const open = question();
  const settled = question({ version: 4, status: "answered", lastOwnerAction: receipt(answer) });
  const f = mockPort(() => ({ ownerQuestion: settled }));
  await f.client.deliverQuestion(open as never, answer);
  expect(f.assistantCalls().map((call) => call.op)).toEqual(["questions.get"]);
});
it("refuses to answer a changed question and reports an unverifiable acknowledgement as uncertain", async () => {
  const open = question();
  const changed = mockPort(() => ({ ownerQuestion: question({ version: 9 }) }));
  await expect(changed.client.deliverQuestion(open as never, answer)).rejects.toMatchObject({
    code: "source",
  });
  expect(changed.assistantCalls().map((call) => call.op)).toEqual(["questions.get"]);
  const silent = mockPort(() => ({ ownerQuestion: open }));
  await expect(silent.client.deliverQuestion(open as never, answer)).rejects.toMatchObject({
    code: "uncertain",
  });
  await expect(
    silent.client.deliverQuestion(open as never, { ...answer, op: "questions.cancel" } as never),
  ).rejects.toMatchObject({ code: "unsupported" });
});
