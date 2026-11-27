import { useInboxLocalScope } from "./inbox-local-scope";
import { providerStateLabel, providerStateTone } from "./provider-labels";
import { ProviderState } from "./issue-record-row";
import { statusTone } from "./provider-view-model";
import { getQueryPresentation } from "@/ui/query-presentation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@/ui/error-message";
import { Linking } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { RemoteInboxPrAction } from "../../../../src/features/inbox/model/remoteInbox";
import { useAsyncAction } from "@/state/actions";
import { useLocalDraft } from "../workspace/use-local-draft";
import { decodeInboxCommentDraft, encodeInboxCommentDraft, inboxCommentDraftKey } from "./provider-comment-draft";

import { hostKey, useHostClient } from "@/state/queries";
import {
  Badge,
  ActionMenu,
  Body,
  Heading,
  Button,
  Disclosure,
  MutationState,
  Notice,
  QueryState,
  Row,
  Screen,
  Stack,
  Sheet,
  StatusLine,
  IconButton,
  showToast,
} from "@/ui/primitives";
import ExternalLink from "lucide-react-native/icons/external-link";
import FileCheck from "lucide-react-native/icons/file-check";
import GitMerge from "lucide-react-native/icons/git-merge";
import GitPullRequestClosed from "lucide-react-native/icons/git-pull-request-closed";
import GitPullRequestDraft from "lucide-react-native/icons/git-pull-request-draft";
import RotateCcw from "lucide-react-native/icons/rotate-ccw";
import { iconSize } from "@/ui/tokens";
import { RecordMeta } from "./record-meta";
import { useMobileTheme } from "@/ui/theme";
import { PullRequestMetadata } from "../pull-requests/ui/metadata";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { RECORD_ACCESS_UNAVAILABLE } from "@/ui/record-access-copy";
import { useSheetGuard } from "@/ui/sheet-guard";
import { MessageText } from "@/ui/message-text";
import { providerActionLabel } from "./provider-labels";
import { providerPrActions } from "./provider-actions";
import { prCheckBucket, shortSha } from "../pull-requests/model/checks";
import { ProviderInboxComposer } from "./provider-composer";
import { inboxReviewHref, rememberInboxRecord } from "./inbox-record-route";
import type {
  ConfirmedInboxComment,
  ProviderInboxDetailProps,
  ProviderInboxDescriptionProps,
} from "./provider-component-types";
import { ProviderInboxConversation } from "./provider-conversation";
import { InboxJobError, isInboxWriteUncertain, runInboxJob } from "./provider-jobs";
import {
  inboxItemInput,
  inboxItemKey,
  isInboxPrivateFailure,
  providerInboxAccess,
  providerName,
} from "./provider-model";
import type { InboxWriteCommand, InboxWriteResult } from "./provider-protocol";
import { INBOX_RECORD_CACHE_MS, useInboxRead } from "./provider-queries";
import {
  acknowledgeInboxComment,
  emptyInboxCommentDraft,
  type InboxCommentDraft,
} from "./provider-state";
import { pushOnce } from "@/ui/navigation";

export { type ProviderInboxDetailProps } from "./provider-component-types";

export function ProviderInboxDetail({
  item: incomingItem,
  origin: incomingOrigin,
  availability,
  onClose,
  closeLabel,
  extra,
}: ProviderInboxDetailProps) {
  const inboxScope = useInboxLocalScope();
  const copy = useCopy();
  const { uiStyles, colors } = useMobileTheme();
  const [opened] = useState(incomingItem), [origin] = useState(incomingOrigin);
  // Identity stays the opened record's; its state, draft flag and title follow the caller's latest
  // row for the same record, so a pull request merged or closed elsewhere stops offering Merge/Close.
  const item = useMemo(() => inboxItemKey(incomingItem) === inboxItemKey(opened)
    ? { ...opened, state: incomingItem.state, draft: incomingItem.draft, title: incomingItem.title, labels: incomingItem.labels, assignees: incomingItem.assignees }
    : opened, [opened, incomingItem]);
  const client = useHostClient();
  const cache = useQueryClient();
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The comment draft is kept per record on this phone: closing the record by any path (sheet
  // swipe, native Back on the pull request route) keeps what was typed for the next visit.
  const commentDraft = useLocalDraft(inboxCommentDraftKey(origin, item), decodeInboxCommentDraft, encodeInboxCommentDraft);
  const commentReady = commentDraft.ready || !!commentDraft.error;
  const editComment = (update: (current: InboxCommentDraft) => InboxCommentDraft) => {
    try {
      commentDraft.setValue((current) => {
        const next = update(current ?? emptyInboxCommentDraft);
        return next === emptyInboxCommentDraft ? null : next;
      });
    } catch { /* A retired draft belongs to a closed record. */ }
  };
  const form = {
    values: commentDraft.value ?? emptyInboxCommentDraft,
    setField: <K extends keyof InboxCommentDraft>(key: K, value: InboxCommentDraft[K]) => editComment((current) => ({ ...current, [key]: value })),
    patch: (change: Partial<InboxCommentDraft>) => editComment((current) => ({ ...current, ...change })),
  };
  const [composing, setComposing] = useState(false);
  const [showBotActivity, setShowBotActivityState] = useState(rememberedBotActivity.show);
  const setShowBotActivity = (show: boolean) => { rememberedBotActivity.show = show; setShowBotActivityState(show); };
  const [pendingAction, setPendingAction] = useState<InboxWriteCommand["action"] | null>(null);
  const submission = useAsyncAction<InboxWriteResult>();
  // A label or reviewer change is a quick row action: its failure is a toast with the cause.
  useEffect(() => {
    if (!submission.error || isInboxWriteUncertain(submission.error) || (pendingAction !== "labels" && pendingAction !== "reviewers")) return;
    showToast({ tone: "danger", message: errorMessage(submission.error, copy) });
  }, [submission.error]);
  const openProvider = useAsyncAction<void>();
  const access = providerInboxAccess(availability);
  const scopeCurrent = inboxScope.matches(origin);
  const readAllowed = access.canRead && scopeCurrent;
  const input = inboxItemInput(item, origin.projectId);
  // Reopening a record shows its last details and conversation at once while they refresh.
  const cached = { gcTime: INBOX_RECORD_CACHE_MS };
  const details = useInboxRead<"details">({ action: "details", input }, readAllowed, cached);
  const thread = useInboxRead<"thread">({ action: "thread", input }, readAllowed, cached);
  const mergeable = item.provider === "github" && item.kind === "pr" && item.state.toLowerCase() === "open" && !item.draft;
  // A merge is pinned to the head the Checks section shows: the same cached read, never the full diff.
  const mergeContext = useInboxRead<"checks">({ action: "checks", input }, readAllowed && mergeable, cached);
  const failedChecks = mergeContext.data?.checks.filter((check) => prCheckBucket(check.state) === "fail").length ?? 0;
  const pendingChecks = mergeContext.data?.checks.filter((check) => prCheckBucket(check.state) === "pending").length ?? 0;
  const mergeBlocked = !mergeContext.data?.headOid ? mergeContext.error
    ? copy("Kontroller okunamadı; birleştirme için güncel commit gerekiyor.", "Checks could not be read; merging needs the current commit.")
    : copy("Güncel commit okunuyor…", "Reading the current commit…")
    : mergeContext.isFetching ? copy("Güncel commit okunuyor…", "Reading the current commit…") : undefined;
  const contentAvailable = readAllowed && !isInboxPrivateFailure(availability.error, details.error, thread.error);
  const sharedReadFailure = !!details.error && !!thread.error && details.error.message === thread.error.message &&
    (details.error as {kind?: string}).kind === (thread.error as {kind?: string}).kind;
  const writeAllowed = contentAvailable && access.canWrite;
  const contentLease = useMemo(() => ({ active: false }), [contentAvailable, writeAllowed]);
  useLayoutEffect(() => { contentLease.active = true; return () => { contentLease.active = false; }; }, [contentLease]);
  const uncertain = isInboxWriteUncertain(submission.error);
  const busy = submission.isPending;
  const latest = useRef({ readAllowed, contentAvailable, writeAllowed, busy, uncertain });
  latest.current = { readAllowed, contentAvailable, writeAllowed, busy, uncertain };
  const { requestClose, requestCloseThen } = useSheetGuard({
    // Only a draft this phone could not store would be lost by closing.
    dirty: !!form.values.body.trim() && !commentDraft.ready, pending: busy, onClose,
  });
  const manageConnections = () => requestCloseThen(() => pushOnce("/machines"));
  const currentOrigin = () =>
    mounted.current && inboxScope.matches(origin);

  const readableNow = () => contentLease.active && currentOrigin() && latest.current.contentAvailable;
  const editableNow = () => readableNow() && latest.current.writeAllowed && !latest.current.busy;
  const writableNow = () => editableNow() && !latest.current.uncertain;

  function submit(command: InboxWriteCommand, draft?: InboxCommentDraft) {
    if (!writableNow()) return;
    setPendingAction(command.action);
    void submission.run(async () => {
      // An old confirmation cannot authorize a newly selected computer or project.
      if (!currentOrigin())
        throw new InboxJobError("This inbox changed. Open the item again before sending.");
      if (!readableNow() || !latest.current.writeAllowed) {
        throw new InboxJobError(
          "The desktop inbox is unavailable. Check the connection before sending.",
        );
      }
      if (!client || client.machine.id !== origin.machineId) {
        throw new InboxJobError("Choose a computer first.");
      }
      const result = await runInboxJob(client, command);
      // Receipt completion updates its original machine cache, even after navigation.
      void invalidateRecord(writeRefreshes(command.action));
      if (!currentOrigin() && draft && commentDraft.valueRef.current === draft)
        void commentDraft.persist(null).catch(() => {});
      if (currentOrigin()) {
        if (draft) editComment((current) => acknowledgeInboxComment(current, draft));
        if (command.action === "pr-action") {
          onClose(copy("Pull request güncellendi.", "Pull request updated."));
        }
      }
      return { action: command.action, result };
    });
  }

  function confirmComment(comment: ConfirmedInboxComment) {
    submit({ action: "comment", input: { ...input, ...comment.params } }, comment.draft);
  }

  function stateAction(action: RemoteInboxPrAction) {
    if (!writableNow()) return;
    const merging = action === "merge" || action === "squash" || action === "rebase";
    const expectedHeadOid = merging ? mergeContext.data?.headOid : undefined;
    if (merging && (!expectedHeadOid || mergeContext.isFetching)) return;
    const run = () => submit({
      action: "pr-action",
      input: { ...input, prAction: action, ...(expectedHeadOid ? { expectedHeadOid } : {}), confirm: "CHANGE_PR_STATE" },
    });
    // Like the desktop: draft, ready and reopen are reversible with one tap and run at once; a merge
    // cannot be undone and closing notifies others, so those two ask first.
    if (!merging && action !== "close") { run(); return; }
    const head = details.data?.headRefName || copy("bu dal", "this branch");
    const base = details.data?.baseRefName || copy("hedef dal", "the base branch");
    if (action === "close") {
      confirmAction(
        copy("Bu pull request kapatılsın mı?", "Close this pull request?"),
        copy("Pull request birleştirilmeden kapanır. Daha sonra yeniden açabilirsin.", "The pull request will close without merging. You can reopen it later."),
        copy("Pull request’i kapat", "Close pull request"),
        run,
        copy("Vazgeç", "Cancel"),
      );
      return;
    }
    // The desktop's merge wording, plus the reviewed head and what the checks still say.
    const checksNote = failedChecks
      ? copy("Uyarı: {p0} kontrol başarısız.", "Warning: {p0} checks failed.", { p0: failedChecks })
      : pendingChecks ? copy("{p0} kontrol hâlâ çalışıyor.", "{p0} checks are still running.", { p0: pendingChecks }) : "";
    const merge = action === "squash" ? {
      title: copy("Squash ile birleştirilsin mi?", "Squash and merge?"),
      message: copy("{p0} dalındaki commit’ler {p1} üzerinde tek bir commit’te birleştirilir.", "The commits from {p0} will be combined into one commit on {p1}.", { p0: head, p1: base }),
      label: copy("Squash ve birleştir", "Squash and merge"),
    } : action === "rebase" ? {
      title: copy("Rebase ile birleştirilsin mi?", "Rebase and merge?"),
      message: copy("{p0} dalındaki commit’ler tek tek {p1} üzerine rebase edilir.", "The commits from {p0} will be rebased individually onto {p1}.", { p0: head, p1: base }),
      label: copy("Rebase ve birleştir", "Rebase and merge"),
    } : {
      title: copy("Bu pull request birleştirilsin mi?", "Merge this pull request?"),
      message: copy("{p0} dalındaki her commit bir merge commit’iyle {p1} dalına eklenir.", "Every commit from {p0} will be added to {p1} with a merge commit.", { p0: head, p1: base }),
      label: copy("Pull request’i birleştir", "Merge pull request"),
    };
    confirmAction(
      merge.title,
      [merge.message, copy("İncelenen commit: {p0}", "Reviewed head: {p0}", { p0: shortSha(expectedHeadOid!) }), checksNote].filter(Boolean).join("\n"),
      merge.label,
      run,
      copy("Vazgeç", "Cancel"),
      "default",
    );
  }

  /**
   * Marks this record's reads stale (and the lists, whose rows carry its state); the ones on screen
   * refetch once. A write refreshes only what it changed; pull-to-refresh refreshes them all.
   */
  function invalidateRecord(actions: readonly string[]) {
    const record = JSON.stringify(input.item);
    return cache.invalidateQueries({
      queryKey: hostKey(origin.machineId, ["provider-inbox"]),
      predicate: ({ queryKey }) => {
        const action = queryKey[3] as string;
        if (!actions.includes(action)) return false;
        return action === "list" || JSON.stringify((queryKey[4] as { item?: unknown } | undefined)?.item) === record;
      },
    });
  }
  function refreshConversation() {
    if (!currentOrigin()) return;
    return Promise.all([
      availability.refetch(),
      // The page's own reads refetch directly; the rest of the record (and the lists) are marked stale.
      ...(latest.current.readAllowed ? [details.refetch(), thread.refetch(),
        invalidateRecord(RECORD_READS.filter((action) => action !== "details" && action !== "thread"))] : []),
    ]);
  }
  function refreshDetails() { if (currentOrigin() && latest.current.readAllowed) return details.refetch(); }
  function refreshThread() { if (currentOrigin() && latest.current.readAllowed) return thread.refetch(); }
  function openProviderLink() {
    if (!readableNow()) return;
    void openProvider.run(async () => {
      if (readableNow()) await Linking.openURL(item.url);
    });
  }

  const desktopUnavailable = scopeCurrent && availability.data?.available === false && getQueryPresentation(availability) === "ready";
  const accessMessage = !scopeCurrent
    ? copy(...RECORD_ACCESS_UNAVAILABLE)
    : desktopUnavailable ? copy("Bilgisayardaki Bycoda bağlantısı bekleniyor. Yeni gönderimler durduruldu; mevcut işlemin sonucu korunuyor.",
      "Waiting for desktop Bycoda. New sends are disabled; the current operation result is retained.") : undefined;
  const operationMessage = !contentAvailable ? uncertain
    ? copy("Gönderimin sonucu doğrulanamadı. Yeniden göndermeden önce konuşmayı serviste kontrol et.",
      "The send result is uncertain. Check the provider conversation before sending again.")
    : busy ? copy("Çalışıyor…", "Working…") : undefined : undefined;
  const prActions = providerPrActions(item);
  const reviewAvailable = item.kind === "pr" && item.provider === "github" && client?.machine.capabilities?.includes("inbox.review.v1");
  const snapshotLabels = item.provider === "github" && item.kind === "pr" ? [] : item.labels ?? [];
  return (
    <Screen
      scroll={false}
      query={readAllowed ? { ...thread, data: contentAvailable ? thread.data : undefined, refetch: refreshThread } : availability}
      refresh={refreshConversation}
    >
      <ProviderInboxConversation
        provider={item.provider}
        visible={contentAvailable}
        hideFeedback={sharedReadFailure}
        thread={{...thread, data: contentAvailable ? thread.data : undefined, refetch: refreshThread}}
        refresh={refreshConversation}
        onManageConnections={manageConnections}
        onReply={(comment) => { if (editableNow() && commentReady) { form.setField("reply", comment); setComposing(true); } }}
        disabled={busy || !writeAllowed}
        showBotActivity={showBotActivity}
        onShowBotActivity={item.provider === "github" && item.kind === "pr" ? setShowBotActivity : undefined}
        // Reactions stay hidden until the thread read carries existing reactions: adding or removing
        // one blindly, with no visible result, is not a usable control.
        header={<Stack>
      {contentAvailable ? <>
        {/* Identity comes from the list row already on the phone, so the page opens complete; only
            the author and branches wait for the details read. */}
        <Heading>{item.title}</Heading>
        <Row>
          {/* The same status presentation as the list row: quiet text, a badge only for what needs action. */}
          {item.draft ? <Badge label={copy("Taslak", "Draft")} /> : <ProviderState label={providerStateLabel(item.state, copy)} tone={statusTone(item)} />}
          {details.data?.reviewDecision ? <ProviderState label={providerStateLabel(details.data.reviewDecision, copy)} tone={providerStateTone(details.data.reviewDecision)} /> : null}
        </Row>
        <RecordMeta source={[providerName(item.provider), item.repo, item.identifier ?? `#${item.number}`].filter(Boolean).join(" · ")}
          author={details.data?.author || undefined} head={details.data?.headRefName} base={details.data?.baseRefName} />
        {/* One compact action row: the primary review path, a comment, and a menu for everything else.
            Commenting waits for the conversation it is added to. */}
        <Row>
          {reviewAvailable ? <Button tone="primary" density="compact"
            label={copy("Dosyalar ve inceleme", "Files and review")} disabled={busy || uncertain || !readAllowed} onPress={() => { if (readableNow() && !latest.current.busy && !latest.current.uncertain) { rememberInboxRecord(origin, item); pushOnce(inboxReviewHref(input.item, origin)); } }} /> : null}
          <Button tone={reviewAvailable ? "quiet" : "primary"} density="compact" label={form.values.body.trim() ? copy("Yorum taslağına dön", "Continue comment draft") : copy("Yorum ekle", "Add a comment")} disabled={busy || !writeAllowed || !thread.data || !commentReady} onPress={() => { if (editableNow()) setComposing(true); }} />
          <ActionMenu
            label={copy("Diğer işlemler", "More actions")}
            busy={submission.isPending && pendingAction === "pr-action"}
            // State changes; closing is the destructive last item and, like every state change, opens
            // its own confirmation. Bot activity is folded from the Conversation header instead.
            actions={[
              ...prActions.map((action) => ({
                key: action,
                group: "state",
                destructive: action === "close",
                // Merge and close open their own confirmation; the reversible ones run at once.
                reviewed: true,
                icon: prActionIcon(action, colors.muted),
                label: providerActionLabel(action, copy),
                disabled: busy || uncertain || !writeAllowed || (["merge", "squash", "rebase"].includes(action) && !!mergeBlocked),
                ...(["merge", "squash", "rebase"].includes(action) && mergeBlocked && !busy && !uncertain && writeAllowed ? { detail: mergeBlocked } : {}),
                onPress: () => stateAction(action),
              })),
            ]}
          />
          {/* The most used way out: the record on its provider, one tap from the action row. */}
          {/^https:\/\//i.test(item.url) ? <IconButton label={copy("Serviste aç", "Open in provider")} disabled={openProvider.isPending} onPress={openProviderLink}>
            <ExternalLink size={iconSize.action} color={colors.muted} />
          </IconButton> : null}
        </Row>
      </> : (
        <Row>
          <Button
            label={closeLabel ?? copy("Gelen kutusuna dön", "Back to inbox")}
            disabled={busy}
            tone="quiet" flush
            onPress={requestClose}
          />
        </Row>
      )}
      {/* Shown content refreshes quietly: one line, never a placeholder over data already read. */}
      {contentAvailable && ((details.isFetching && details.data !== undefined) || (thread.isFetching && thread.data !== undefined))
        ? <StatusLine busy label={copy("Yenileniyor…", "Refreshing…")} /> : null}
      {contentAvailable ? <MutationState mutation={openProvider} /> : null}
      {/* A state change (and any uncertain write) reports here; a failed label or reviewer change is a toast. */}
      {contentAvailable && (pendingAction === "pr-action" || ((pendingAction === "reviewers" || pendingAction === "labels" || pendingAction === "reaction") && (uncertain || submission.isPending)))
        ? <MutationState mutation={submission} /> : null}
      {scopeCurrent ? <QueryState query={{ ...availability, refetch: refreshConversation }} loading="none" onManageConnections={manageConnections} /> : null}
      {/* Connection and access are one status line; only an uncertain send is a notice to read before acting. */}
      {accessMessage ? <StatusLine tone="warning" label={accessMessage} /> : null}
      {operationMessage ? uncertain ? <Notice tone="warning" message={operationMessage} /> : <StatusLine busy label={operationMessage} /> : null}
      {contentAvailable ? <>
      {/* A few badges: shown in place, never folded behind a disclosure. */}
      {(snapshotLabels.length || item.assignees?.length) ? <Row>
        {snapshotLabels.map((label) => (
          <Badge key={label.name} label={label.name} />
        ))}
        {(item.assignees ?? []).map((assignee) => (
          <Badge key={assignee.login} label={`@${assignee.login}`} />
        ))}
      </Row> : null}
      {/* Shaped like the description (a few text lines), with its own compact error and Retry. */}
      <QueryState size="compact" loading="content" query={{...details, refetch: sharedReadFailure ? refreshConversation : refreshDetails}} onManageConnections={manageConnections} />
      {details.data ? <ProviderInboxDescription details={details.data} /> : null}
      {item.provider === "github" && item.kind === "pr" ? <PullRequestMetadata input={input} canRead={contentAvailable} disabled={busy || uncertain || !writeAllowed} onCommand={submit} /> : null}
      {extra}
      </> : readAllowed ? <>
        <QueryState query={{...details, data: undefined, refetch: sharedReadFailure ? refreshConversation : refreshDetails}} onManageConnections={manageConnections} />
        {!sharedReadFailure ? <QueryState query={{...thread, data: undefined, refetch: refreshThread}} onManageConnections={manageConnections} /> : null}
      </> : null}
      </Stack>} />
      <Sheet visible={composing && contentAvailable} size="form"
        title={form.values.reply ? copy("{p0} için yanıt", "Reply to {p0}", { p0: form.values.reply.author }) : copy("Yorum ekle", "Add a comment")} dismissible={!busy} onClose={() => setComposing(false)}>
      <ProviderInboxComposer
        item={item}
        draft={form.values}
        onChange={(change) => { if (editableNow()) form.patch(change); }}
        onConfirm={confirmComment}
        submission={submission}
        canSend={!!thread.data && writeAllowed}
      />
      </Sheet>
    </Screen>
  );
}

/** The bot-activity choice outlives one record for the rest of this app run. */
const rememberedBotActivity = { show: true };

const RECORD_READS = ["list", "details", "thread", "checks", "reviewers", "labels", "review-context"] as const;
/** The reads a write can change; the rest of the record stays as read. */
function writeRefreshes(action: InboxWriteCommand["action"]): readonly string[] {
  switch (action) {
    case "comment": case "reaction": return ["thread"];
    case "labels": return ["labels", "list"];
    case "reviewers": return ["reviewers", "details"];
    case "pr-action": return ["list", "details", "checks", "review-context"];
    default: return RECORD_READS;
  }
}

function prActionIcon(action: RemoteInboxPrAction, color: string) {
  const Icon = action === "reopen" ? RotateCcw : action === "close" ? GitPullRequestClosed : action === "draft" ? GitPullRequestDraft
    : action === "ready" ? FileCheck : GitMerge;
  return <Icon size={iconSize.row} color={color} />;
}

/** The record's state tone; one owner with the list row (`statusTone`). */
export const recordStateTone = statusTone;

/** Below this a description is a few lines: no disclosure. */
export const DESCRIPTION_FOLD_CHARS = 400;

function ProviderInboxDescription({ details }: ProviderInboxDescriptionProps) {
  const copy = useCopy();
  if (!details.body) return null;
  // A short description is read in place; only a long one folds (open by default up to 1200 characters).
  if (details.body.length < DESCRIPTION_FOLD_CHARS) return <MessageText text={details.body} role="assistant" />;
  return (
    <Disclosure label={copy("Açıklama", "Description")} defaultExpanded={details.body.length < 1200}>
      <MessageText text={details.body} role="assistant" />
    </Disclosure>
  );
}
