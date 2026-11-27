import { useInboxLocalScope } from "./inbox-local-scope";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import type {
  RemoteInboxItem,
  RemoteInboxReview,
  RemoteInboxReviewComment,
} from "../../../../src/features/inbox/model/remoteInbox";
import { useActiveMachine } from "@/state/machines";
import {
  Body,
  Button,
  Notice,
  NoResults,
  QueryState,
  Screen,
  ScreenList,
  SearchField,
  SectionHeader,
  StateView,
  ToggleField,
  showToast,
  useCollapsibleSearch,
} from "@/ui/primitives";
import { isTestFile } from "../pull-requests/model/list";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { fontSize, lineHeight, space } from "@/ui/tokens";
import { ErrorText } from "../workspace/shared";
import { INBOX_RECORD_CACHE_MS, useInboxRead } from "./provider-queries";
import { inboxItemInput, isInboxPrivateFailure } from "./provider-model";
import type { InboxOrigin } from "./provider-protocol";
import { reviewedPrSubmission } from "./provider-review-model";
import { usePrReviewDelivery } from "./provider-review-delivery";
import { emptyPrReviewDraft } from "./provider-review-draft";
import { filterPrDiffFiles, prDiffFiles, type PrDiffAnchor, type PrDiffFile } from "./provider-pr-diff-model";
import { DiffStats, PrFileRow, PrFilesSkeleton, PrReviewHeader } from "./provider-pr-review-summary";
import { PrReviewSubmitSheet } from "./provider-pr-review-submit";
import { useSheetGuard } from "@/ui/sheet-guard";
import { inboxReviewFileHref } from "./inbox-record-route";
import { publishPrReviewSession, prReviewSessionKey, type PrReviewSession } from "./provider-pr-review-session";
import { pushOnce } from "@/ui/navigation";

const MAX_COMMENTS = 50;
const ALL_DECISIONS = ["COMMENT", "APPROVE", "REQUEST_CHANGES"] as const;

/**
 * Files and review for one GitHub pull request, a pushed page: changed files first, each opening
 * its own pushed diff page where a tap on a line adds a pending comment; one Submit review sheet
 * sends the decision, summary and every pending comment together against the reviewed head. The
 * draft is kept per record on this phone, so leaving the page by Back keeps it.
 */
export function ProviderPrReview({
  item: suppliedItem,
  origin,
  canRead,
  canWrite,
  onSubmitted,
}: {
  item: RemoteInboxItem;
  origin: InboxOrigin;
  canRead: boolean;
  canWrite: boolean;
  onClose?: () => void;
  /** The review reached the provider: the record's conversation, decision and reviewers refresh. */
  onSubmitted?: () => void;
}) {
  const inboxScope = useInboxLocalScope();
  const copy = useCopy();
  const machine = useActiveMachine();
  const [opening] = useState(origin);
  const [item] = useState(suppliedItem);
  const writeAllowed = useRef(canWrite);
  writeAllowed.current = canWrite;
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState("");
  const [hideTests, setHideTests] = useState(false);
  const supported =
    item.kind === "pr" &&
    item.provider === "github" &&
    machine?.id === opening.machineId &&
    !!machine.capabilities?.includes("inbox.review.v1");
  const originCurrent = inboxScope.matches(opening);
  const readAllowed = supported && canRead && originCurrent;
  const readAccess = useRef(readAllowed); readAccess.current = readAllowed;
  const input = inboxItemInput(item, opening.projectId);
  // Same cache entry as the detail screen's head read, so a reopened review shows its files at once.
  const read = useInboxRead({ action: "review-context", input }, readAllowed, { gcTime: INBOX_RECORD_CACHE_MS });
  const privateFailure = isInboxPrivateFailure(read.error);
  const contentAvailable = readAllowed && !privateFailure;
  const context = contentAvailable ? read.data : undefined;
  // A completed review is announced once and its draft retired at once, so reopening the review
  // starts a new one instead of showing an old "Review completed" with locked comments.
  const delivery = usePrReviewDelivery(opening, item, input, () => {
    showToast({ message: copy("İnceleme gönderildi.", "Review submitted.") });
    onSubmitted?.();
  });
  const { draft, value, busy, error } = delivery;
  const stale = !!context && !!value.commitId && value.commitId !== context.commitId;
  const locked =
    !contentAvailable ||
    !canWrite ||
    !draft.ready ||
    !!draft.error ||
    busy ||
    !!value.pending ||
    !!value.completed;
  const files = useMemo(() => (context ? prDiffFiles(context) : []), [context]);
  const visibleFiles = filterPrDiffFiles(files, { query, hideTests, isTest: isTestFile });
  const hiddenTests = hideTests ? files.filter((file) => isTestFile(file.path)).length : 0;
  const current = () => mounted.current && inboxScope.matches(opening);
  const latest = useRef({ locked, value, context, contentAvailable, busy, stale });
  latest.current = { locked, value, context, contentAvailable, busy, stale };
  const refreshContext = () => {
    if (readAccess.current && current()) return read.refetch();
  };
  const patch = (change: Partial<typeof value>) => {
    if (!latest.current.locked && current())
      draft.setValue((saved) => ({ ...(saved ?? emptyPrReviewDraft()), ...change }));
  };
  // A fresh review starts on the head being shown. A head that moves later is never adopted
  // silently: the person rebinds explicitly, and inline comments on the old head need confirmation.
  useEffect(() => {
    if (context && !locked && !value.commitId && current()) patch({ commitId: context.commitId });
  }, [context?.commitId, locked, value.commitId]);
  const bindHead = () => {
    if (!context || latest.current.locked || !current()) return;
    const reviewedValue = value, reviewedHead = context.commitId;
    const apply = () => {
      if (!current() || latest.current.locked || latest.current.value !== reviewedValue ||
        latest.current.context?.commitId !== reviewedHead) return;
      patch({ commitId: reviewedHead, comments: [] });
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
  const commenting = context?.truncated
    ? { enabled: false, reason: copy("Fark kısmi olduğu için satır yorumu eklenemez; yalnız özet gönderilebilir.", "The diff is partial, so line comments are unavailable. You can still submit a summary.") }
    : stale
      ? { enabled: false, reason: copy("Pull request’e yeni commit geldi. Yorum eklemek için güncel commit’i incele.", "New commits arrived. Review the current head to add comments.") }
      : !canWrite || !value.commitId || !draft.ready || !!draft.error
        ? { enabled: false, reason: copy("Bu bağlantı üzerinden inceleme yazılamıyor.", "Writing reviews is not available from this connection.") }
        : value.pending || value.completed || busy
          ? { enabled: false, reason: copy("İnceleme gönderildi; yeni yorumlar için yeni bir inceleme hazırla.", "This review was sent. Prepare another review to add comments.") }
          : value.comments.length >= MAX_COMMENTS
            ? { enabled: false, reason: copy("Bir incelemede en fazla 50 satır yorumu olabilir.", "A review can hold at most 50 line comments.") }
            : { enabled: true };
  const saveComment = (path: string, anchor: PrDiffAnchor, body: string, index?: number) => {
    const state = latest.current;
    if (state.locked || state.stale || !state.value.commitId || !current() || !body.trim()) return;
    const comments = state.value.comments;
    const existing = index ?? comments.findIndex((comment) => comment.path === path && comment.side === anchor.side && comment.line === anchor.line);
    if (existing >= 0 && comments[existing]) {
      patch({ comments: comments.map((comment, at) => at === existing ? { ...comment, body } : comment) });
    } else if (comments.length < MAX_COMMENTS) {
      patch({ comments: [...comments, { path, side: anchor.side, line: anchor.line, body }] });
    }
  };
  const removeComment = (index: number) => {
    if (latest.current.locked || !current()) return;
    patch({ comments: latest.current.value.comments.filter((_, at) => at !== index) });
  };
  const open = item.state.toUpperCase() === "OPEN";
  // GitHub accepts approvals and change requests only on open pull requests.
  const decisions = open ? ALL_DECISIONS : (["COMMENT"] as const);
  const event = decisions.includes(value.event as never) ? value.event : "COMMENT";
  useEffect(() => {
    if (!locked && value.event !== event && current()) patch({ event });
  }, [locked, value.event, event]);
  let reviewed: RemoteInboxReview | null = null;
  let blockedReason: string | undefined;
  try {
    if (context && !stale && value.commitId === context.commitId)
      reviewed = reviewedPrSubmission(context, event, value.body, value.comments);
  } catch (cause) {
    // The displayed anchors and bounded content gate submission; say which one beside Submit.
    const message = cause instanceof Error ? cause.message : "";
    blockedReason = event !== "APPROVE" && !value.body.trim()
      ? copy("Bu karar için bir özet yaz.", "Write a summary for this decision.")
      : message === "Inline comments require a complete diff"
        ? copy("Fark kısmi olduğu için satır yorumları gönderilemez. Yorumları kaldır veya yalnız özet gönder.", "The diff is partial, so line comments cannot be sent. Remove them or submit a summary only.")
        : message === "Review comments must target a displayed diff line"
          ? copy("Bir satır yorumu artık farkla eşleşmiyor. Dosyasında aç, taşı veya sil.", "A line comment no longer matches the diff. Open it in its file to move or delete it.")
          : message === "Review content is too large"
            ? copy("İnceleme çok uzun. Özeti veya yorumları kısalt.", "The review is too long. Shorten the summary or comments.")
            : copy("İnceleme bu haliyle gönderilemez.", "This review cannot be submitted as it is.");
  }
  const canSubmit = !!reviewed && !locked && !read.isFetching && !read.error;
  const send = () => {
    if (!canSubmit || !reviewed || !writeAllowed.current || !current() || latest.current.value !== value) return;
    void delivery.submit(reviewed);
  };
  useEffect(() => { if (value.completed || value.pending) setSubmitting(false); }, [value.completed, value.pending]);
  useEffect(() => {
    if (draft.ready && value.completed && !busy && current()) draft.setValue(emptyPrReviewDraft());
  }, [draft.ready, value.completed, busy]);
  useEffect(() => { if (!contentAvailable) setSubmitting(false); }, [contentAvailable]);
  // A send in flight keeps the page open: Back and the swipe wait for its receipt.
  useSheetGuard({ pending: busy });
  // The file page pushed over this one edits the same draft through this session.
  const sessionKey = prReviewSessionKey(opening, input.item);
  const session: PrReviewSession | null = contentAvailable ? {
    file: (path) => files.find((file) => file.path === path), commitId: context?.commitId, comments: value.comments, commenting,
    save: (path, anchor, body, index) => saveComment(path, anchor, body, index), remove: removeComment,
  } : null;
  const published = useRef<PrReviewSession | null>(null);
  useLayoutEffect(() => {
    published.current = session;
    if (session) publishPrReviewSession(sessionKey, session);
    else publishPrReviewSession(sessionKey, null);
  });
  useLayoutEffect(() => () => publishPrReviewSession(sessionKey, null, published.current ?? undefined), [sessionKey]);
  const openFilePage = (path: string, anchor?: PrDiffAnchor) => {
    if (current() && latest.current.contentAvailable) pushOnce(inboxReviewFileHref(input.item, opening, path, anchor));
  };
  const commentCount = value.comments.length;
  const footer = !contentAvailable && !value.pending ? undefined : value.pending ? (
    <Button tone="primary" fullWidth busy={busy} label={copy("İnceleme sonucunu kontrol et", "Check review result")}
      disabled={!contentAvailable}
      onPress={() => { if (latest.current.contentAvailable && current()) void delivery.reconcile(); }} />
  ) : value.completed ? (
    <Button fullWidth label={copy("Yeni bir inceleme hazırla", "Prepare another review")} disabled={busy}
      onPress={() => { if (latest.current.contentAvailable && !latest.current.busy && current()) draft.setValue(emptyPrReviewDraft()); }} />
  ) : (
    <Button tone="primary" fullWidth
      label={commentCount ? copy("İncelemeyi gönder ({p0} yorum)", "Submit review ({p0} comments)", { p0: commentCount }) : copy("İncelemeyi gönder", "Submit review")}
      disabled={!context || locked}
      onPress={() => { if (latest.current.contentAvailable && current()) setSubmitting(true); }} />
  );
  const search = useCollapsibleSearch(
    <SearchField label={copy("Dosya ara", "Search files")} value={query} onChangeText={setQuery} />,
    {
      filters: <ToggleField label={copy("Test dosyalarını gizle", "Hide test files")} value={hideTests} onChange={setHideTests} />,
      activeFilters: hideTests ? 1 : 0,
      onResetFilters: () => setHideTests(false),
    },
  );
  const commentsPerFile = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of value.comments) counts.set(comment.path, (counts.get(comment.path) ?? 0) + 1);
    return counts;
  }, [value.comments]);
  const openComment = (comment: RemoteInboxReviewComment) => {
    setSubmitting(false);
    openFilePage(comment.path, { side: comment.side, line: comment.line });
  };
  const accessState = !originCurrent || !canRead ? (
    <StateView tone="warning" title={copy("Bağlantı bekleniyor", "Waiting for a connection")}
      description={copy("İnceleme erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.",
        "Review access is unavailable. Check the original computer and project connection.")} />
  ) : !supported ? (
    <StateView illustration="permission" title={copy("Güncelleme gerekiyor", "Update needed")}
      description={copy("Pull request incelemesi için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer to review pull requests.")} />
  ) : null;
  return (
    <>
      <Screen scroll={false} footer={footer}>
        <ScreenList<PrDiffFile>
          data={contentAvailable ? visibleFiles : []}
          keyExtractor={(file) => file.path}
          header={
            <View style={{ gap: space.sm }}>
              {contentAvailable ? <PrReviewHeader item={item} context={context} /> : null}
              {accessState ?? <QueryState query={{ ...read, data: context, refetch: refreshContext }} loading="none" />}
              {/* While the submit sheet is open it reports the send failure beside its action; here only once. */}
              <ErrorText error={contentAvailable ? draft.error || (submitting ? undefined : error) : undefined} />
              {contentAvailable && draft.error ? (
                <Button label={copy("Taslağı yeniden yükle", "Retry loading draft")} onPress={() => { void draft.load(); }} />
              ) : null}
              {value.pending ? (
                <Notice tone="warning" message={copy(
                  "İncelemenin sonucu doğrulanmadı. Yeni inceleme göndermeden önce mevcut isteği kontrol et.",
                  "The review outcome is unconfirmed. Check the existing request before submitting another review.",
                )} />
              ) : null}
              {value.completed ? <Notice tone="success" message={copy("İnceleme tamamlandı.", "Review completed.")} /> : null}
              {contentAvailable && stale ? (
                <Notice tone="warning"
                  message={value.comments.length
                    ? copy("Pull request commit’i değişti. Eski satır yorumları korunuyor; göndermeden önce güncel diff’i incele.",
                      "The pull request head changed. Old inline comments are retained; review the current diff before submitting.")
                    : copy("Pull request’e yeni commit geldi. Göndermeden önce güncel farkı incele.", "New commits arrived. Review the current diff before submitting.")}
                  action={!locked ? { label: copy("Güncel commit’i incele", "Review current head"), onPress: bindHead } : undefined} />
              ) : null}
              {contentAvailable && context?.truncated ? (
                <Notice tone="warning" message={copy(
                  "Diff kısmi. Satır yorumu eklenemez; yalnız özet incelemesi gönderilebilir.",
                  "The diff is partial. Inline comments are unavailable; you can submit a summary review.",
                )} />
              ) : null}
              {contentAvailable && !accessState ? (
                <>
                  <SectionHeader
                    title={copy("Değişen dosyalar", "Files changed")}
                    count={context?.files.length}
                    trailing={context?.files.length ? <View style={{ flexDirection: "row" }}>{search.trigger}{search.filterTrigger}</View> : undefined}
                  />
                  {context && context.files.length ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
                      <DiffStats additions={context.additions} deletions={context.deletions} />
                      {hiddenTests ? (
                        <Body muted style={{ fontSize: fontSize.small, lineHeight: lineHeight.small }}>
                          {copy("{p0} test dosyası gizli", "{p0} test files hidden", { p0: hiddenTests })}
                        </Body>
                      ) : null}
                    </View>
                  ) : null}
                  {search.sheet}
                </>
              ) : null}
            </View>
          }
          ListEmptyComponent={!contentAvailable || accessState ? undefined
            : !context ? (read.error ? undefined : <PrFilesSkeleton />)
            : !context.files.length ? <StateView size="compact" title={copy("Değişen dosya yok", "No changed files")} />
            : <NoResults compact searching={!!query.trim()} filtered={hideTests}
                title={copy("Aramanla eşleşen dosya yok.", "No files match your search.")}
                filtersTitle={copy("Bu filtrelerle eşleşen dosya yok.", "No files match these filters.")}
                onClearSearch={() => setQuery("")} onClearFilters={() => setHideTests(false)} />}
          renderItem={({ item: file }) => (
            <PrFileRow file={file} comments={commentsPerFile.get(file.path) ?? 0} onPress={() => openFilePage(file.path)} />
          )}
        />
      </Screen>
      {contentAvailable && submitting && !value.pending && !value.completed ? (
        <PrReviewSubmitSheet
          event={event}
          body={value.body}
          comments={value.comments}
          commitId={value.commitId || context?.commitId}
          decisions={decisions}
          restriction={open ? undefined : copy("Kapalı pull request’lerde yalnız yorum gönderilebilir.", "Closed pull requests accept comments only.")}
          editable={!locked}
          canSubmit={canSubmit}
          blockedReason={!reviewed && !locked ? blockedReason : undefined}
          busy={busy}
          error={error}
          stale={stale}
          onChangeEvent={(next) => patch({ event: next })}
          onChangeBody={(body) => patch({ body })}
          onOpenComment={openComment}
          onRebind={bindHead}
          onSubmit={send}
          onClose={() => setSubmitting(false)}
        />
      ) : null}
    </>
  );
}
