import { HostTransport, RemoteHostError } from "./transport";
import { assertDecodeCurrent, parseJsonParts } from "@/state/cooperative-json";
import type {
  HostSession,
  HostSessionSummary,
  RemoteRequestOptions,
  SessionSync,
  SessionSyncChunk,
  SessionSyncResponse,
} from "./types";
import {
  SessionViewSchema,
  SessionSyncSchema,
  SessionsListResultSchema,
  SessionProviderSchema,
  SessionRuntimeModeSchema,
  type SessionView,
  type SubscriptionEvent,
} from "../../../src/shared/model/host-contracts";
import { applySessionSync } from "../../../src/features/connections/model/protocol";
import type { MobileStreamSubscription } from "./host-transport";
import { retainSessionAuthority } from "@/domain/session-authority";
import { SessionProjectMismatch, foldSessionProject } from "./session-project";

const MAX_TRANSFER_UNITS = 32 * 1024 * 1024;

function requireSessionRead(
  value: unknown,
  sessionId: string,
  projectId: string,
  aliasIds?: readonly string[],
): HostSession {
  return requireSessionFields(SessionViewSchema.parse(value), sessionId, projectId, aliasIds);
}

/** Identity and required-field checks for a view that already passed `SessionViewSchema` or `SessionSyncSchema`. */
function requireSessionFields(
  view: SessionView,
  sessionId: string,
  projectId: string,
  aliasIds?: readonly string[],
): HostSession {
  const parsed = foldSessionProject(view, projectId, aliasIds);
  const session = parsed.session;
  const settings = session.modelSettings;
  if (session.id === sessionId && parsed.projectId !== projectId)
    throw new SessionProjectMismatch(sessionId, projectId, parsed.projectId);
  // Field names only: the reason is logged for diagnosis and never carries content.
  const failed =
    parsed.projectId !== projectId
      ? "projectId"
      : session.id !== sessionId
        ? "session.id"
        : !Array.isArray(session.blocks)
          ? "blocks"
          : typeof session.title !== "string"
            ? "title"
            : typeof session.cwd !== "string"
              ? "cwd"
              : typeof session.model !== "string"
                ? "model"
                : !SessionProviderSchema.safeParse(session.harness).success
                  ? "harness"
                  : !SessionRuntimeModeSchema.safeParse(session.runtimeMode).success
                    ? "runtimeMode"
                    : !settings ||
                        typeof settings !== "object" ||
                        Array.isArray(settings) ||
                        Object.values(settings).some((value) => typeof value !== "string")
                      ? "modelSettings"
                      : session.blocks.some(
                            (block) =>
                              !block ||
                              typeof block !== "object" ||
                              Array.isArray(block) ||
                              typeof block.id !== "string" ||
                              typeof block.role !== "string" ||
                              typeof block.text !== "string",
                          )
                        ? "block fields"
                        : undefined;
  if (failed) {
    console.warn(`Transcript read rejected: ${failed}`);
    throw new Error("Transcript stream identity or read fields changed.");
  }
  // Inner feature extensions remain the explicitly opaque read boundary. This
  // checks required UI fields, not a claim that every Block DTO has migrated.
  return parsed as unknown as HostSession;
}

/** Pure revision fence used by the live adapter and golden behavior tests. */
export function sessionStreamValue(
  event: SubscriptionEvent,
  known: HostSession | undefined,
  sessionId: string,
  projectId: string,
  aliasIds?: readonly string[],
): HostSession | "resync" {
  let next: HostSession;
  if (event.params.kind === "snapshot")
    next = requireSessionRead(event.params.data, sessionId, projectId, aliasIds);
  else if (event.params.kind === "delta") {
    const sync = SessionSyncSchema.parse(event.params.data);
    if (sync.kind !== "delta" || !known || sync.base !== known.revision) return "resync";
    if (event.params.baseRevision !== undefined && event.params.baseRevision !== sync.base)
      throw new Error("Transcript delta base changed.");
    // `SessionSyncSchema` above already validated every field of this composite (same metadata,
    // JSON session and JSON blocks as `SessionViewSchema`), so only the identity checks run here.
    requireSessionFields(
      { ...sync.value, session: { ...sync.value.session, blocks: sync.blocks } },
      sessionId,
      projectId,
      aliasIds,
    );
    try {
      next = foldSessionProject(
        applySessionSync(known, sync as unknown as SessionSync),
        projectId,
        aliasIds,
      );
    } catch {
      return "resync";
    }
  } else return "resync";
  if (event.params.revision !== undefined && event.params.revision !== next.revision)
    throw new Error("Transcript stream revision changed.");
  return known && next.revision < known.revision ? known : retainSessionAuthority(known, next);
}

export function watchSessionStream(
  transport: HostTransport,
  options: {
    sessionId: string;
    projectId: string;
    /** Folded legacy ids of the listed project (`aliasIds` from the directory). */
    aliasIds?: () => readonly string[] | undefined;
    known(): HostSession | undefined;
    apply(value: HostSession, assertCurrent: () => void): Promise<void>;
    onError?(error: Error): void;
  },
): Promise<MobileStreamSubscription> {
  return transport.observeStream(
    { kind: "session", sessionId: options.sessionId },
    async (event, assertCurrent) => {
      assertCurrent();
      const value = sessionStreamValue(
        event,
        options.known(),
        options.sessionId,
        options.projectId,
        options.aliasIds?.(),
      );
      if (value === "resync") return "resync";
      await options.apply(value, assertCurrent);
      assertCurrent();
      return true;
    },
    options.onError,
  );
}

export function watchProjectStream(
  transport: HostTransport,
  projectId: string,
  apply: (
    value: { etag: string; sessions: HostSessionSummary[] },
    assertCurrent: () => void,
  ) => Promise<void>,
  onError?: (error: Error) => void,
): Promise<MobileStreamSubscription> {
  return transport.observeStream(
    { kind: "project", projectId },
    async (event, assertCurrent) => {
      assertCurrent();
      if (event.params.kind !== "snapshot") return "resync";
      const parsed = SessionsListResultSchema.parse(event.params.data);
      if (
        Array.isArray(parsed) ||
        !("sessions" in parsed) ||
        parsed.sessions.some((session) => session.projectId !== projectId)
      )
        throw new Error("Project stream identity changed.");
      await apply(parsed as { etag: string; sessions: HostSessionSummary[] }, assertCurrent);
      assertCurrent();
      return true;
    },
    onError,
  );
}

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
  const decodeOptions = { ...options, assertCurrent: () => transport.assertCurrentAccess() };
  try {
    parsed = (await parseJsonParts(parts, decodeOptions)) as SessionSyncResponse;
  } catch (error) {
    if (options.signal?.aborted || error instanceof RemoteHostError) throw error;
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
  assertDecodeCurrent(decodeOptions);
  return parsed as SessionSync;
}
