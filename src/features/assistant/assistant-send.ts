import {
  AssistantDispatchError,
  type AssistantMobileClient,
  type AssistantSendIntent,
} from "./assistant-client";
import type { AssistantMessage } from "../../../../src/shared/model/host-contracts/assistant";

type SendStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
type SendClient = Pick<AssistantMobileClient, "sendIdentity" | "send" | "sendStatus">;
const pendingSends = new Set<string>();
export const isAssistantSendPending = (key: string) => pendingSends.has(key);
/** A recorded send. "sending" survives an app kill and is read back as unconfirmed. */
export type StoredSend = AssistantSendIntent & { status: "sending" | "unknown" };
export type SendOutcome =
  | { kind: "settled"; messages: AssistantMessage[] }
  | { kind: "unknown" }
  | { kind: "refused" };

/** Receipts are operation state, not a draft, so draft cleanup must not remove them. */
export const assistantSendKey = (machineId: string, environmentId: string, threadId: string) =>
  `bycoda.mobile.assistant-send.v1:${JSON.stringify([machineId, environmentId, threadId])}`;

export async function readStoredSend(
  storage: SendStorage,
  key: string,
): Promise<StoredSend | null> {
  const raw = await storage.getItem(key);
  if (raw === null) return null;
  const value = JSON.parse(raw) as Partial<StoredSend>;
  if (
    typeof value.text !== "string" ||
    !value.text ||
    typeof value.key !== "string" ||
    typeof value.hostInstance !== "string" ||
    typeof value.threadId !== "string" ||
    (value.sessionId !== undefined && typeof value.sessionId !== "string") ||
    (value.status !== "sending" && value.status !== "unknown")
  )
    throw new Error("The saved message record could not be read.");
  return value as StoredSend;
}
const strip = ({ status: _status, ...intent }: StoredSend): AssistantSendIntent => intent;

/**
 * Records the identity before dispatch. Anything that fails before the Host could have seen the
 * request leaves nothing behind; anything after it keeps the record for an explicit check.
 */
export async function sendRoomMessage(input: {
  client: SendClient;
  storage: SendStorage;
  storageKey: string;
  threadId: string;
  text: string;
  sessionId?: string;
  createId: () => string;
}): Promise<SendOutcome> {
  if (pendingSends.has(input.storageKey)) throw new Error("An assistant message is already being sent.");
  pendingSends.add(input.storageKey);
  try {
  if (await input.storage.getItem(input.storageKey))
    throw new Error("The previous message is unconfirmed. Check it before sending again.");
  const hostInstance = await input.client.sendIdentity();
  const record: StoredSend = {
    threadId: input.threadId,
    text: input.text,
    key: input.createId(),
    hostInstance,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    status: "sending",
  };
  await input.storage.setItem(input.storageKey, JSON.stringify(record));
  try {
    const messages = await input.client.send(strip(record));
    await input.storage.removeItem(input.storageKey).catch(() => {});
    return { kind: "settled", messages };
  } catch (error) {
    if (error instanceof AssistantDispatchError) {
      await input.storage
        .setItem(input.storageKey, JSON.stringify({ ...record, status: "unknown" }))
        .catch(() => {});
      return { kind: "unknown" };
    }
    await input.storage.removeItem(input.storageKey).catch(() => {});
    throw error;
  }
  } finally { pendingSends.delete(input.storageKey); }
}

/** Reads the Host receipt of the recorded send; only a definite result clears the record. */
export async function checkRoomMessage(input: {
  client: SendClient;
  storage: SendStorage;
  storageKey: string;
}): Promise<SendOutcome> {
  const record = await readStoredSend(input.storage, input.storageKey);
  if (!record) throw new Error("There is no unconfirmed message to check.");
  const { status, messages } = await input.client.sendStatus(strip(record));
  if (status === "settled") {
    await input.storage.removeItem(input.storageKey);
    return { kind: "settled", messages };
  }
  if (status === "refused" || status === "notSent") {
    await input.storage.removeItem(input.storageKey);
    return { kind: "refused" };
  }
  return { kind: "unknown" };
}
