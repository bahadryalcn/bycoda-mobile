import type {
  HostRequest,
  Block,
  CommandReceipt,
  HostCommand,
  HostSession,
  HostSessionSummary,
  RemoteRequestOptions,
  RemoteTranscriptPage,
  SessionListResult,
  SessionSyncResponse,
  TranscriptPage,
} from "../types";
import { HostTransport, RemoteHostError } from "../transport";
import {
  applySessionSync,
  requestPartialSync,
} from "../../../../src/features/connections/model/protocol";
import { resolveSessionSync } from "../session-sync";
import { retainSessionAuthority } from "@/domain/session-authority";

export function createSessionsApi(transport: HostTransport, request: HostRequest) {
  return {
    sessions: {
      list: (projectId: string, options?: RemoteRequestOptions) =>
        request<HostSessionSummary[]>("sessions.list", { projectId }, options),
      listChanges: (projectId: string, known: string, options?: RemoteRequestOptions) =>
        request<SessionListResult>("sessions.list", { projectId, known }, options),
      get: (sessionId: string, revision?: number, options?: RemoteRequestOptions) =>
        request<HostSession | null>("sessions.get", { sessionId, revision }, options),
      page: async (
        sessionId: string,
        before?: number,
        revision?: number,
        options?: RemoteRequestOptions,
      ): Promise<TranscriptPage> => {
        const page = await request<RemoteTranscriptPage>(
          "sessions.page",
          { sessionId, before, revision, preview: true },
          options,
        );
        const sync = await resolveSessionSync(transport, sessionId, page.sync, options);
        if (sync.kind !== "snapshot")
          throw new RemoteHostError(
            transport.machine.id,
            "protocol",
            "The host returned an invalid transcript page.",
          );
        return {
          value: sync.value,
          before: page.before,
          totalBlocks: page.totalBlocks,
          revision: page.revision,
        };
      },
      synchronize: async (
        sessionId: string,
        known?: HostSession,
        options?: RemoteRequestOptions,
        waitMs = 0,
      ): Promise<HostSession> => {
        const send = async (loadedBlockIds?: string[]) =>
          resolveSessionSync(
            transport,
            sessionId,
            await request<SessionSyncResponse>(
              "sessions.sync",
              {
                sessionId,
                revision: known?.revision,
                waitMs,
                ...(loadedBlockIds ? { partial: true, loadedBlockIds } : {}),
              },
              options,
            ),
            options,
          );
        const sync = known?.history ? await requestPartialSync(known, send) : await send();
        try {
          return retainSessionAuthority(known, applySessionSync(known, sync));
        } catch {
          throw new RemoteHostError(
            transport.machine.id,
            "protocol",
            "The transcript changed. Reload its latest history page.",
          );
        }
      },
      block: async (
        sessionId: string,
        blockId: string,
        revision: number,
        options?: RemoteRequestOptions,
      ): Promise<Block> => {
        const response = await request<SessionSyncResponse>(
          "sessions.block",
          { sessionId, blockId, revision },
          options,
        );
        const sync = await resolveSessionSync(transport, sessionId, response, options);
        const block =
          sync.kind === "snapshot"
            ? sync.value.session.blocks.find((entry) => entry.id === blockId)
            : undefined;
        if (!block)
          throw new RemoteHostError(
            transport.machine.id,
            "protocol",
            "The transcript block could not be loaded.",
          );
        return block;
      },
      dispatch: (command: HostCommand, options?: RemoteRequestOptions) =>
        request<CommandReceipt>("commands.dispatch", { ...command }, options),
      commandStatus: (commandId: string, options?: RemoteRequestOptions) =>
        request<CommandReceipt | null>("commands.status", { commandId }, options),
      update: (
        projectId: string,
        sessionId: string,
        patch: {
          title?: string;
          archived?: boolean;
          pinned?: boolean;
          unread?: boolean;
          snoozedUntil?: number | null;
          expectedRevision?: number;
          authorityGeneration?: number;
        },
        options?: RemoteRequestOptions,
      ) => request<HostSession>("sessions.update", { projectId, sessionId, ...patch }, options),
      delete: (
        projectId: string,
        sessionId: string,
        options?: RemoteRequestOptions,
        authorityGeneration?: number,
      ) =>
        request<{ deleted: true }>(
          "sessions.delete",
          { projectId, sessionId, authorityGeneration },
          options,
        ),
    },
  };
}
