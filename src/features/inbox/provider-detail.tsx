import { providerStateLabel } from "./provider-labels";
import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { RemoteInboxPrAction } from "../../../../src/features/inbox/model/remoteInbox";
import { useAsyncAction } from "@/state/actions";
import { useFormDraft } from "@/state/form-draft";
import { useMachines } from "@/state/machines";
import { hostKey, useHostClient } from "@/state/queries";
import {
  Badge,
  Body,
  Button,
  Card,
  MutationState,
  Notice,
  QueryState,
  Row,
  Screen,
  Section,
  Sheet,
} from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { useSheetGuard } from "@/ui/sheet-guard";
import { MessageText } from "@/ui/message-text";
import { providerActionLabel } from "./provider-labels";
import { providerPrActions } from "./provider-actions";
import { ProviderInboxComposer } from "./provider-composer";
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
  item,
  origin,
  availability,
  onClose,
}: ProviderInboxDetailProps) {
  const copy = useCopy();
  const client = useHostClient();
  const cache = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const form = useFormDraft<InboxCommentDraft>(emptyInboxCommentDraft);
  const [composing, setComposing] = useState(false);
  const submission = useAsyncAction<InboxWriteResult>();
  const openProvider = useAsyncAction<void>();
  const access = providerInboxAccess(availability);
  const latestWriteAccess = useRef(access.canWrite);
  latestWriteAccess.current = access.canWrite;
  const input = inboxItemInput(item, origin.projectId);
  const details = useInboxRead<"details">({ action: "details", input }, access.canRead);
  const thread = useInboxRead<"thread">({ action: "thread", input }, access.canRead);
  const uncertain = isInboxWriteUncertain(submission.error);
  const busy = submission.isPending;
  const { requestClose } = useSheetGuard({ dirty: !!form.values.body.trim(), pending: busy, onClose });
  const currentOrigin = () =>
    mounted.current && isInboxOriginCurrent(origin, useMachines.getState());

  function submit(command: InboxWriteCommand, draft?: InboxCommentDraft) {
    if (busy || uncertain || !latestWriteAccess.current) return;
    void submission.run(async () => {
      // An old confirmation cannot authorize a newly selected computer or project.
      if (!currentOrigin())
        throw new InboxJobError("This inbox changed. Open the item again before sending.");
      if (!latestWriteAccess.current) {
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
    if (busy || uncertain || !access.canWrite) return;
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
    void availability.refetch();
    if (access.canRead) {
      void details.refetch();
      void thread.refetch();
    }
  }

  function openProviderLink() {
    void openProvider.run(async () => {
      await Linking.openURL(item.url);
    });
  }

  const prActions = providerPrActions(item);
  return (
    <Screen
      subtitle={`${providerName(item.provider)} · ${item.identifier ?? `#${item.number}`} · ${providerStateLabel(item.state, copy)}`}
      query={access.canRead ? thread : availability}
      refresh={refreshConversation}
    >
      <Row>
        <Button
          label={copy("Gelen kutusuna dön", "Back to inbox")}
          disabled={busy}
          tone="quiet"
          onPress={requestClose}
        />
        {/^https:\/\//i.test(item.url) ? (
          <Button
            label={copy("Serviste aç", "Open in provider")}
            busy={openProvider.isPending}
            onPress={openProviderLink}
          />
        ) : null}
      </Row>
      <MutationState mutation={openProvider} />
      <QueryState query={availability} loading="none" />
      {availability.data?.available === false ? (
        <Notice
          tone="warning"
          message={copy(
            "Bilgisayardaki Bycoda bağlantısı bekleniyor. Yeni gönderimler durduruldu; mevcut işlemin sonucu korunuyor.",
            "Waiting for desktop Bycoda. New sends are disabled; the current operation result is retained.",
          )}
        />
      ) : null}
      <Row>
        {(item.labels ?? []).map((label) => (
          <Badge key={label.name} label={label.name} />
        ))}
        {(item.assignees ?? []).map((assignee) => (
          <Badge key={assignee.login} label={`@${assignee.login}`} />
        ))}
      </Row>
      <QueryState query={details} />
      {details.data ? <ProviderInboxDescription details={details.data} /> : null}
      {prActions.length ? (
        <Section title={copy("Pull request işlemleri", "Pull request actions")}>
          <Row>
            {prActions.map((action) => (
              <Button
                key={action}
                label={providerActionLabel(action, copy)}
                disabled={busy || uncertain || !access.canWrite}
                onPress={() => stateAction(action)}
              />
            ))}
          </Row>
        </Section>
      ) : null}
      <Button label={form.values.body.trim() ? copy("Yorum taslağına dön", "Continue comment draft") : copy("Yorum ekle", "Add a comment")} disabled={busy || !access.canWrite} onPress={() => setComposing(true)} />
      <ProviderInboxConversation
        provider={item.provider}
        thread={thread}
        onReply={(comment) => { form.setField("reply", comment); setComposing(true); }}
        disabled={busy}
      />
      <Sheet visible={composing} size="form" title={copy("Yorum", "Comment")} dismissible={!busy} onClose={() => setComposing(false)}>
      <ProviderInboxComposer
        item={item}
        draft={form.values}
        onChange={form.patch}
        onConfirm={confirmComment}
        submission={submission}
        canSend={!!thread.data && access.canWrite}
      />
      </Sheet>
    </Screen>
  );
}

function ProviderInboxDescription({ details }: ProviderInboxDescriptionProps) {
  const copy = useCopy();
  return (
    <Card>
      <Body muted>{details.author}</Body>
      <MessageText text={details.body || copy("Açıklama yok.", "No description.")} role="assistant" />
      {details.headRefName && details.baseRefName ? (
        <Body mono>
          {details.headRefName} → {details.baseRefName}
        </Body>
      ) : null}
      {details.reviewDecision ? <Badge label={providerStateLabel(details.reviewDecision, copy)} /> : null}
    </Card>
  );
}
