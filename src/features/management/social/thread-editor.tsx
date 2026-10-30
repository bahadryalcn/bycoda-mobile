import { haptic } from "@/ui/motion";
import { useEffect, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine } from "@/state/reviewed-machine";
import { MessageText } from "@/ui/message-text";
import { Stack } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import {
  Body,
  Field,
  FormActions,
  Heading,
  MutationState,
  QueryState,
  SelectField,
  Button,
  Notice,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { sameFormValue, useFormDraft } from "@/state/form-draft";
import { useAsyncAction } from "@/state/actions";
import type { SocialThread } from "@/domain/types";
import { socialRequest as request } from "./request";
import { stamp } from "../shared/format";
import { exceedsSocialLimit, missingFactIds, socialCharacterCount } from "../social-content";
import { usePolicy, freshPolicy, PolicyInfo, PolicyCounter } from "./policy";
import { FactChoices } from "./fact-choices";
import type { ThreadEditorProps, ReplyFormDraft } from "./types";
import { isThreadPage, THREAD_PAGE_LIMIT, ThreadPageUnavailable } from "./thread-page";
import { accountIdentity } from "./review-presentation";
import { sameConnectionEpoch, useConnectionScope } from "./connection-scope";

export function ThreadEditor({ thread, recipientLabel, accounts, projects, profiles, onClose }: ThreadEditorProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  // The reviewed connection epoch has an explicit owner (state, not a memo that
  // React may discard); it changes only when endpoint, environment or credential do.
  const scope = useConnectionScope(machine);
  // A reply belongs to the connection that opened it. Re-pairing must require
  // reopening the view, without discarding this editor's unsaved text.
  const [openingScope] = useState(scope);
  const latestScope = useRef(scope);
  latestScope.current = scope;
  const matchesConnection = () => sameConnectionEpoch(latestScope.current, openingScope) &&
    isReviewedMachine(openingScope.review, useMachines.getState());
  const connectionChanged = !matchesConnection();
  const connectionMessage = copy("Bilgisayar bağlantısı değişti. Doğru bilgisayarı seçip bu görünümü yeniden açın.", "The computer connection changed. Select the correct computer and reopen this view.");
  const assertConnection = () => { if (!matchesConnection()) throw new Error(connectionMessage); };
  const [selection, setSelection] = useState<{ id: string; token: string; offset?: number }>({ id: thread.id, token: scope.token });
  const offset = selection.id === thread.id && selection.token === scope.token ? selection.offset : undefined;
  const input = { id: thread.id, limit: THREAD_PAGE_LIMIT, ...(offset === undefined ? {} : { offset }) };
  const updateMessage = copy("Bu bilgisayar sayfalı konuşma geçmişini desteklemiyor. Bilgisayardaki bycoda’yı güncelleyin. Geçmiş yüklenene kadar yanıt düzenleme kapalıdır.", "This computer does not support paged conversation history. Update bycoda on the computer. Reply editing is unavailable until history loads.");
  const query = useHostQuery<SocialThread>(
    ["social", "thread", thread.id, "page", scope.token, offset ?? "latest"],
    "social.request",
    {
      action: "thread.page",
      input,
    },
    { enabled: !connectionChanged, interval: 8000, queryFn: async (client, signal) => {
      assertConnection();
      let result: unknown;
      try {
        result = await client.request("social.request", { action: "thread.page", input }, { signal });
      } catch (error) {
        if (/unsupported social operation/i.test(error instanceof Error ? error.message : String(error))) throw new ThreadPageUnavailable(updateMessage);
        throw error;
      }
      assertConnection();
      if (!isThreadPage(result, thread.id, offset)) throw new ThreadPageUnavailable(updateMessage);
      return result;
    } },
  );
  const detail = !connectionChanged && isThreadPage(query.data, thread.id, offset) ? query.data : undefined;
  const unsupported = (!!query.data && !detail) || query.error instanceof ThreadPageUnavailable;
  const page = detail?.eventsPage;
  const [readAction, setReadAction] = useState<"refresh" | "earlier" | "next" | "latest" | null>(null);
  const readPending = useRef(false);
  useEffect(() => {
    if (!query.isFetching) {
      readPending.current = false;
      setReadAction(null);
    }
  }, [query.isFetching, offset, scope.token]);
  const navigatePage = (next: "earlier" | "next" | "latest", nextOffset?: number) => {
    if (readPending.current || query.isFetching || !matchesConnection()) return;
    readPending.current = true;
    setReadAction(next);
    setSelection({ id: thread.id, token: scope.token, offset: nextOffset });
  };
  const refreshPage = async () => {
    if (readPending.current || query.isFetching || !matchesConnection()) return;
    readPending.current = true;
    setReadAction("refresh");
    try { await query.refetch(); }
    finally { readPending.current = false; setReadAction(null); }
  };
  const policy = usePolicy(thread.accountId, { key: scope.token, enabled: !connectionChanged, assert: assertConnection });
  const form = useFormDraft<ReplyFormDraft>({ text: "", facts: [] });
  const latestForm = useRef(form);
  latestForm.current = form;
  const latestValues = useRef(form.values);
  latestValues.current = form.values;
  const updateDraft = (update: Partial<ReplyFormDraft>) => {
    // Input callbacks can arrive before React commits the disabled/pending render.
    latestValues.current = { ...latestValues.current, ...update };
    form.patch(update);
  };
  const { text, facts } = form.values;
  const action = useHostMutation("social.request", ["social"]);
  const submission = useAsyncAction();
  const assign = useHostMutation("social.request", ["social"]);
  const current = detail ?? thread;
  const account = accounts.find((value) => value.id === current.accountId);
  const assignable = projects.filter((project) => account?.grants[project.id]?.includes("read"));
  const profile = profiles.find((value) => value.projectId === current.projectId);
  const busy = submission.isPending || action.isPending || assign.isPending;
  const { requestClose } = useSheetGuard({ dirty: form.dirty, pending: busy, onClose });
  const save = () => {
    if (!detail || unsupported || !matchesConnection()) return Promise.resolve();
    const submitted = latestValues.current;
    return submission.run(async () => {
      assertConnection();
      const latest = await freshPolicy(policy, copy);
      assertConnection();
      const limit = exceedsSocialLimit(
        latest.effective,
        current.kind === "message" ? "message" : "comment",
        submitted.text,
      );
      if (limit)
        throw new Error(
          copy(
            "En fazla " + limit + " karakter kullanın.",
            "Use at most " + limit + " characters.",
          ),
        );
      await action.mutateAsync(
        request("replies.draft", {
          threadId: current.id,
          text: submitted.text,
          factIds: submitted.facts,
        }),
        {
          onSuccess: () => {
            if (!matchesConnection()) return;
            haptic.success();
            form.markSaved(submitted);
            if (sameFormValue(latestValues.current, submitted)) onClose();
          },
        },
      );
      assertConnection();
    });
  };
  if (connectionChanged) return <Stack>
    <Notice tone="warning" message={connectionMessage} />
    <Field label={copy("Yanıt taslağı", "Reply draft")} value={text} multiline editable={false} />
    <FormActions feedback={<><MutationState mutation={submission} /><MutationState mutation={assign} /></>}
      submitLabel={copy("Taslağı kaydet", "Save draft")} disabled busy={busy} onSubmit={save}
      cancelLabel={copy("Kapat", "Close")} cancelDisabled={busy} onCancel={requestClose} />
  </Stack>;
  return (
    <Stack>
      <Heading>{(current.contactId === thread.contactId && current.accountId === thread.accountId ? recipientLabel?.trim() : undefined) || current.contactId}</Heading>
      <Body muted>{[
        accountIdentity(accounts, current.accountId),
        current.projectId && `${copy("Proje", "Project")}: ${projects.find((project) => project.id === current.projectId)?.name ?? current.projectId}`,
      ].filter(Boolean).join(" · ")}</Body>
      {!unsupported && <QueryState query={query} loading={readAction ? "none" : "list"} />}
      {unsupported && <Notice tone="warning" message={updateMessage} />}
      <Button
        label={copy("Yenile", "Refresh")}
        tone="quiet"
        busy={readAction === "refresh"}
        disabled={query.isFetching || readAction !== null}
        onPress={() => void refreshPage()}
      />
      {((page && page.offset > 0) || readAction === "earlier") && <Button
        label={copy("Önceki mesajları yükle", "Load earlier messages")} tone="quiet"
        busy={readAction === "earlier"}
        disabled={query.isFetching || readAction !== null} onPress={() => { if (page) navigatePage("earlier", Math.max(0, page.offset - THREAD_PAGE_LIMIT)); }} />}
      {page && page.total > 0 && <Body muted>{page.offset + 1}–{Math.min(page.offset + page.limit, page.total)} / {page.total}</Body>}
      {detail?.events.map((event) => (
        <Stack key={event.id}>
          <Body muted>
            {event.direction === "inbound" ? copy("Gelen", "Received") : copy("Gönderilen", "Sent")}{" "}
            · {stamp(event.at)}
          </Body>
          <MessageText text={event.text} role="assistant" />
        </Stack>
      ))}
      {((page && page.offset + page.limit < page.total) || readAction === "next") && <Button label={copy("Sonraki", "Next")} tone="quiet"
        busy={readAction === "next"}
        disabled={query.isFetching || readAction !== null} onPress={() => { if (page) navigatePage("next", page.offset + THREAD_PAGE_LIMIT); }} />}
      {(offset !== undefined || readAction === "latest") && <Button label={copy("En sona git", "Jump to latest")} tone="quiet"
        busy={readAction === "latest"}
        disabled={query.isFetching || readAction !== null} onPress={() => navigatePage("latest")} />}
      {!current.projectId && (
        <>
          <Body>
            {copy(
              "Yanıt için konuşmayı bir projeye bağlayın.",
              "Assign the conversation to a project before replying.",
            )}
          </Body>
          {assignable.length ? (
            <SelectField
              label={copy("Proje", "Project")}
              placeholder={copy("Proje seçin", "Choose a project")}
              searchable
              disabled={busy || !detail || unsupported}
              options={assignable.map((project) => ({
                value: project.id,
                label: project.name,
                detail: project.cwd,
              }))}
              onChange={(projectId) => {
                if (!detail || unsupported || !matchesConnection()) return;
                assign.mutate(request("thread.assign", { id: current.id, projectId }), {
                  onSuccess: () => {
                    if (!matchesConnection()) return;
                    haptic.success();
                    // Project assignment does not save the reply being composed.
                    if (!latestForm.current.dirty &&
                      sameFormValue(latestValues.current, latestForm.current.values)) onClose();
                  },
                });
              }}
            />
          ) : null}
          {!assignable.length && (
            <Body muted>
              {copy(
                "Bu hesabın okuma izni olan bir projesi yok. Hesaplar bölümünden izin verin.",
                "This account has no project with read access. Grant access in Accounts.",
              )}
            </Body>
          )}
        </>
      )}
      {current.reviewReason && <Body>{current.reviewReason}</Body>}
      <QueryState query={policy} loading={query.isPending ? "none" : "inline"} />
      <PolicyInfo policy={policy.data?.effective} />
      <Field
        label={copy("Yanıt taslağı", "Reply draft")}
        value={text}
        onChangeText={(value) => updateDraft({ text: value })}
        multiline
        editable={!busy && !!detail && !unsupported}
      />
      <PolicyCounter
        policy={policy.data?.effective}
        kind={current.kind === "message" ? "message" : "comment"}
        text={text}
      />
      <FactChoices
        profile={profile}
        selected={facts}
        onChange={(facts) => updateDraft({ facts })}
        disabled={busy || !detail || unsupported}
      />
      <FormActions
        feedback={
          <>
            <MutationState mutation={submission} />
            <MutationState mutation={assign} />
          </>
        }
        submitLabel={copy("Taslağı kaydet", "Save draft")}
        busy={busy}
        disabled={
          !text.trim() ||
          !current.projectId ||
          !detail || unsupported ||
          !policy.data ||
          !!missingFactIds(facts, profile?.facts ?? []).length
        }
        onSubmit={save}
        cancelLabel={copy("Kapat", "Close")}
        cancelDisabled={busy}
        onCancel={requestClose}
      />
    </Stack>
  );
}
