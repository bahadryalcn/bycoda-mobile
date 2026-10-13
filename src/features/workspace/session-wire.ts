import { applySessionSync } from "../../../../src/features/connections/model/protocol";
import type {
  HostSession,
  SessionSync,
  SessionSyncResponse,
  Requester,
  RequestOptions,
  SessionPage,
  SessionChunk,
} from "./wire-types";

const MAX_TRANSFER = 16 * 1024 * 1024;

/** Chunk offsets count UTF-16 units, exactly as the host transfer store does. */
export async function resolveSync(
  client: Requester,
  sessionId: string,
  response: SessionSyncResponse,
  options: RequestOptions = {},
): Promise<SessionSync> {
  if (response.kind !== "chunked") return response;
  if (
    !Number.isSafeInteger(response.length) ||
    response.length <= 0 ||
    response.length > MAX_TRANSFER ||
    !response.transfer
  ) {
    throw new Error("Transcript transfer exceeds the mobile limit.");
  }
  const parts: string[] = [];
  let offset = 0;
  while (offset < response.length) {
    const chunk = await client.request<SessionChunk>(
      "sessions.syncChunk",
      { sessionId, transfer: response.transfer, offset },
      options,
    );
    if (
      typeof chunk.data !== "string" ||
      !chunk.data.length ||
      offset + chunk.data.length > response.length
    ) {
      throw new Error("Transcript transfer is incomplete.");
    }
    parts.push(chunk.data);
    offset += chunk.data.length;
  }
  const sync = JSON.parse(parts.join("")) as SessionSync;
  if (!sync || !["snapshot", "delta", "unchanged"].includes(sync.kind))
    throw new Error("Invalid transcript response.");
  return sync;
}

export async function readTail(
  client: Requester,
  sessionId: string,
  options: RequestOptions = {},
): Promise<HostSession> {
  const page = await client.request<SessionPage>(
    "sessions.page",
    { sessionId, preview: true },
    options,
  );
  const sync = await resolveSync(client, sessionId, page.sync, options);
  if (sync.kind !== "snapshot" || sync.value.session.id !== sessionId)
    throw new Error("Transcript identity changed.");
  return sync.value;
}

export async function readSession(
  client: Requester,
  sessionId: string,
  known?: HostSession,
  options: RequestOptions = {},
): Promise<HostSession> {
  if (!known) return readTail(client, sessionId, options);
  const response = await client.request<SessionSyncResponse>(
    "sessions.sync",
    {
      sessionId,
      revision: known.revision,
      preview: true,
      ...(known.history
        ? { partial: true, loadedBlockIds: known.session.blocks.map((block) => block.id) }
        : {}),
    },
    options,
  );
  const sync = await resolveSync(client, sessionId, response, options);
  if (sync.kind !== "unchanged" && sync.value.session.id !== sessionId)
    throw new Error("Transcript identity changed.");
  try {
    return applySessionSync(known, sync);
  } catch {
    return readTail(client, sessionId, options);
  }
}

export async function readEarlier(
  client: Requester,
  known: HostSession,
  options: RequestOptions = {},
): Promise<HostSession> {
  if (known.history?.before === undefined) return known;
  const page = await client.request<SessionPage>(
    "sessions.page",
    {
      sessionId: known.session.id,
      before: known.history.before,
      revision: known.revision,
      preview: true,
    },
    options,
  );
  const sync = await resolveSync(client, known.session.id, page.sync, options);
  if (
    sync.kind !== "snapshot" ||
    sync.value.session.id !== known.session.id ||
    sync.value.revision !== known.revision
  ) {
    throw new Error("Transcript changed; refresh before loading earlier messages.");
  }
  const ids = new Set(known.session.blocks.map((block) => block.id));
  return {
    ...known,
    history: sync.value.history,
    session: {
      ...known.session,
      blocks: [
        ...sync.value.session.blocks.filter((block) => !ids.has(block.id)),
        ...known.session.blocks,
      ],
    },
  };
}
