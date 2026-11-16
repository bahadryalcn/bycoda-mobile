import Clock from "lucide-react-native/icons/clock";
import Mail from "lucide-react-native/icons/mail";
import MailOpen from "lucide-react-native/icons/mail-open";
import { sessionAttentionActions, sessionIsSnoozed } from "./session-attention-model";
import { SessionSnoozeMenu } from "./session-snooze-menu";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Archive from "lucide-react-native/icons/archive";
import ArchiveRestore from "lucide-react-native/icons/archive-restore";
import Trash from "lucide-react-native/icons/trash";
import Info from "lucide-react-native/icons/info";
import Pin from "lucide-react-native/icons/pin";
import PinOff from "lucide-react-native/icons/pin-off";
import CircleCheck from "lucide-react-native/icons/circle-check";
import Undo2 from "lucide-react-native/icons/undo-2";
import GitBranch from "lucide-react-native/icons/git-branch";
import Pencil from "lucide-react-native/icons/pencil";
import Square from "lucide-react-native/icons/square";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { isReviewedMachine } from "@/state/reviewed-machine";
import { useHostClient, useHostMutation, useHostReadActive, hostKey } from "@/state/queries";
import { RemoteHostError } from "@/remote/host-error";
import {
  Badge,
  Body,
  ErrorText,
  FormActions,
  Field,
  Notice,
  Row,
  Sheet,
  Stack,
  StatusRow,
} from "@/ui/primitives";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { SwipeActions, type SwipeRowAction } from "@/ui/swipe-actions";
import { useCopy } from "@/ui/copy";
import { ProviderIcon } from "@/ui/provider-identity";
import { decorativeSvgProps } from "@/ui/accessibility";
import { useMobileTheme } from "@/ui/theme";
import { stamp } from "../management/shared/format";
import { readTail, type HostSessionSummary } from "./wire";
import {
  performSessionRowAction,
  reviewSessionRow,
  sessionRowReviewMatches,
  sessionActionState,
} from "./session-row-action-model";
import { relativeTime, sessionStatus, useCommands, UncertainCommand } from "./shared";
import { captureSessionAuthority } from "@/domain/session-authority";
import { SessionRowCopyMenu } from "./session-row-copy-menu";
import { sessionCopyLink } from "./session-copy-model";
import { sessionDisplayTitle } from "./session-title";

type RowAction = SwipeRowAction & { detail?: string; opens?: boolean; group?: "primary" | "secondary" | "state" };

export type SessionRowActionsProps = {
  machineId: string;
  projectId: string;
  projectName?: string;
  projectCwd?: string;
  session: HostSessionSummary;
  canRead(): boolean;
  /** The Host lists this session as settled; the action becomes "Unsettle". */
  settled?: boolean;
  children(openActions: () => void): ReactNode;
};

export function SessionRowActions(props: SessionRowActionsProps) {
  const { colors, uiStyles } = useMobileTheme();
  const { machineId, projectId, projectName, projectCwd, session, canRead, settled, children } =
    props;
  const copy = useCopy(),
    machine = useActiveMachine(),
    connection = useConnectionScope();
  const client = useHostClient(),
    active = useHostReadActive(),
    access = usePrivateContentAccess(),
    cache = useQueryClient();
  const update = useHostMutation<HostSessionSummary>("sessions.update", ["sessions", projectId]);
  const remove = useHostMutation<{ deleted: true }>("sessions.delete", ["sessions", projectId]);
  const command = useCommands(["session", session.id, projectId]);
  const lifecycle = useHostMutation<unknown>(
    settled ? "sessions.lifecycle.unsettle" : "sessions.lifecycle.settle",
    ["sessions-lifecycle"],
  );
  const mounted = useRef(false),
    occupied = useRef(false),
    readController = useRef<AbortController | null>(null);
  const held = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readController.current?.abort();
    };
  }, []);
  const available =
    active &&
    machine?.id === machineId &&
    session.projectId === projectId &&
    access.allowed &&
    access.check() &&
    canRead();
  const writable = available && !!client && !!machine?.capabilities?.includes("sessions");
  const stopSupported = !!machine?.capabilities?.includes("transport.ws.sessions.v2");
  const live = useRef({ props, connection, available, writable, stopSupported, access });
  live.current = { props, connection, available, writable, stopSupported, access };
  const [panel, setPanel] = useState<"actions" | "details" | "delete" | "rename" | "stop" | "snooze" | null>(null);
  const [renameTitle, setRenameTitle] = useState(session.title);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [uncertain, setUncertain] = useState(false);
  const capture = () => ({
    row: reviewSessionRow(machineId, projectId, session),
    connection,
    client,
    update: update.mutateAsync,
    remove: remove.mutateAsync,
    lifecycle: lifecycle.mutateAsync,
    command: command.mutateAsync,
  });
  type Review = ReturnType<typeof capture>;
  const issued = useRef<Review | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const current = (value: Review, write = false, exactRun = false) => {
    const state = live.current;
    const matches = exactRun
      ? state.stopSupported &&
        value.row.authorityGeneration === state.props.session.authorityGeneration &&
        value.row.status === "running" && state.props.session.status === "running" &&
        !!value.row.runId && value.row.runId === state.props.session.runId
      : sessionRowReviewMatches(value.row, state.props.machineId, state.props.projectId, state.props.session);
    return (
      mounted.current &&
      state.available &&
      (!write || state.writable) &&
      value.connection === state.connection &&
      value.connection.isCurrent() &&
      isReviewedMachine(value.connection.review, useMachines.getState()) &&
      state.access.allowed &&
      state.access.check() &&
      state.props.canRead() &&
      value.row.machineId === state.props.machineId &&
      value.row.projectId === state.props.projectId &&
      value.row.sessionId === state.props.session.id &&
      (!write || matches)
    );
  };
  // Returning to the same row never revives a confirmation retired by access or authority changes.
  useLayoutEffect(() => {
    if (review && !current(review, true, panel === "stop")) issued.current = null;
  }, [
    review,
    panel,
    available,
    writable,
    stopSupported,
    connection,
    session.id,
    session.revision,
    session.authorityGeneration,
    session.status,
    session.runId,
    session.archived,
  ]);
  const open = (next: NonNullable<typeof panel>) => {
    if (!available || occupied.current) return;
    const value = capture();
    if (!current(value)) return;
    issued.current = value;
    setReview(value);
    setPanel(next);
    if (next === "rename") setRenameTitle(session.title);
    if (!held.current) setError(null);
  };
  const close = () => {
    if (!occupied.current) {
      issued.current = null;
      setPanel(null);
      setReview(null);
    }
  };
  const run = async (action: "archive" | "delete" | "rename" | "stop", value: Review) => {
    if (
      !current(value, true, action === "stop") ||
      issued.current !== value ||
      occupied.current ||
      held.current ||
      !value.client
    )
      return;
    issued.current = null;
    occupied.current = true;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    readController.current = controller;
    try {
      await performSessionRowAction(action, value.row, {
        assertCurrent: () => {
          if (!current(value, true, action === "stop")) throw new Error("The session project is no longer available.");
        },
        read: () => readTail(value.client!, value.row.sessionId, { signal: controller.signal }),
        write: action === "stop" ? value.command : action === "delete" ? value.remove : value.update,
      }, renameTitle);
      await Promise.all([
        cache.invalidateQueries({ queryKey: hostKey(value.row.machineId, ["project-summaries"]) }),
        cache.invalidateQueries({
          queryKey: hostKey(value.row.machineId, ["session", value.row.sessionId]),
        }),
      ]);
      if (mounted.current) {
        setPanel(null);
        setReview(null);
      }
    } catch (cause) {
      if (mounted.current) {
        setError(cause);
        if ((cause instanceof RemoteHostError && cause.uncertain) || cause instanceof UncertainCommand) {
          held.current = true;
          setUncertain(true);
        }
        else issued.current = value;
        if (!panel) {
          setReview(value);
          setPanel("actions");
        }
      }
    } finally {
      occupied.current = false;
      readController.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  const archive = () => {
    if (!writable || occupied.current || held.current) return;
    const value = capture();
    issued.current = value;
    setReview(value);
    setPanel("actions");
    void run("archive", value);
  };
  const quick = async (kind: "pin" | "settle" | "unread" | "snooze", until?: number | null) => {
    if (!writable || occupied.current || held.current) return;
    const value = capture();
    if (!current(value, true)) return;
    occupied.current = true;
    setBusy(true);
    setError(null);
    try {
      if (kind === "pin")
        await value.update({
          projectId,
          sessionId: session.id,
          pinned: !session.pinned,
          ...captureSessionAuthority(session),
        });
      else if (kind === "unread" || kind === "snooze")
        await value.update({
          projectId, sessionId: session.id, expectedRevision: session.revision,
          ...captureSessionAuthority(session),
          ...(kind === "unread" ? { unread: !session.unread } : { snoozedUntil: until }),
        });
      else await value.lifecycle({ sessionId: session.id });
      // The Sessions tab reads batched project summaries, not the per-project list.
      await Promise.all([
        cache.invalidateQueries({ queryKey: hostKey(value.row.machineId, ["project-summaries"]) }),
        cache.invalidateQueries({ queryKey: hostKey(value.row.machineId, ["sessions-lifecycle"]) }),
      ]);
      if (mounted.current) {
        setPanel(null);
        setReview(null);
      }
    } catch (cause) {
      if (mounted.current) {
        setError(cause);
        if (cause instanceof RemoteHostError && cause.uncertain) {
          held.current = true;
          setUncertain(true);
        }
        issued.current = value;
        setReview(value);
        setPanel("actions");
      }
    } finally {
      occupied.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const archiveLabel = session.archived
    ? copy("Arşivden çıkar", "Unarchive")
    : copy("Arşivle", "Archive");
  const blocked = !writable || busy || uncertain;
  const actionState = sessionActionState(session, !!settled);
  const pin: RowAction = {
    key: "pin",
    label: session.pinned ? copy("Sabiti kaldır", "Unpin") : copy("Sabitle", "Pin"),
    icon: session.pinned ? <PinOff /> : <Pin />,
    disabled: blocked,
    onPress: () => void quick("pin"),
  };
  const settle: RowAction = {
    key: "settle",
    group: "state",
    label: settled ? copy("Raftan indir", "Un-settle") : copy("Rafa kaldır", "Settle"),
    icon: settled ? <Undo2 /> : <CircleCheck />,
    disabled: blocked || !actionState.canSettle,
    onPress: () => void quick("settle"),
  };
  const archiveAction: RowAction = {
    key: "archive",
    group: "state",
    label: archiveLabel,
    icon: session.archived ? <ArchiveRestore /> : <Archive />,
    disabled: blocked,
    onPress: archive,
  };
  const deleteAction: RowAction = {
    key: "delete",
    label: copy("Sil", "Delete"),
    icon: <Trash />,
    destructive: true,
    opens: true,
    disabled: blocked || !actionState.canDelete,
    onPress: () => open("delete"),
  };
  const detailsAction: RowAction = {
    key: "details",
    group: "secondary",
    label: copy("Ayrıntılar", "Details"),
    icon: <Info />,
    opens: true,
    disabled: busy,
    onPress: () => open("details"),
  };
  const rename: RowAction = { key: "rename", label: copy("Yeniden adlandır", "Rename"), icon: <Pencil />, disabled: blocked, opens: true, onPress: () => open("rename") };
  const stop: RowAction = { key: "stop", group: "state", label: copy("Durdur", "Stop"), icon: <Square />, disabled: blocked, opens: true, onPress: () => open("stop") };
  const swipeActions = [pin, settle, deleteAction];
  const attention = sessionAttentionActions(session);
  const snoozed = sessionIsSnoozed(session);
  const attentionActions: RowAction[] = [
    ...(attention.unread ? [{ key: "unread", group: "secondary" as const,
      label: session.unread ? copy("Okundu olarak işaretle", "Mark as read") : copy("Okunmadı olarak işaretle", "Mark as unread"),
      icon: session.unread ? <MailOpen /> : <Mail />, disabled: blocked,
      onPress: () => void quick("unread") }] : []),
    ...(attention.snooze ? [{ key: "snooze", group: "secondary" as const,
      label: snoozed ? copy("Şimdi uyandır", "Wake now") : copy("Ertele", "Snooze"), icon: <Clock />,
      disabled: blocked, opens: !snoozed,
      onPress: () => { if (snoozed) void quick("snooze", null); else setPanel("snooze"); } }] : []),
  ];
  const sheetActions = [rename, pin, ...attentionActions, detailsAction, settle, archiveAction, ...(actionState.canStop && stopSupported ? [stop] : []), deleteAction];
  const valid = !!review && current(review);
  const fresh = !!review && current(review, true, panel === "stop");
  const status = sessionStatus({ ...session, pinned: false }, copy, colors).label;
  const title = sessionDisplayTitle(session.title, copy("Yeni oturum", "New session"));
  const details = (
    <Stack>
      <Body selectable style={uiStyles.title}>
        {title}
      </Body>
      <Stack>
        <Body>{projectName || projectId}</Body>
        <Body muted selectable style={uiStyles.caption}>
          {session.worktreeCwd || session.cwd || projectCwd || "—"}
        </Body>
      </Stack>
      {session.branch ? (
        <Row>
          <GitBranch {...decorativeSvgProps} size={16} color={colors.muted} />
          <Body muted style={uiStyles.caption}>
            {session.branch}
          </Body>
        </Row>
      ) : null}
      <Row>
        <ProviderIcon provider={session.harness} size={18} />
        <Body style={uiStyles.caption}>{session.model || session.harness}</Body>
      </Row>
      <Row>
        <Badge
          label={status}
          tone={
            session.needsInput || session.status === "interrupted"
              ? "warning"
              : session.status === "running"
                ? "live"
                : session.issue === "failed" && session.status === "idle"
                  ? "danger"
                  : "default"
          }
        />
        <Body muted style={uiStyles.caption}>
          {copy("Güncellendi", "Updated")} · {relativeTime(session.updatedAt, copy)}
        </Body>
      </Row>
      <Stack>
        <StatusRow label={copy("Bilgisayar", "Computer")}>
          <Body>{machine?.name || machineId}</Body>
        </StatusRow>
        <StatusRow label={copy("Oluşturuldu", "Created")}>
          <Body>{stamp(session.createdAt)}</Body>
        </StatusRow>
        <StatusRow label={copy("Güncellendi", "Updated")}>
          <Body>{stamp(session.updatedAt)}</Body>
        </StatusRow>
        {session.lastActivityAt !== undefined ? (
          <StatusRow label={copy("Son etkinlik", "Last activity")}>
            <Body>{stamp(session.lastActivityAt)}</Body>
          </StatusRow>
        ) : null}
        <StatusRow label={copy("Oturum kimliği", "Session ID")}>
          <Body mono>{session.id}</Body>
        </StatusRow>
      </Stack>
    </Stack>
  );
  return (
    <>
      <SwipeActions actions={swipeActions} disabled={!available || busy}>
        {children(() => open("actions"))}
      </SwipeActions>
      <PrivateContentAccessProvider
        value={{ allowed: valid, check: () => !!review && current(review) }}
      >
        {panel && review && valid ? (
          <Sheet
            visible
            title={
              panel === "details"
                ? copy("Oturum ayrıntıları", "Session details")
                : panel === "delete"
                  ? copy("Oturumu sil", "Delete session")
                  : panel === "rename" ? copy("Yeniden adlandır", "Rename")
                  : panel === "stop" ? copy("Oturumu durdur", "Stop session")
                  : panel === "snooze" ? copy("Ertele", "Snooze")
                  : copy("Oturum işlemleri", "Session actions")
            }
            onClose={close}
            dismissible={!busy}
            dirty={panel === "rename" && renameTitle !== session.title}
          >
            {panel === "details" ? (
              details
            ) : (
              <Body selectable numberOfLines={2}>
                {title}
              </Body>
            )}
            {(panel === "rename" || panel === "stop") && !fresh && !busy ? (
              <Notice tone="warning" message={copy("Bu oturum değişti. Listeyi yenileyip tekrar inceleyin.", "This session changed. Refresh the list and review it again.")} />
            ) : null}
            {panel === "snooze" ? (
              <SessionSnoozeMenu disabled={blocked || !fresh} onSelect={(until) => void quick("snooze", until)} />
            ) : panel === "rename" ? (
              <>
                <Field label={copy("Başlık", "Title")} value={renameTitle} onChangeText={setRenameTitle} editable={!busy && !uncertain} error={!renameTitle.trim() ? copy("Bu alan gereklidir.", "This field is required.") : undefined} returnKeyType="done" />
                <FormActions submitLabel={copy("Kaydet", "Save")} onSubmit={() => { void run("rename", review); }} busy={busy} disabled={!fresh || issued.current !== review || uncertain || !renameTitle.trim()} onCancel={close} cancelDisabled={busy} />
              </>
            ) : panel === "stop" ? (
              <FormActions submitLabel={copy("Durdur", "Stop")} onSubmit={() => { void run("stop", review); }} busy={busy} disabled={!fresh || issued.current !== review || uncertain || !actionState.canStop} onCancel={close} cancelDisabled={busy} />
            ) : panel === "delete" ? (
              <>
                <Notice
                  tone="warning"
                  message={copy(
                    "Bu konuşma ve geçmişi kalıcı olarak silinecek.",
                    "This conversation and its history will be permanently deleted.",
                  )}
                />
                {!fresh && !busy ? (
                  <Notice
                    tone="warning"
                    message={copy(
                      "Bu oturum değişti. Listeyi yenileyip tekrar inceleyin.",
                      "This session changed. Refresh the list and review it again.",
                    )}
                  />
                ) : null}
                <FormActions
                  submitLabel={copy("Sil", "Delete")}
                  tone="danger"
                  busy={busy}
                  disabled={
                    !fresh || issued.current !== review || uncertain || session.status === "running"
                  }
                  onSubmit={() => {
                    void run("delete", review);
                  }}
                  onCancel={close}
                  cancelDisabled={busy}
                />
              </>
            ) : panel === "actions" ? (
              <SessionRowCopyMenu actions={sheetActions} sessionId={review.row.sessionId} projectId={review.row.projectId} title={title} link={sessionCopyLink(machine?.environmentId, session.id)} client={review.client} current={() => current(review)} busy={busy} />
            ) : null}
            {uncertain ? (
              <Notice
                tone="warning"
                message={copy(
                  "İşlem sonucu belirsiz. Yeniden göndermeden önce bilgisayardaki oturumu kontrol edin.",
                  "The result is uncertain. Check the session on the computer before sending again.",
                )}
              />
            ) : (
              <ErrorText error={error} />
            )}
          </Sheet>
        ) : null}
      </PrivateContentAccessProvider>
    </>
  );
}
