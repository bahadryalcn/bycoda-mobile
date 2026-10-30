import { queueAttachmentOwner } from "./queue-attachment-ownership";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { hostKey, useHostClient, useHostQuery } from "@/state/queries";
import type { SharedQueue } from "../../../../src/features/connections/model/sharedQueue";
import type { QueuedMessage } from "../../../../src/features/sessions/model/session";
import type { SessionScope } from "./session-types";
import { queuedDeliveryUnknown } from "./composer-delivery";
import { appendMobileQueue, freshMobileQueue, mobileDrainsQueue } from "./queue-delivery";

// One consumer identity per app process. Restarting never resumes an unattended queue.
const mobileQueueClient = `mobile:${randomUUID()}`;
type QueueChange = (queue: SharedQueue) => SharedQueue;

export function useSessionQueue(scope: SessionScope) {
  const client = useHostClient();
  const cache = useQueryClient();
  const supported = !!client?.machine.capabilities?.includes("sessions.queue");
  const leaseAware = !!client?.machine.capabilities?.includes("sessions.queue.lease");
  const params = {
    sessionId: scope.sessionId,
    clientId: mobileQueueClient,
    ...(leaseAware ? { leaseAware: true } : {}),
  };
  // The visible queue owns the drain loop; an accepted fresh enqueue turns it on.
  const [automatic, setAutomatic] = useState(false);
  const query = useHostQuery<SharedQueue>(
    ["session-queue", scope.sessionId],
    "sessions.queue.get",
    params,
    {
      enabled: supported,
      interval: 2500,
      queryFn: (target, signal) =>
        queueAttachmentOwner(target, scope.sessionId).request(
          target,
          "sessions.queue.get",
          params,
          { signal },
        ),
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
      startFresh = false,
      legacyOwnership = false,
    }: {
      update: QueueChange;
      takeOwnership?: boolean;
      startFresh?: boolean;
      legacyOwnership?: boolean;
    }) => {
      if (!client || client.machine.id !== scope.machineId || !supported || inFlight.current)
        throw new Error("The queue is unavailable. Refresh it before making changes.");
      inFlight.current = true;
      try {
        // A failed baseline read blocks edits; cached rows are never assumed authoritative.
        const requestParams =
          leaseAware && (legacyOwnership || takeOwnership)
            ? { ...params, leaseAware: false }
            : params;
        const before = await queueAttachmentOwner(client, scope.sessionId).request(
          client,
          "sessions.queue.get",
          requestParams,
        );
        if (before.claim)
          throw new Error("Wait for the queued send to finish before changing the queue.");
        const after = update(before);
        return await queueAttachmentOwner(client, scope.sessionId).request(
          client,
          "sessions.queue.change",
          {
            ...requestParams,
            before,
            after,
            takeOwnership: takeOwnership || (startFresh && !leaseAware && freshMobileQueue(before)),
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
    leaseAware,
    automatic,
    setAutomatic,
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
      const accepted = (queue: SharedQueue) => {
        if (mobileDrainsQueue(queue, mobileQueueClient)) setAutomatic(true);
        return queue;
      };
      try {
        return accepted(
          await change.mutateAsync({
            update: (queue) => appendMobileQueue(queue, row),
            startFresh: true,
          }),
        );
      } catch (error) {
        // A read can prove that an append reached the host despite a lost response.
        const latest = await query.refetch();
        if (!latest.error && latest.data?.messages.some((entry) => entry.id === row.id))
          return accepted(latest.data);
        throw error;
      }
    },
    pause: () =>
      mutate((queue) => ({ ...queue, status: queue.messages.length ? "paused" : undefined })),
    activate: () =>
      mutate((queue) => {
        if (queue.messages.some((row) => row.deliveryUnknown))
          throw new Error(queuedDeliveryUnknown);
        return { ...queue, status: "active", editingId: undefined };
      }, !leaseAware),
    // Send-next retains its one-message contract by taking legacy ownership for this
    // explicit send only. A live desktop lease still fences it at the host.
    activateForSend: () =>
      change.mutateAsync({
        update: (queue) => {
          if (queue.messages.some((row) => row.deliveryUnknown))
            throw new Error(queuedDeliveryUnknown);
          return { ...queue, status: "active", editingId: undefined };
        },
        takeOwnership: true,
        legacyOwnership: true,
      }),
  };
}
