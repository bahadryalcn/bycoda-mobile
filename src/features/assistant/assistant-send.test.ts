import { expect, it, vi } from "vitest";
import { AssistantDispatchError, AssistantMobileError } from "./assistant-client";
import { assistantSendKey, checkRoomMessage, sendRoomMessage } from "./assistant-send";

const key = assistantSendKey("machine", "env", "thread");
function memory() {
  const rows = new Map<string, string>();
  return {
    rows,
    getItem: async (name: string) => rows.get(name) ?? null,
    setItem: async (name: string, value: string) => void rows.set(name, value),
    removeItem: async (name: string) => void rows.delete(name),
  };
}
const lostSend = () =>
  vi.fn(async () => {
    throw new AssistantDispatchError(new Error("lost"));
  });
function client(overrides: Record<string, unknown> = {}) {
  return {
    sendIdentity: vi.fn(async () => "host-1"),
    send: vi.fn(async () => [{ id: "a", role: "assistant" }] as never),
    sendStatus: vi.fn(async () => ({ status: "settled" as string, messages: [] })),
    ...overrides,
  };
}
const base = (storage: ReturnType<typeof memory>, c: ReturnType<typeof client>) => ({
  client: c as never,
  storage,
  storageKey: key,
  threadId: "thread",
  text: "Hello",
  createId: () => "id-1",
});
const identity = { threadId: "thread", text: "Hello", key: "id-1", hostInstance: "host-1" };

it("records the send identity before dispatch and clears it once the reply is confirmed", async () => {
  const storage = memory();
  const c = client();
  c.send.mockImplementationOnce(async () => {
    expect(JSON.parse(storage.rows.get(key)!)).toMatchObject({ ...identity, status: "sending" });
    return [{ id: "a", role: "assistant" }] as never;
  });
  expect((await sendRoomMessage(base(storage, c))).kind).toBe("settled");
  expect(storage.rows.has(key)).toBe(false);
  expect(c.send).toHaveBeenCalledWith(identity);
});
it("keeps an uncertain send and refuses another one under a new ID until it is checked", async () => {
  const storage = memory();
  const c = client({ send: lostSend() });
  expect((await sendRoomMessage(base(storage, c))).kind).toBe("unknown");
  expect(JSON.parse(storage.rows.get(key)!)).toMatchObject({ key: "id-1", status: "unknown" });
  await expect(sendRoomMessage({ ...base(storage, c), createId: () => "id-2" })).rejects.toThrow(
    "unconfirmed",
  );
  expect(c.send).toHaveBeenCalledTimes(1);
});
it("leaves nothing behind when the failure happens before the Host could see the request", async () => {
  const storage = memory();
  const c = client({
    send: vi.fn(async () => {
      throw new AssistantMobileError("unsupported");
    }),
  });
  await expect(sendRoomMessage(base(storage, c))).rejects.toMatchObject({ code: "unsupported" });
  expect(storage.rows.size).toBe(0);
  const early = client({
    sendIdentity: vi.fn(async () => {
      throw new AssistantMobileError("source");
    }),
  });
  await expect(sendRoomMessage(base(storage, early))).rejects.toMatchObject({ code: "source" });
  expect(early.send).not.toHaveBeenCalled();
});
it("checks the original receipt: settled and refused clear it, unknown and errors keep it", async () => {
  const storage = memory();
  await sendRoomMessage(base(storage, client({ send: lostSend() })));
  const check = (status: string) =>
    checkRoomMessage({
      client: client({ sendStatus: vi.fn(async () => ({ status, messages: [] })) }) as never,
      storage,
      storageKey: key,
    });
  expect((await check("unknown")).kind).toBe("unknown");
  expect(storage.rows.has(key)).toBe(true);
  const failing = client({
    sendStatus: vi.fn(async () => {
      throw new Error("The original Host instance changed.");
    }),
  });
  await expect(
    checkRoomMessage({ client: failing as never, storage, storageKey: key }),
  ).rejects.toThrow("instance changed");
  expect(storage.rows.has(key)).toBe(true);
  const settled = client();
  expect(
    (await checkRoomMessage({ client: settled as never, storage, storageKey: key })).kind,
  ).toBe("settled");
  expect(settled.sendStatus).toHaveBeenCalledWith(identity);
  expect(storage.rows.has(key)).toBe(false);
  await sendRoomMessage(base(storage, client({ send: lostSend() })));
  expect((await check("refused")).kind).toBe("refused");
  expect(storage.rows.has(key)).toBe(false);
});
