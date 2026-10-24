import { useEffect, useRef, useState } from "react";
import { randomUUID, digestStringAsync, CryptoDigestAlgorithm } from "expo-crypto";
import { useHostClient } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { reviewedMachine, isReviewedMachine } from "@/state/reviewed-machine";
import { useLocalDraft } from "../workspace/use-local-draft";
import type { SessionScope } from "../workspace/session-types";
import {
  decodeAccountDraft,
  encodeAccountDraft,
  validateAccountChange,
  type AccountMetadataChange,
} from "./provider-account-draft";
import { readAccountMetadataStatus, type AccountMetadataStatus } from "./provider-account-status";
import type { DesktopManagementReport } from "./provider-desktop-model";
export function useProviderAccountDelivery(
  scope: SessionScope,
  projectId: string,
  report: DesktopManagementReport,
  account: DesktopManagementReport["accounts"][number],
) {
  const client = useHostClient();
  const opening = useRef(reviewedMachine(client?.machine));
  const mounted = useRef(true),
    occupied = useRef(false);
  const draft = useLocalDraft(
    `bycoda.accountMetadata.v1:${JSON.stringify([scope.machineId, projectId, scope.sessionId, account.provider, account.id])}`,
    decodeAccountDraft,
    encodeAccountDraft,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [receipt, setReceipt] = useState<AccountMetadataStatus>();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (draft.ready && (!draft.valueRef.current || draft.valueRef.current.finished))
      draft.setValue({ kind: "rename", label: account.label, color: account.color });
  }, [draft.ready]);
  const current = () =>
    mounted.current &&
    !!client &&
    client.machine.id === scope.machineId &&
    client.machine.environmentId === report.environmentId &&
    isReviewedMachine(opening.current, useMachines.getState()) &&
    (client.machine.capabilities?.includes("providers.desktop.metadata.v1") ||
      client.machine.capabilities?.includes("providers.desktop.quotaRefresh.v1"));
  const targetDigest = () =>
    digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(opening.current));
  const settle = async (result: AccountMetadataStatus) => {
    if (!current()) return;
    setReceipt(result);
    if (result.state !== "unknown") {
      draft.setValue((latest) =>
        latest?.pending?.operationId === result.operationId
          ? { ...latest, pending: undefined, finished: true }
          : latest,
      );
      await draft.persist();
    }
  };
  const reconcile = async () => {
    const pending = draft.valueRef.current?.pending;
    if (
      occupied.current ||
      !pending ||
      !current() ||
      !client ||
      pending.environmentId !== report.environmentId
    )
      return;
    occupied.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (pending.targetDigest !== (await targetDigest()))
        throw Error("The saved operation belongs to another paired computer identity");
      if (!current()) return;
      const value = await client.request("providers.desktop.status", {
        projectId,
        sessionId: scope.sessionId,
        operationId: pending.operationId,
      });
      await settle(
        readAccountMetadataStatus(value, {
          environmentId: report.environmentId,
          sessionId: scope.sessionId,
          operationId: pending.operationId,
        }),
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
  }, [draft.ready, draft.value?.pending?.operationId, client]);
  const submit = async (review: AccountMetadataChange) => {
    if (
      occupied.current ||
      !draft.ready ||
      draft.error ||
      !current() ||
      !client ||
      draft.valueRef.current?.pending ||
      draft.valueRef.current?.finished
    )
      return;
    const before = draft.valueRef.current;
    if (!before) return;
    if (
      !client.machine.capabilities?.includes(
        review.kind === "quotaRefresh"
          ? "providers.desktop.quotaRefresh.v1"
          : "providers.desktop.metadata.v1",
      ) ||
      (review.kind === "quotaRefresh" && account.provider !== "claude")
    )
      return;
    const actual = validateAccountChange(
      before.kind === "rename"
        ? { kind: "rename", label: before.label }
        : before.kind === "color"
          ? { kind: "color", color: before.color }
          : before.kind === "quotaRefresh"
            ? { kind: "quotaRefresh", confirm: "REFRESH_PROVIDER_QUOTA" }
            : { kind: "default", confirm: "DEFAULT_FOR_FUTURE_SESSIONS" },
    );
    if (JSON.stringify(actual) !== JSON.stringify(review))
      throw Error("Account metadata draft changed; review again");
    occupied.current = true;
    setBusy(true);
    setError(undefined);
    let dispatched = false;
    const operationId = randomUUID();
    try {
      const identity = await targetDigest();
      if (!current() || draft.valueRef.current !== before)
        throw Error("Account metadata source or draft changed");
      const saved = {
        ...before,
        pending: {
          operationId,
          targetDigest: identity,
          environmentId: report.environmentId,
          expectedAccountRevision: report.accountRevision,
          change: review,
        },
      };
      draft.setValue(saved);
      await draft.persist();
      if (!current()) {
        draft.setValue({ ...saved, pending: undefined });
        await draft.persist();
        return;
      }
      dispatched = true;
      const value = await client.request(
        review.kind === "quotaRefresh"
          ? "providers.desktop.quota.refresh"
          : "providers.desktop.patch",
        {
          projectId,
          sessionId: scope.sessionId,
          operationId,
          expectedAccountRevision: report.accountRevision,
          provider: account.provider,
          accountId: account.id,
          ...(review.kind === "quotaRefresh"
            ? { confirm: "REFRESH_PROVIDER_QUOTA" }
            : { change: review }),
        },
      );
      await settle(
        readAccountMetadataStatus(value, {
          environmentId: report.environmentId,
          sessionId: scope.sessionId,
          operationId,
        }),
      );
    } catch (cause) {
      if (!dispatched) {
        draft.setValue((latest) =>
          latest?.pending?.operationId === operationId ? { ...latest, pending: undefined } : latest,
        );
        await draft.persist().catch(() => {});
      }
      if (mounted.current) setError(cause);
    } finally {
      occupied.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { draft, busy, error, receipt, reconcile, submit, current };
}
