import { HostTransport, RemoteHostError } from "./transport";
import type {
  RemoteRequestOptions,
  SessionSync,
  SessionSyncChunk,
  SessionSyncResponse,
} from "./types";

const MAX_TRANSFER_UNITS = 32 * 1024 * 1024;

/** Resolve a pinned revision in bounded pieces; never silently truncate history. */
export async function resolveSessionSync(
  transport: HostTransport,
  sessionId: string,
  response: SessionSyncResponse,
  options: RemoteRequestOptions = {},
): Promise<SessionSync> {
  if (!response || typeof response !== "object")
    throw new RemoteHostError(transport.machine.id, "protocol", "Invalid session response.");
  if (response.kind !== "chunked") {
    if (!["unchanged", "snapshot", "delta"].includes(response.kind))
      throw new RemoteHostError(transport.machine.id, "protocol", "Invalid session response.");
    return response;
  }
  if (
    !Number.isSafeInteger(response.length) ||
    response.length < 1 ||
    response.length > MAX_TRANSFER_UNITS ||
    typeof response.transfer !== "string" ||
    !response.transfer
  )
    throw new RemoteHostError(
      transport.machine.id,
      "protocol",
      "This transcript exceeds the mobile transfer limit.",
    );
  const parts: string[] = [];
  let offset = 0;
  while (offset < response.length) {
    const chunk = await transport.request<SessionSyncChunk>(
      "sessions.syncChunk",
      { sessionId, transfer: response.transfer, offset },
      { ...options, retry: false },
    );
    if (
      !chunk ||
      typeof chunk.data !== "string" ||
      !chunk.data.length ||
      offset + chunk.data.length > response.length
    )
      throw new RemoteHostError(
        transport.machine.id,
        "protocol",
        "The transcript transfer is incomplete. Reload the session.",
      );
    parts.push(chunk.data);
    offset += chunk.data.length;
  }
  let parsed: SessionSyncResponse;
  try {
    parsed = JSON.parse(parts.join("")) as SessionSyncResponse;
  } catch {
    throw new RemoteHostError(
      transport.machine.id,
      "protocol",
      "Invalid transcript transfer. Reload the session.",
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !["unchanged", "snapshot", "delta"].includes(parsed.kind)
  )
    throw new RemoteHostError(
      transport.machine.id,
      "protocol",
      "Invalid transcript transfer. Reload the session.",
    );
  return parsed as SessionSync;
}
