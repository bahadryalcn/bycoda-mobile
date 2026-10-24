import { useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { useHostClient } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { useLocalDraft } from "../workspace/use-local-draft";
import type { InboxItemInput, InboxOrigin } from "./provider-protocol";
import type {
  RemoteInboxItem,
  RemoteInboxReview,
} from "../../../../src/features/inbox/model/remoteInbox";
import { isInboxOriginCurrent } from "./provider-model";
import { InboxJobError, runInboxJob } from "./provider-jobs";
import {
  decodePrReviewDraft,
  emptyPrReviewDraft,
  encodePrReviewDraft,
  prReviewDraftKey,
  reviewedPrReceipt,
  sameReviewedPrDraft,
  settlePrReviewDraft,
} from "./provider-review-draft";
import { reviewedPrSubmission } from "./provider-review-model";

/** One durable draft owns summary, anchors, reviewed head and the pending attempt. */
export function usePrReviewDelivery(
  origin: InboxOrigin,
  item: RemoteInboxItem,
  input: InboxItemInput,
) {
  const client = useHostClient();
  const draft = useLocalDraft(
    prReviewDraftKey(origin, item),
    decodePrReviewDraft,
    encodePrReviewDraft,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const occupied = useRef(false);
  const mounted = useRef(true);
  const opening = useRef(reviewedMachine(client?.machine));
  const value = draft.value ?? emptyPrReviewDraft();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () =>
    !!client &&
    client.machine.id === origin.machineId &&
    isInboxOriginCurrent(origin, useMachines.getState()) &&
    isReviewedMachine(opening.current, useMachines.getState());
  const settle = async (requestId: string, state: "completed" | "failed") => {
    if (!mounted.current) return;
    draft.setValue((latest) =>
      latest ? settlePrReviewDraft(latest, requestId, { id: requestId, state }) : latest,
    );
    await draft.persist();
  };
  const reconcile = async () => {
    const pending = draft.valueRef.current?.pending;
    if (!pending || occupied.current || !current() || !client) return;
    occupied.current = true;
    setBusy(true);
    setError(null);
    try {
      if (pending.environmentId !== client.machine.environmentId)
        throw new Error("The saved review belongs to another computer identity");
      const receipt = reviewedPrReceipt(
        await client.request("inbox.provider.result", { requestId: pending.requestId }),
      );
      if (["completed", "failed"].includes(receipt.state)) {
        await settle(pending.requestId, receipt.state as "completed" | "failed");
        if (receipt.state === "failed")
          throw new InboxJobError(receipt.error ?? "The review failed", false, true);
      } else
        throw new InboxJobError(
          "The review outcome is unconfirmed. Check its receipt before creating another review.",
          true,
        );
    } catch (cause) {
      if (mounted.current) setError(cause);
    } finally {
      occupied.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (draft.ready && value.pending) void reconcile();
  }, [draft.ready, value.pending?.requestId, client]);
  const submit = async (review: RemoteInboxReview) => {
    if (
      occupied.current ||
      !draft.ready ||
      draft.error ||
      !current() ||
      !client ||
      !client.machine.capabilities?.includes("inbox.review.v1") ||
      draft.valueRef.current?.pending ||
      draft.valueRef.current?.completed
    )
      return;
    occupied.current = true;
    setBusy(true);
    setError(null);
    let requestId: string | undefined;
    let dispatched = false;
    try {
      if (!sameReviewedPrDraft(draft.valueRef.current, review))
        throw new Error("The review draft changed. Confirm the current content before submitting.");
      // Re-read the head immediately before writing. Native owner approval and
      // provider-side head validation remain authoritative after this check.
      const latest = await runInboxJob(client, { action: "review-context", input });
      if (!current()) throw new Error("The inbox origin changed");
      if (latest.commitId !== review.commitId)
        throw new Error("The pull request head changed. Review the current diff before sending.");
      const checked = reviewedPrSubmission(latest, review.event, review.body, review.comments);
      if (!sameReviewedPrDraft(draft.valueRef.current, review))
        throw new Error("The review draft changed. Confirm the current content before submitting.");
      requestId = randomUUID();
      const saved = {
        ...(draft.valueRef.current ?? emptyPrReviewDraft()),
        ...checked,
        pending: { requestId, environmentId: client.machine.environmentId },
      };
      draft.setValue(saved);
      await draft.persist(); // An unread/failed store must prevent transport.
      if (!current() || !mounted.current) {
        const retained = { ...saved, pending: undefined };
        if (mounted.current) draft.setValue(retained);
        await draft.persist(retained);
        return;
      }
      dispatched = true;
      await runInboxJob(
        client,
        { action: "review", input: { ...input, ...checked, confirm: "SUBMIT_PR_REVIEW" } },
        undefined,
        requestId,
      );
      await settle(requestId, "completed");
    } catch (cause) {
      // A storage/preflight failure before transport is a known non-send.
      // Once dispatch starts, only a known terminal receipt can clear pending.
      if (requestId && !dispatched && mounted.current) {
        draft.setValue((latest) =>
          latest && latest.pending?.requestId === requestId
            ? { ...latest, pending: undefined }
            : latest,
        );
        await draft.persist().catch(() => {});
      }
      if (requestId && cause instanceof InboxJobError && cause.terminal)
        await settle(requestId, "failed");
      if (mounted.current) setError(cause);
    } finally {
      occupied.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { draft, value, busy, error, submit, reconcile };
}
