import { useInboxLocalScope } from "./inbox-local-scope";
import { useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { useHostClient } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { useLocalDraft } from "../workspace/use-local-draft";

import { InboxJobError, runInboxJob } from "./provider-jobs";
import { reviewedPrReceipt } from "./provider-review-draft";
import { readJiraWriteOutcome, type JiraWriteOutcome } from "./jira-board-model";
import type { InboxJobRequest, InboxOrigin } from "./provider-protocol";
type Command = InboxJobRequest<"jira-board-transition" | "jira-board-move">;
type Pending = { requestId: string; environmentId: string; command: Command };
type Draft = { version: 1; pending?: Pending };
const encode = (value: Draft | null) => (value?.pending ? JSON.stringify(value) : null);
export function decodeJiraPending(raw: string): Draft {
  if (raw.length > 8000) throw new Error("Invalid saved Jira request");
  const value = JSON.parse(raw) as Draft,
    pending = value?.pending;
  if (
    value?.version !== 1 ||
    !pending ||
    typeof pending.requestId !== "string" ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(pending.requestId) ||
    typeof pending.environmentId !== "string" ||
    !pending.environmentId ||
    pending.environmentId.length > 200 ||
    !["jira-board-transition", "jira-board-move"].includes(pending.command?.action) ||
    typeof pending.command.input?.projectId !== "string" ||
    typeof pending.command.input?.key !== "string" ||
    typeof pending.command.input?.snapshotId !== "string" ||
    pending.command.input.confirm !== "CHANGE_JIRA_BOARD"
  )
    throw new Error("Invalid saved Jira request");
  return value;
}
export function useJiraBoardDelivery(
  origin: InboxOrigin,
  boardId: number,
  /** Called once when a confirmed outcome is committed, where it settles. */
  onSettled?: (outcome: JiraWriteOutcome) => void,
) {
  const inboxScope = useInboxLocalScope();
  const client = useHostClient(),
    draft = useLocalDraft(
      `bycoda.mobile.jira-pending.v1:${JSON.stringify([origin.machineId, origin.projectId, boardId])}`,
      decodeJiraPending,
      encode,
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [result, setResult] = useState<JiraWriteOutcome | null>(null);
  const occupied = useRef(false),
    mounted = useRef(true),
    settledHandler = useRef(onSettled);
  settledHandler.current = onSettled;
  const opening = useRef(reviewedMachine(client?.machine));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () =>
    !!client &&
    client.machine.id === origin.machineId &&
    inboxScope.matches(origin) &&
    isReviewedMachine(opening.current, useMachines.getState());
  const settle = async (requestId: string, outcome?: JiraWriteOutcome) => {
    if (!mounted.current) return;
    draft.setValue((latest) =>
      latest?.pending?.requestId === requestId ? { version: 1 } : latest,
    );
    await draft.persist();
    if (!outcome) return;
    setResult(outcome);
    settledHandler.current?.(outcome);
  };
  const reconcile = async () => {
    const pending = draft.valueRef.current?.pending;
    if (!pending || occupied.current || !client || !current()) return;
    occupied.current = true;
    setBusy(true);
    setError(null);
    try {
      if (pending.environmentId !== client.machine.environmentId)
        throw new Error("The saved Jira action belongs to another computer identity");
      const receipt = reviewedPrReceipt(
        await client.request("inbox.provider.result", { requestId: pending.requestId }),
      );
      if (receipt.state === "completed")
        await settle(pending.requestId, readJiraWriteOutcome(receipt.result));
      else if (receipt.state === "failed") {
        await settle(pending.requestId);
        throw new InboxJobError(receipt.error ?? "The Jira request did not start", false, true);
      } else
        throw new InboxJobError(
          "The Jira action outcome is unconfirmed. Check its existing receipt before another action.",
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
    if (draft.ready && draft.value?.pending) void reconcile();
  }, [draft.ready, draft.value?.pending?.requestId, client]);
  const submit = async (command: Command) => {
    if (
      !draft.ready ||
      draft.error ||
      occupied.current ||
      draft.valueRef.current?.pending ||
      result ||
      !client ||
      !current() ||
      !client.machine.capabilities?.includes("inbox.jiraBoard.v1") ||
      command.input.projectId !== origin.projectId
    )
      return;
    occupied.current = true;
    setBusy(true);
    setError(null);
    const requestId = randomUUID();
    let dispatched = false;
    const retained: Draft = {
      version: 1,
      pending: { requestId, environmentId: client.machine.environmentId, command },
    };
    try {
      draft.setValue(retained);
      await draft.persist();
      if (!current() || !mounted.current) {
        if (mounted.current) draft.setValue({ version: 1 });
        await draft.persist({ version: 1 });
        return;
      }
      dispatched = true;
      const outcome = await runInboxJob(client, command, undefined, requestId);
      await settle(requestId, outcome);
    } catch (cause) {
      if (!dispatched && mounted.current) {
        draft.setValue({ version: 1 });
        await draft.persist().catch(() => {});
      } else if (cause instanceof InboxJobError && cause.terminal) await settle(requestId);
      if (mounted.current) setError(cause);
    } finally {
      occupied.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { draft, busy, error, result, submit, reconcile };
}
