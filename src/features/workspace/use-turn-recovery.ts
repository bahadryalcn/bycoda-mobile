import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard } from "react-native";
import { RESUME_PROMPT } from "../../../../src/features/sessions/model/userPromptText";
import { captureSessionAuthority } from "@/domain/session-authority";
import { useModelCatalog } from "@/state/model-catalog";
import { useCopy } from "@/ui/copy";
import { lockOutbox } from "../outbox/runtime/delivery";
import { sendOutbox } from "../outbox/runtime/store";
import { composerCommand } from "./composer-delivery";
import { openModelSheet } from "./composer-model-sheet";
import { failedTurnRetry, retryCommand, usageLimitFailureId } from "./failed-turn-retry";
import type { FailureRecovery } from "./failure-recovery";
import {
  currentUsageLimit,
  limitedTarget,
  limitedTargetLabel,
  limitedTurnModel,
  type UsageLimitAction,
} from "./usage-limit-model";
import { UsageLimitNotice, type UsageLimitNoticeProps } from "./usage-limit-notice";
import { useLatestCallback } from "./use-latest-callback";
import type { SessionCommand, SessionScope } from "./session-types";
import { UncertainCommand } from "./shared";
import type { HostSession } from "./wire";

/**
 * The latest failed turn's recovery, through the transcript's command dispatch (the same guarded,
 * authority-checked owner as Stop and Continue): Retry resends the turn's prompt and attachments as
 * an ordinary `send`; a usage limit arms, disarms or dismisses with the Host `usageLimit` command,
 * resumes with desktop's resume prompt, or opens the session's model and account sheet.
 * A usage limit whose failure block is not in the list is returned for the transcript footer.
 */
export function useTurnRecovery({
  session,
  scope,
  blocked,
  queued,
  onCommand,
  onFailure,
}: {
  session: HostSession | undefined;
  scope: SessionScope;
  blocked: boolean;
  /** The shared queue holds messages; desktop retries only with an empty queue. */
  queued: boolean;
  onCommand: SessionCommand;
  onFailure: (cause: unknown) => void;
}): { recovery: FailureRecovery | undefined; footerLimit: UsageLimitNoticeProps | undefined } {
  const copy = useCopy();
  const hostLimit = session?.session.usageLimit;
  const harness = session?.session.harness;
  const model = session?.session.model;
  const limitedTurn = hostLimit && session ? limitedTurnModel(session.session.blocks) : undefined;
  // The limit as it stands for the current model: one kept across a model change continues now.
  const limit = useMemo(
    () => (session ? currentUsageLimit(session.session) : undefined),
    // Keyed on what the reading depends on (not every block update), so the pending action's
    // identity check below stays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hostLimit, harness, model, session?.session.providerAccountId, limitedTurn?.harness, limitedTurn?.id],
  );
  const catalog = useModelCatalog(session?.projectId ?? "", !!limit && !!session?.projectId);

  const retry = session && !blocked ? failedTurnRetry(session, { queued }) : null;
  const retryKey = retry ? `${scope.sessionId}:${retry.errorId}` : undefined;
  // An accepted resend stays pending until the snapshot replaces this failure; a failed one releases.
  const [retried, setRetried] = useState<string | null>(null);
  const retryFlight = useRef<string | null>(null);
  // A lost reply holds the session blocked until its status is checked. Once that hold ends, a
  // resend that landed has replaced this failure; one that did not is offered again.
  const wasBlocked = useRef(blocked);
  useEffect(() => {
    if (wasBlocked.current && !blocked) setRetried(null);
    wasBlocked.current = blocked;
  }, [blocked]);
  const onRetry = useLatestCallback(async () => {
    if (!session || !retry || !retryKey || retryFlight.current || retried === retryKey) return;
    retryFlight.current = retryKey;
    setRetried(retryKey);
    // The composer's send lock: a send or outbox replay in flight for this session goes first.
    const unlock = lockOutbox(scope);
    try {
      if (!unlock)
        throw new Error(copy("Başka bir mesaj gönderiliyor. O ulaşınca yeniden dene.", "Another message is being sent. Retry once it arrives."));
      const rows = await sendOutbox.read(scope.machineId, scope.sessionId);
      if (rows.some((row) => row.status === "waiting" || row.status === "blocked"))
        throw new Error(copy("Bekleyen bir mesaj var. Önce onu gönder veya kaldır.", "A message is still waiting to send. Send or remove it first."));
      await onCommand(retryCommand(session, retry));
    } catch (cause) {
      // A lost reply may have landed: the footer's status check reconciles it, never a second send.
      if (!(cause instanceof UncertainCommand)) setRetried((current) => (current === retryKey ? null : current));
      onFailure(cause);
    } finally {
      unlock?.();
      retryFlight.current = null;
    }
  });

  // A usage-limit command stays pending until the Host's limit changes, or releases on failure.
  const [limitPending, setLimitPending] = useState<{ action: UsageLimitAction; limit: unknown }>();
  useEffect(() => setLimitPending((current) => (current && current.limit !== limit ? undefined : current)), [limit]);
  const onLimitAction = useLatestCallback(async (action: UsageLimitAction) => {
    if (!session || !limit || blocked || limitPending) return;
    if (action === "switch") {
      Keyboard.dismiss();
      openModelSheet(scope.machineId, scope.sessionId);
      return;
    }
    setLimitPending({ action, limit });
    try {
      await onCommand(
        action === "resume"
          ? composerCommand(session, "send", RESUME_PROMPT, [])
          : { type: "usageLimit", ...captureSessionAuthority(session), sessionId: scope.sessionId, action },
      );
    } catch (cause) {
      setLimitPending(undefined);
      onFailure(cause);
    }
  });

  const limitErrorId = limit && session ? usageLimitFailureId(session.session.blocks) : undefined;
  const target = session
    ? limitedTargetLabel(
        limitedTarget({ ...session.session, usageLimit: limit }),
        catalog.data?.accounts,
        copy("Varsayılan hesap", "Default account"),
      )
    : "";
  const notice = useMemo<UsageLimitNoticeProps | undefined>(
    () =>
      limit
        ? {
            limit,
            target,
            disabled: blocked || session?.status === "running",
            pending: limitPending?.limit === limit ? limitPending.action : undefined,
            onAction: (action) => void onLimitAction(action),
          }
        : undefined,
    [limit, target, blocked, session?.status, limitPending, onLimitAction],
  );
  const retryPending = !!retryKey && retried === retryKey;
  const recovery = useMemo<FailureRecovery | undefined>(
    () =>
      retry || (notice && limitErrorId)
        ? {
            ...(retry ? { retry: { errorId: retry.errorId, pending: retryPending, onRetry: () => void onRetry() } } : {}),
            ...(notice && limitErrorId
              ? { usageLimit: { errorId: limitErrorId, render: (details) => createElement(UsageLimitNotice, { ...notice, details }) } }
              : {}),
          }
        : undefined,
    // `retry` is rebuilt each render; its identity is the error it belongs to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [retry?.errorId, retryPending, onRetry, notice, limitErrorId],
  );
  return { recovery, footerLimit: notice && !limitErrorId ? notice : undefined };
}
