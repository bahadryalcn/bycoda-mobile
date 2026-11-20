import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const [context] = useState(() => ({
    scope: { ...scope },
    projectId,
    environmentId: report.environmentId,
    accountRevision: report.accountRevision,
    account: { ...account },
  }));
  const latest = useRef({ scope, projectId, report, account, client });
  latest.current = { scope, projectId, report, account, client };
  const invalidated = useRef(false);
  const mounted = useRef(true),
    occupied = useRef(false);
  const draft = useLocalDraft(
    `bycoda.accountMetadata.v1:${JSON.stringify([context.scope.machineId, context.projectId, context.scope.sessionId, context.account.provider, context.account.id])}`,
    decodeAccountDraft,
    encodeAccountDraft,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [receipt, setReceipt] = useState<AccountMetadataStatus>();
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (draft.ready && (!draft.valueRef.current || draft.valueRef.current.finished))
      draft.setValue({
        kind: "rename",
        label: context.account.label,
        color: context.account.color,
        accountKind: context.account.kind ?? "personal",
      });
  }, [draft.ready]);
  const current = () => {
    const live = latest.current;
    if (
      !isReviewedMachine(opening.current, useMachines.getState()) ||
      live.scope.machineId !== context.scope.machineId ||
      live.scope.sessionId !== context.scope.sessionId ||
      live.projectId !== context.projectId ||
      live.report.environmentId !== context.environmentId ||
      live.report.sourceSessionId !== context.scope.sessionId ||
      live.account.id !== context.account.id ||
      live.account.provider !== context.account.provider ||
      (live.client &&
        !isReviewedMachine(opening.current, {
          activeId: live.client.machine.id,
          machines: [live.client.machine],
        }))
    )
      invalidated.current = true;
    return (
      mounted.current &&
      !invalidated.current &&
      !!live.client &&
      live.client.machine.id === context.scope.machineId &&
      live.client.machine.environmentId === context.environmentId &&
      (live.client.machine.capabilities?.includes("providers.desktop.metadata.v1") ||
        live.client.machine.capabilities?.includes("providers.desktop.quotaRefresh.v1"))
    );
  };
  current(); // Retire an observed target change before an older callback can run.
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
      pending.environmentId !== context.environmentId
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
        projectId: context.projectId,
        sessionId: context.scope.sessionId,
        operationId: pending.operationId,
      });
      await settle(
        readAccountMetadataStatus(value, {
          environmentId: context.environmentId,
          sessionId: context.scope.sessionId,
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
  const supportsChange = (kind: AccountMetadataChange["kind"]) =>
    !!latest.current.client?.machine.capabilities?.includes(
      kind === "quotaRefresh"
        ? "providers.desktop.quotaRefresh.v1"
        : kind === "accountKind"
          ? "providers.desktop.accountKind.v1"
          : "providers.desktop.metadata.v1",
    ) &&
    (kind !== "quotaRefresh" || context.account.provider === "claude");
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
    if (!supportsChange(review.kind)) return;
    const actual = validateAccountChange(
      before.kind === "rename"
        ? { kind: "rename", label: before.label }
        : before.kind === "color"
          ? { kind: "color", color: before.color }
          : before.kind === "accountKind"
            ? { kind: "accountKind", accountKind: before.accountKind ?? null }
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
      if (!current() || !supportsChange(review.kind) || draft.valueRef.current !== before)
        throw Error("Account metadata source or draft changed");
      const saved = {
        ...before,
        pending: {
          operationId,
          targetDigest: identity,
          environmentId: context.environmentId,
          expectedAccountRevision: context.accountRevision,
          change: review,
        },
      };
      draft.setValue(saved);
      await draft.persist();
      if (!current() || !supportsChange(review.kind)) {
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
          projectId: context.projectId,
          sessionId: context.scope.sessionId,
          operationId,
          expectedAccountRevision: context.accountRevision,
          provider: context.account.provider,
          accountId: context.account.id,
          ...(review.kind === "quotaRefresh"
            ? { confirm: "REFRESH_PROVIDER_QUOTA" }
            : { change: review }),
        },
      );
      await settle(
        readAccountMetadataStatus(value, {
          environmentId: context.environmentId,
          sessionId: context.scope.sessionId,
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
