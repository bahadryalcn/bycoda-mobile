import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  RemoteInboxItem,
  RemoteInboxReviewComment,
  RemoteInboxReview,
} from "../../../../src/features/inbox/model/remoteInbox";
import { useActiveMachine, useMachines } from "@/state/machines";
import {
  Body,
  Button,
  Field,
  Notice,
  QueryState,
  Row,
  ScreenList,
  SelectField,
  Sheet,
  Stack,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { ErrorText } from "../workspace/shared";
import { useInboxRead } from "./provider-queries";
import { inboxItemInput, isInboxOriginCurrent, isInboxPrivateFailure } from "./provider-model";
import type { InboxOrigin } from "./provider-protocol";
import { prReviewLines, reviewedPrSubmission, type PrReviewLine } from "./provider-review-model";
import { usePrReviewDelivery } from "./provider-review-delivery";
import { emptyPrReviewDraft, sameReviewedPrDraft } from "./provider-review-draft";
import { ProviderPrReviewPreflight } from "./provider-pr-review-preflight";
import { prReviewDecisionLabel } from "./provider-labels";

export function ProviderPrReview({
  item: suppliedItem,
  origin,
  canRead,
  canWrite,
  onClose,
}: {
  item: RemoteInboxItem;
  origin: InboxOrigin;
  canRead: boolean;
  canWrite: boolean;
  onClose: () => void;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [opening] = useState(origin);
  const [item] = useState(suppliedItem);
  const writeAllowed = useRef(canWrite);
  writeAllowed.current = canWrite;
  const [preflight, setPreflight] = useState<RemoteInboxReview | null>(null);
  const reviewOwner = useRef(preflight); reviewOwner.current = preflight;
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; reviewOwner.current = null; }; }, []);
  const [editor, setEditor] = useState<number | null>(null);
  const supported =
    item.kind === "pr" &&
    item.provider === "github" &&
    machine?.id === opening.machineId &&
    !!machine.capabilities?.includes("inbox.review.v1");
  const originCurrent = isInboxOriginCurrent(opening, useMachines.getState());
  const readAllowed = supported && canRead && originCurrent;
  const readAccess = useRef(readAllowed); readAccess.current = readAllowed;
  const input = inboxItemInput(item, opening.projectId);
  const query = useInboxRead({ action: "review-context", input }, readAllowed);
  const privateFailure = isInboxPrivateFailure(query.error);
  const contentAvailable = readAllowed && !privateFailure;
  const context = contentAvailable ? query.data : undefined;
  const delivery = usePrReviewDelivery(opening, item, input);
  const { draft, value, busy, error } = delivery;
  const stale = !!value.commitId && value.commitId !== context?.commitId;
  const locked =
    !contentAvailable ||
    !canWrite ||
    !draft.ready ||
    !!draft.error ||
    busy ||
    !!value.pending ||
    !!value.completed;
  const rows = useMemo(() => {
    try {
      const lines = context?.truncated
        ? context.patch
            .split("\n")
            .slice(0, 50_000)
            .flatMap((line, at) =>
              Array.from({ length: Math.max(1, Math.ceil(line.length / 4000)) }, (_, part) => ({
                id: `partial:${at}:${part}`,
                path: "",
                text: line.slice(part * 4000, (part + 1) * 4000),
                kind: "context" as const,
                side: "RIGHT" as const,
                line: at + 1,
                commentable: false,
              })),
            )
        : (context ? prReviewLines(context) : []).map((line) => ({
            ...line,
            commentable: true,
          }));
      return { lines, error: null };
    } catch (cause) {
      return { lines: [] as Array<PrReviewLine & { commentable: boolean }>, error: cause };
    }
  }, [context]);
  const current = () => mounted.current && isInboxOriginCurrent(opening, useMachines.getState());
  const refreshContext = () => {
    if (readAccess.current && current()) return query.refetch();
  };
  const readyToReview = !locked && !stale && !!context && !query.isFetching && !query.error && !rows.error;
  const latest = useRef({ locked, readyToReview, value, context, contentAvailable, busy });
  latest.current = { locked, readyToReview, value, context, contentAvailable, busy };
  const closePreflight = () => { reviewOwner.current = null; setPreflight(null); };
  useLayoutEffect(() => {
    if (preflight && (!readyToReview || !sameReviewedPrDraft(value, preflight))) closePreflight();
  }, [preflight, readyToReview, value]);
  const patch = (change: Partial<typeof value>) => {
    if (!latest.current.locked && !reviewOwner.current && current())
      draft.setValue((latest) => ({ ...(latest ?? emptyPrReviewDraft()), ...change }));
  };
  const bindHead = () => {
    if (!context || latest.current.locked || reviewOwner.current || !current()) return;
    const reviewedValue = value, reviewedHead = context.commitId;
    const apply = () => {
      if (!current() || latest.current.locked || reviewOwner.current || latest.current.value !== reviewedValue ||
        latest.current.context?.commitId !== reviewedHead) return;
      patch({ commitId: context!.commitId, comments: [] });
      setEditor(null);
    };
    if (value.comments.length)
      confirmAction(
        copy("İnceleme hedefini değiştir", "Change reviewed head"),
        copy(
          "Satır yorumları eski commit’e bağlı. Yeni diff’i incelerken satır yorumları kaldırılır; özetin korunur.",
          "Inline comments belong to the old commit. Starting the current diff removes inline comments and keeps your summary.",
        ),
        copy("Güncel commit’i incele", "Review current head"),
        apply,
        copy("Vazgeç", "Cancel"),
      );
    else apply();
  };
  const addComment = (line: PrReviewLine) => {
    if (latest.current.locked || reviewOwner.current || stale || !value.commitId || !current() || value.comments.length >= 50) return;
    const existing = value.comments.findIndex(
      (comment) =>
        comment.path === line.path && comment.side === line.side && comment.line === line.line,
    );
    if (existing >= 0) {
      setEditor(existing);
      return;
    }
    patch({
      comments: [
        ...value.comments,
        { path: line.path, side: line.side, line: line.line, body: "" },
      ],
    });
    setEditor(value.comments.length);
  };
  const send = () => {
    if (!latest.current.readyToReview || latest.current.value !== value || latest.current.context !== context ||
      reviewOwner.current || !context || !current()) return;
    try {
      const reviewed = reviewedPrSubmission(context, value.event, value.body, value.comments);
      reviewOwner.current = reviewed; setPreflight(reviewed);
    } catch { /* Existing validation owns invalid or stale drafts. */ }
  };
  const confirmPreflight = () => {
    if (!preflight || reviewOwner.current !== preflight || !current() || !writeAllowed.current ||
      !latest.current.readyToReview || latest.current.context?.commitId !== preflight.commitId ||
      !sameReviewedPrDraft(latest.current.value, preflight)) return;
    reviewOwner.current = null; setPreflight(null);
    void delivery.submit(preflight);
  };
  let valid = false;
  try {
    if (context && value.commitId === context.commitId) {
      reviewedPrSubmission(context, value.event, value.body, value.comments);
      valid = true;
    }
  } catch {
    /* The exact displayed anchors and bounded content gate submission. */
  }
  const selected = editor === null ? undefined : value.comments[editor];
  const updateComment = (change: Partial<RemoteInboxReviewComment>) => {
    if (editor === null || !selected) return;
    patch({
      comments: value.comments.map((comment, index) =>
        index === editor ? { ...comment, ...change } : comment,
      ),
    });
  };
  return (
    <>
    <Sheet
      visible
      title={copy("Pull request incelemesi", "Pull request review")}
      size="full"
      scroll={false}
      dirty={!!value.body || !!value.comments.length}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <Button
          label={copy("İncelemeyi gönder", "Submit review")}
          busy={busy}
          disabled={!!preflight || locked || stale || !valid || query.isFetching || !!query.error || !!rows.error}
          onPress={send}
        />
      }
    >
      <ScreenList<PrReviewLine & { commentable: boolean }>
        data={contentAvailable ? rows.lines : []}
        keyExtractor={(line) => line.id}
        header={
          <Stack>
            {contentAvailable ? <Body>{`${item.repo} #${item.number}`}</Body> : null}
            {!originCurrent || !canRead ? (
              <Notice message={copy("İnceleme erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.",
                "Review access is unavailable. Check the original computer and project connection.")} />
            ) : !supported ? (
              <Notice
                message={copy(
                  "Pull request incelemesi için bilgisayardaki bycoda’yı güncelle.",
                  "Update bycoda on this computer to review pull requests.",
                )}
              />
            ) : (
              <QueryState query={{ ...query, data: context, refetch: refreshContext }} />
            )}
            <ErrorText error={contentAvailable ? draft.error || error || rows.error : undefined} />
            {contentAvailable && draft.error ? (
              <Button
                label={copy("Taslağı yeniden yükle", "Retry loading draft")}
                onPress={() => {
                  void draft.load();
                }}
              />
            ) : null}
            {value.pending ? (
              <>
                <Notice
                  message={copy(
                    "İncelemenin sonucu doğrulanmadı. Yeni inceleme göndermeden önce mevcut isteği kontrol et.",
                    "The review outcome is unconfirmed. Check the existing request before submitting another review.",
                  )}
                />
                <Button
                  label={copy("İnceleme sonucunu kontrol et", "Check review result")}
                  busy={busy}
                  disabled={!contentAvailable}
                  onPress={() => {
                    if (latest.current.contentAvailable && current()) void delivery.reconcile();
                  }}
                />
              </>
            ) : null}
            {value.completed ? (
              <>
                <Notice
                  tone="success"
                  message={copy("İnceleme tamamlandı.", "Review completed.")}
                />
                <Button
                  label={copy("Yeni bir inceleme hazırla", "Prepare another review")}
                  disabled={!contentAvailable || busy}
                  onPress={() => {
                    if (latest.current.contentAvailable && !latest.current.busy && current()) draft.setValue(emptyPrReviewDraft());
                  }}
                />
              </>
            ) : null}
            {contentAvailable ? <>
            {context ? (
              <>
                <Body mono>{context.commitId}</Body>
                <Body>{`+${context.additions} −${context.deletions} · ${context.files.length}`}</Body>
                {context.truncated ? (
                  <Notice
                    tone="warning"
                    message={copy(
                      "Diff kısmi. Satır yorumu eklenemez; yalnız özet incelemesi gönderilebilir.",
                      "The diff is partial. Inline comments are unavailable; you can submit a summary review.",
                    )}
                  />
                ) : null}
                {stale ? (
                  <Notice
                    tone="warning"
                    message={copy(
                      "Pull request commit’i değişti. Eski satır yorumları korunuyor; göndermeden önce güncel diff’i incele.",
                      "The pull request head changed. Old inline comments are retained; review the current diff before submitting.",
                    )}
                  />
                ) : null}
                <Row>
                  <Button busy={query.isFetching}
                    tone="quiet"
                    label={copy("Diff’i yenile", "Refresh diff")}
                    disabled={!!preflight || busy || !!value.pending || !current()}
                    onPress={() => {
                      void refreshContext();
                    }}
                  />
                  <Button
                    label={copy("Güncel commit’i incele", "Review current head")}
                    disabled={!!preflight || locked || query.isFetching || !!query.error}
                    onPress={bindHead}
                  />
                </Row>
              </>
            ) : null}
            <SelectField
              label={copy("İnceleme kararı", "Review decision")}
              value={value.event}
              disabled={!!preflight || locked}
              onChange={(event) => patch({ event: event as typeof value.event })}
              options={(["COMMENT", "APPROVE", "REQUEST_CHANGES"] as const).map((event) => ({
                value: event,
                label: prReviewDecisionLabel(event, copy),
              }))}
            />
            <Field
              label={copy("İnceleme özeti", "Review summary")}
              value={value.body}
              multiline
              maxLength={30_000}
              editable={!preflight && !locked}
              onChangeText={(body) => patch({ body })}
            />
            {value.comments.map((comment, index) => (
              <Button
                key={`${comment.path}:${comment.side}:${comment.line}:${index}`}
                tone="quiet"
                label={`${comment.path}:${comment.side}:${comment.line}`}
                disabled={!!preflight || locked}
                onPress={() => setEditor(index)}
              />
            ))}
            {selected ? (
              <Stack>
                <Body mono>{`${selected.path}:${selected.side}:${selected.line}`}</Body>
                <Field
                  label={copy("Satır yorumu", "Inline comment")}
                  value={selected.body}
                  maxLength={30_000}
                  multiline
                  editable={!preflight && !locked}
                  onChangeText={(body) => updateComment({ body })}
                />
                <Button
                  tone="quiet"
                  label={copy("Satır yorumunu kaldır", "Remove inline comment")}
                  disabled={!!preflight || locked}
                  onPress={() => {
                    patch({ comments: value.comments.filter((_, index) => index !== editor) });
                    setEditor(null);
                  }}
                />
              </Stack>
            ) : null}
            </> : null}
          </Stack>
        }
        renderItem={({ item: line }) => (
          <Stack>
            {line.commentable ? (
              <Body mono>{`${line.path} · ${line.side}:${line.line}`}</Body>
            ) : null}
            <Body
              mono
            >{`${line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}${line.text}`}</Body>
            {line.commentable ? (
              <Button
                tone="quiet"
                label={copy("Bu satıra yorum ekle", "Comment on this line")}
                disabled={!!preflight || locked || stale || !value.commitId || value.comments.length >= 50}
                onPress={() => addComment(line)}
              />
            ) : null}
          </Stack>
        )}
      />
    </Sheet>
    {preflight && readyToReview ? <ProviderPrReviewPreflight item={item} review={preflight}
      onClose={() => { if (reviewOwner.current === preflight) closePreflight(); }} onConfirm={confirmPreflight} /> : null}
    </>
  );
}
