import { providerStateLabel, providerStateTone } from "./provider-labels";
import { router } from "expo-router";
import { getQueryPresentation } from "@/ui/query-presentation";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Linking } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { RemoteInboxPrAction } from "../../../../src/features/inbox/model/remoteInbox";
import { useAsyncAction } from "@/state/actions";
import { useFormDraft } from "@/state/form-draft";
import { useMachines } from "@/state/machines";
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
} from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { useSheetGuard } from "@/ui/sheet-guard";
import { MessageText } from "@/ui/message-text";
import { providerActionLabel } from "./provider-labels";
import { providerPrActions } from "./provider-actions";
import { ProviderInboxComposer } from "./provider-composer";
import { ProviderPrReview } from "./provider-pr-review";
import type {
  ConfirmedInboxComment,
  ProviderInboxDetailProps,
  ProviderInboxDescriptionProps,
} from "./provider-component-types";
import { ProviderInboxConversation } from "./provider-conversation";
import { InboxJobError, isInboxWriteUncertain, runInboxJob } from "./provider-jobs";
import {
  inboxItemInput,
  isInboxOriginCurrent,
  isInboxPrivateFailure,
  providerInboxAccess,
  providerName,
} from "./provider-model";
import type { InboxWriteCommand, InboxWriteResult } from "./provider-protocol";
import { useInboxRead } from "./provider-queries";
import {
  acknowledgeInboxComment,
  emptyInboxCommentDraft,
  type InboxCommentDraft,
} from "./provider-state";

export { type ProviderInboxDetailProps } from "./provider-component-types";

export function ProviderInboxDetail({
  item: incomingItem,
  origin: incomingOrigin,
  availability,
  onClose,
}: ProviderInboxDetailProps) {
  const copy = useCopy();
  const [item] = useState(incomingItem), [origin] = useState(incomingOrigin);
  const client = useHostClient();
  const cache = useQueryClient();
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const form = useFormDraft<InboxCommentDraft>(emptyInboxCommentDraft);
  const [composing, setComposing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [pendingAction, setPendingAction] = useState<InboxWriteCommand["action"] | null>(null);
  const submission = useAsyncAction<InboxWriteResult>();
  const openProvider = useAsyncAction<void>();
  const access = providerInboxAccess(availability);
  const scopeCurrent = isInboxOriginCurrent(origin, useMachines.getState());
  const readAllowed = access.canRead && scopeCurrent;
  const input = inboxItemInput(item, origin.projectId);
  const details = useInboxRead<"details">({ action: "details", input }, readAllowed);
  const thread = useInboxRead<"thread">({ action: "thread", input }, readAllowed);
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
  const { requestClose, requestCloseThen } = useSheetGuard({ dirty: !!form.values.body.trim(), pending: busy, onClose });
  const manageConnections = () => requestCloseThen(() => router.push("/machines"));
  const currentOrigin = () =>
    mounted.current && isInboxOriginCurrent(origin, useMachines.getState());

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
      void cache.invalidateQueries({ queryKey: hostKey(origin.machineId, ["provider-inbox"]) });
      if (currentOrigin()) {
        if (draft) form.reset((current) => acknowledgeInboxComment(current, draft));
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
    confirmAction(
      copy("Pull request durumunu değiştir", "Change pull request state"),
      `${item.repo} #${item.number}\n${providerActionLabel(action, copy)}`,
      copy("Uygula", "Apply"),
      () =>
        submit({
          action: "pr-action",
          input: { ...input, prAction: action, confirm: "CHANGE_PR_STATE" },
        }),
      copy("Vazgeç", "Cancel"),
    );
  }

  function refreshConversation() {
    if (!currentOrigin()) return;
    return Promise.all([
      availability.refetch(),
      ...(latest.current.readAllowed ? [details.refetch(), thread.refetch()] : []),
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
    ? copy("Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.", "Record access is unavailable. Check the original computer and project connection.")
    : desktopUnavailable ? copy("Bilgisayardaki Bycoda bağlantısı bekleniyor. Yeni gönderimler durduruldu; mevcut işlemin sonucu korunuyor.",
      "Waiting for desktop Bycoda. New sends are disabled; the current operation result is retained.") : undefined;
  const operationMessage = !contentAvailable ? uncertain
    ? copy("Gönderimin sonucu doğrulanamadı. Yeniden göndermeden önce konuşmayı serviste kontrol et.",
      "The send result is uncertain. Check the provider conversation before sending again.")
    : busy ? copy("Çalışıyor…", "Working…") : undefined : undefined;
  const prActions = providerPrActions(item);
  return (
    <Screen
      query={readAllowed ? { ...thread, data: contentAvailable ? thread.data : undefined, refetch: refreshThread } : availability}
      refresh={refreshConversation}
    >
      {contentAvailable ? <>
        <Heading>{item.title}</Heading>
        <Row>
          <Badge label={providerStateLabel(item.state, copy)} tone={providerStateTone(item.state)} />
          {item.draft ? <Badge label={copy("Taslak", "Draft")} /> : null}
        </Row>
        <Body muted>{`${providerName(item.provider)} · ${item.identifier ?? `#${item.number}`}`}</Body>
      </> : null}
      <Row>
        {!contentAvailable ? <Button
          label={copy("Gelen kutusuna dön", "Back to inbox")}
          disabled={busy}
          tone="quiet"
          onPress={requestClose}
        /> : null}
        {contentAvailable && /^https:\/\//i.test(item.url) ? (
          <Button
            label={copy("Serviste aç", "Open in provider")}
            busy={openProvider.isPending}
            onPress={openProviderLink}
          />
        ) : null}
        {contentAvailable ? <ActionMenu
          label={copy("Diğer işlemler", "More actions")}
          busy={submission.isPending && pendingAction === "pr-action"}
          actions={[
            { key: "back", label: copy("Gelen kutusuna dön", "Back to inbox"), disabled: busy, onPress: requestClose },
            ...prActions.map((action) => ({
              key: action,
              label: providerActionLabel(action, copy),
              disabled: busy || uncertain || !writeAllowed,
              onPress: () => stateAction(action),
            })),
          ]}
        /> : null}
      </Row>
      {contentAvailable ? <MutationState mutation={openProvider} /> : null}
      {contentAvailable && pendingAction === "pr-action" ? <MutationState mutation={submission} /> : null}
      {scopeCurrent ? <QueryState query={{ ...availability, refetch: refreshConversation }} loading="none" onManageConnections={manageConnections} /> : null}
      {accessMessage || operationMessage ? <Notice tone={uncertain || desktopUnavailable ? "warning" : undefined}
        message={[accessMessage, operationMessage].filter(Boolean).join(" ")} /> : null}
      {contentAvailable ? <>
      <Row>
        {(item.labels ?? []).map((label) => (
          <Badge key={label.name} label={label.name} />
        ))}
        {(item.assignees ?? []).map((assignee) => (
          <Badge key={assignee.login} label={`@${assignee.login}`} />
        ))}
      </Row>
      <QueryState query={{...details, refetch: sharedReadFailure ? refreshConversation : refreshDetails}} onManageConnections={manageConnections} />
      {details.data ? <ProviderInboxDescription details={details.data} /> : null}
      <Button tone="primary" label={form.values.body.trim() ? copy("Yorum taslağına dön", "Continue comment draft") : copy("Yorum ekle", "Add a comment")} disabled={busy || !writeAllowed} onPress={() => { if (editableNow()) setComposing(true); }} />
      {item.kind === "pr" && item.provider === "github" && client?.machine.capabilities?.includes("inbox.review.v1") ? <Button
        label={copy("Pull request incelemesi", "Pull request review")} disabled={busy || uncertain || !readAllowed} onPress={() => { if (readableNow() && !latest.current.busy && !latest.current.uncertain) setReviewing(true); }} /> : null}
      <ProviderInboxConversation
        provider={item.provider}
        hideFeedback={sharedReadFailure}
        thread={{...thread, refetch: refreshThread}}
        onManageConnections={manageConnections}
        onReply={(comment) => { if (editableNow()) { form.setField("reply", comment); setComposing(true); } }}
        disabled={busy || !writeAllowed}
      />
      </> : readAllowed ? <>
        <QueryState query={{...details, data: undefined, refetch: sharedReadFailure ? refreshConversation : refreshDetails}} onManageConnections={manageConnections} />
        {!sharedReadFailure ? <QueryState query={{...thread, data: undefined, refetch: refreshThread}} onManageConnections={manageConnections} /> : null}
      </> : null}
      {reviewing ? <ProviderPrReview item={item} origin={origin} canRead={contentAvailable} canWrite={writeAllowed} onClose={() => setReviewing(false)} /> : null}
      <Sheet visible={composing && contentAvailable} size="form" title={copy("Yorum", "Comment")} dismissible={!busy} onClose={() => setComposing(false)}>
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

function ProviderInboxDescription({ details }: ProviderInboxDescriptionProps) {
  const copy = useCopy();
  return (
    <Stack>
      <Body muted>{details.author}</Body>
      <Disclosure label={copy("Açıklama", "Description")} defaultExpanded={(details.body?.length ?? 0) < 1200}>
        <MessageText text={details.body || copy("Açıklama yok.", "No description.")} role="assistant" />
      </Disclosure>
      {details.headRefName && details.baseRefName ? (
        <Body mono>
          {details.headRefName} → {details.baseRefName}
        </Body>
      ) : null}
      {details.reviewDecision ? <Badge label={providerStateLabel(details.reviewDecision, copy)} /> : null}
    </Stack>
  );
}
