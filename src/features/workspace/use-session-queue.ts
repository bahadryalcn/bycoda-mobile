import { queueAttachmentOwner } from "./queue-attachment-ownership";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { hostKey, useHostClient, useHostQuery } from "@/state/queries";
import type { SharedQueue } from "../../../../src/features/connections/model/sharedQueue";
import type { QueuedMessage } from "../../../../src/features/sessions/model/session";
import type { SessionScope } from "./session-types";

// One consumer identity per app process. Restarting never resumes an unattended queue.
const mobileQueueClient = `mobile:${randomUUID()}`;
type QueueChange = (queue: SharedQueue) => SharedQueue;

export function useSessionQueue(scope: SessionScope) {
  const client = useHostClient();
  const cache = useQueryClient();
  const supported = !!client?.machine.capabilities?.includes("sessions.queue");
  const params = { sessionId: scope.sessionId, clientId: mobileQueueClient };
  const query = useHostQuery<SharedQueue>(
    ["session-queue", scope.sessionId],
    "sessions.queue.get",
    params,
    {
      enabled: supported,
      interval: 2500,
      queryFn: (target, signal) => queueAttachmentOwner(target, scope.sessionId).request(target, "sessions.queue.get", params, { signal }),
    },
  );
  const key = hostKey(scope.machineId, [
    "session-queue",
    scope.sessionId,
    {
      method: "sessions.queue.get",
      params,
    },
  ]);
  const inFlight = useRef(false);
  const change = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: async ({
      update,
      takeOwnership = false,
    }: {
      update: QueueChange;
      takeOwnership?: boolean;
    }) => {
      if (!client || client.machine.id !== scope.machineId || !supported || inFlight.current)
        throw new Error("The queue is unavailable. Refresh it before making changes.");
      inFlight.current = true;
      try {
        // A failed baseline read blocks edits; cached rows are never assumed authoritative.
        const before = await queueAttachmentOwner(client, scope.sessionId).request(client, "sessions.queue.get", params);
        if (before.claim)
          throw new Error("Wait for the queued send to finish before changing the queue.");
        const after = update(before);
        return await queueAttachmentOwner(client, scope.sessionId).request(client,
          "sessions.queue.change",
          {
            ...params,
            before,
            after,
            takeOwnership,
          },
          { retry: false },
        );
      } finally {
        inFlight.current = false;
      }
    },
    onSuccess: (queue) => cache.setQueryData(key, queue),
    onSettled: () => {
      void query.refetch();
    },
  });
  const mutate = (update: QueueChange, takeOwnership = false) =>
    change.mutateAsync({ update, takeOwnership });
  return {
    ...query,
    supported,
    clientId: mobileQueueClient,
    retainEdit: async (row: QueuedMessage) => {
      if (!client) throw new Error("Connect before preserving the queued edit.");
      await queueAttachmentOwner(client, scope.sessionId).retainEdit(client, row);
    },
    persistedEdit: async () => {
      if (client) await queueAttachmentOwner(client, scope.sessionId).persistedEdit(client);
    },
    changing: change.isPending,
    changeError: change.error,
    change: mutate,
    enqueue: async (row: QueuedMessage) => {
      try {
        return await mutate((queue) => ({
          ...queue,
          // Retry the same row id after an interrupted acknowledgement without duplicating it.
          messages: queue.messages.some((entry) => entry.id === row.id)
            ? queue.messages
            : [...queue.messages, row],
          status: queue.status ?? "paused",
        }));
      } catch (error) {
        // A read can prove that an append reached the host despite a lost response.
        const latest = await query.refetch();
        if (!latest.error && latest.data?.messages.some((entry) => entry.id === row.id))
          return latest.data;
        throw error;
      }
    },
    pause: () =>
      mutate((queue) => ({ ...queue, status: queue.messages.length ? "paused" : undefined })),
    activate: () => mutate((queue) => ({ ...queue, status: "active", editingId: undefined }), true),
  };
}
