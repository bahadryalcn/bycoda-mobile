import { useMemo, useRef, useState } from "react";
import type {
  RemoteInboxItem,
  RemoteInboxReviewComment,
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
import { useSheetGuard } from "@/ui/sheet-guard";
import { ErrorText } from "../workspace/shared";
import { useInboxRead } from "./provider-queries";
import { inboxItemInput, isInboxOriginCurrent } from "./provider-model";
import type { InboxOrigin } from "./provider-protocol";
import { prReviewLines, reviewedPrSubmission, type PrReviewLine } from "./provider-review-model";
import { usePrReviewDelivery } from "./provider-review-delivery";
import { emptyPrReviewDraft } from "./provider-review-draft";
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
  const [editor, setEditor] = useState<number | null>(null);
  const supported =
    item.kind === "pr" &&
    item.provider === "github" &&
    machine?.id === opening.machineId &&
    !!machine.capabilities?.includes("inbox.review.v1");
  const input = inboxItemInput(item, opening.projectId);
  const query = useInboxRead({ action: "review-context", input }, supported && canRead);
  const delivery = usePrReviewDelivery(opening, item, input);
  const { draft, value, busy, error } = delivery;
  const stale = !!value.commitId && value.commitId !== query.data?.commitId;
  const locked =
    !supported ||
    !canWrite ||
    !draft.ready ||
    !!draft.error ||
    busy ||
    !!value.pending ||
    !!value.completed;
  const rows = useMemo(() => {
    try {
      const lines = query.data?.truncated
        ? query.data.patch
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
        : (query.data ? prReviewLines(query.data) : []).map((line) => ({
            ...line,
            commentable: true,
          }));
      return { lines, error: null };
    } catch (cause) {
      return { lines: [] as Array<PrReviewLine & { commentable: boolean }>, error: cause };
    }
  }, [query.data]);
  const current = () => isInboxOriginCurrent(opening, useMachines.getState());
  const { requestClose } = useSheetGuard({
    dirty: !!value.body || !!value.comments.length,
    pending: busy,
    onClose,
  });
  const patch = (change: Partial<typeof value>) => {
    if (!locked && current())
      draft.setValue((latest) => ({ ...(latest ?? emptyPrReviewDraft()), ...change }));
  };
  const bindHead = () => {
    if (!query.data || locked || !current()) return;
    const apply = () => {
      patch({ commitId: query.data!.commitId, comments: [] });
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
    if (locked || stale || !value.commitId || !current() || value.comments.length >= 50) return;
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
    if (
      locked ||
      stale ||
      !query.data ||
      query.isFetching ||
      query.error ||
      rows.error ||
      !current()
    )
      return;
    let review;
    try {
      review = reviewedPrSubmission(query.data, value.event, value.body, value.comments);
    } catch {
      return;
    }
    confirmAction(
      copy("Pull request incelemesini gönder", "Submit pull request review"),
      `${item.repo} #${item.number}\n${review.commitId}\n${prReviewDecisionLabel(review.event, copy)}\n${review.body}\n${copy("{p0} satır yorumu", "{p0} inline comments", { p0: review.comments.length })}`,
      copy("Gönder", "Submit"),
      () => {
        if (current() && writeAllowed.current) void delivery.submit(review);
      },
      copy("Vazgeç", "Cancel"),
    );
  };
  let valid = false;
  try {
    if (query.data && value.commitId === query.data.commitId) {
      reviewedPrSubmission(query.data, value.event, value.body, value.comments);
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
    <Sheet
      visible
      title={copy("Pull request incelemesi", "Pull request review")}
      size="full"
      scroll={false}
      onClose={requestClose}
      dismissible={!busy}
      footer={
        <Button
          label={copy("İncelemeyi gönder", "Submit review")}
          busy={busy}
          disabled={locked || stale || !valid || query.isFetching || !!query.error || !!rows.error}
          onPress={send}
        />
      }
    >
      <ScreenList<PrReviewLine & { commentable: boolean }>
        data={supported ? rows.lines : []}
        keyExtractor={(line) => line.id}
        header={
          <Stack>
            <Body>{`${item.repo} #${item.number}`}</Body>
            {!supported ? (
              <Notice
                message={copy(
                  "Pull request incelemesi için bilgisayardaki bycoda’yı güncelle.",
                  "Update bycoda on this computer to review pull requests.",
                )}
              />
            ) : (
              <QueryState query={query} />
            )}
            <ErrorText error={draft.error || error || rows.error} />
            {draft.error ? (
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
                  onPress={() => {
                    void delivery.reconcile();
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
                  disabled={busy}
                  onPress={() => {
                    if (current()) draft.setValue(emptyPrReviewDraft());
                  }}
                />
              </>
            ) : null}
            {supported && query.data ? (
              <>
                <Body mono>{query.data.commitId}</Body>
                <Body>{`+${query.data.additions} −${query.data.deletions} · ${query.data.files.length}`}</Body>
                {query.data.truncated ? (
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
                  <Button
                    tone="quiet"
                    label={copy("Diff’i yenile", "Refresh diff")}
                    disabled={busy || !!value.pending || !current()}
                    onPress={() => {
                      void query.refetch();
                    }}
                  />
                  <Button
                    label={copy("Güncel commit’i incele", "Review current head")}
                    disabled={locked || query.isFetching || !!query.error}
                    onPress={bindHead}
                  />
                </Row>
              </>
            ) : null}
            <SelectField
              label={copy("İnceleme kararı", "Review decision")}
              value={value.event}
              disabled={locked}
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
              editable={!locked}
              onChangeText={(body) => patch({ body })}
            />
            {value.comments.map((comment, index) => (
              <Button
                key={`${comment.path}:${comment.side}:${comment.line}:${index}`}
                tone="quiet"
                label={`${comment.path}:${comment.side}:${comment.line}`}
                disabled={locked}
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
                  editable={!locked}
                  onChangeText={(body) => updateComment({ body })}
                />
                <Button
                  tone="quiet"
                  label={copy("Satır yorumunu kaldır", "Remove inline comment")}
                  disabled={locked}
                  onPress={() => {
                    patch({ comments: value.comments.filter((_, index) => index !== editor) });
                    setEditor(null);
                  }}
                />
              </Stack>
            ) : null}
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
                disabled={locked || stale || !value.commitId || value.comments.length >= 50}
                onPress={() => addComment(line)}
              />
            ) : null}
          </Stack>
        )}
      />
    </Sheet>
  );
}
