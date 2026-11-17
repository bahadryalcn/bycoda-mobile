import { readableColumn } from "@/ui/readable-width";
import { scrollKeyboardDismissMode } from "@/ui/scroll-keyboard";
import { useMobileTheme } from "@/ui/theme";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import type { ReactNode } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { Body, Button, Empty, ErrorText, Loading, MutationState } from "@/ui/primitives";
import { ChatCommandReceipt } from "@/ui/chat-command-receipt";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useHostClient } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { CONTINUE_PROMPT } from "../../../../src/features/sessions/model/userPromptText";
import { canRewindConversation } from "../../../../src/features/sessions/model/conversationRewind";
import { composerCommand } from "./composer-delivery";
import { appendToDraft } from "./draft-append";
import { reviewRewind, rewindCommand, type RewindReview } from "./session-checkpoint-model";
import { SessionCheckpointReview } from "./session-checkpoint-review";
import { InterruptedTurnNotice, ProviderRetryNotice, ThinkingPlaceholder } from "./turn-status-notices";
import { providerName } from "./provider-choices";
import { CommandError } from "./shared";
import { useEarlierSession } from "./session-queries";
import { SessionQuestions } from "./session-questions";
import { SessionSecretRequests } from "../secrets/session-secret-requests";
import { questionCardStates } from "./question-card-state";
import {
  awaitingFirstOutput,
  canContinueInterruptedTurn,
  completeResponseText,
  TranscriptPresentation,
  type TranscriptEntry,
} from "./transcript-model";
import { ActivityInspector, type ActivityInspection } from "./activity-inspector";
import type { SessionCommand, SessionTranscriptProps } from "./session-types";
import { distanceFromEnd, TranscriptScrollPosition, type FollowEvent } from "./transcript-scroll";
import { useReducedMotionPreference } from "@/ui/use-reduced-motion";
import { ChatConversation } from "@/ui/chat";
import { TranscriptFindControls } from "./transcript-find-controls";
import {
  findTranscriptAsync,
  TranscriptFindIndex,
  nextTranscriptResult,
  type TranscriptFindResult,
} from "./transcript-find-model";
import { citedTurnEntry } from "./session-reference-target";
import { TranscriptJumpPill } from "./transcript-jump-pill";
import { TranscriptRow, type TranscriptRowProps } from "./transcript-row";
import { applyToolVisibility } from "./transcript-visibility";
import { useChatDisplay } from "@/ui/chat-display";

/** Initial guess only; every row is measured, including activity touch targets and large text. */
const ESTIMATED_ITEM_SIZE = 72;
const KEEP_END = { animated: false } as const;
const KEEP_POSITION = { size: true, data: true } as const;
const keyOf = (item: TranscriptEntry) => item.id;
const typeOf = (item: TranscriptEntry) => item.kind;

export function SessionTranscript({
  header,
  targetTurnId,
  findOpen,
  onFindOpenChange,
  navigation,
  view,
  scope,
  session,
  blocked,
  command,
  onCommand,
  onReceiptHandled,
  onRefresh,
  bottomInset = 0,
}: SessionTranscriptProps & { header?: ReactNode }) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const client = useHostClient();
  const listRef = useRef<LegendListRef>(null);
  const blocks = session?.session.blocks;
  const context = useMemo(
    () =>
      client && session
        ? {
            client,
            machineId: scope.machineId,
            projectId: session.projectId,
            sessionId: scope.sessionId,
            cwd: session.session.worktreeCwd || session.session.cwd,
          }
        : undefined,
    [
      client,
      scope.machineId,
      scope.sessionId,
      session?.projectId,
      session?.session.cwd,
      session?.session.worktreeCwd,
    ],
  );
  // Rows receive only stable references so streaming one block re-renders only that row.
  const rowScope = useMemo(
    () => ({ machineId: scope.machineId, sessionId: scope.sessionId }),
    [scope.machineId, scope.sessionId],
  );
  const commandRef = useRef<SessionCommand>(onCommand);
  commandRef.current = onCommand;
  const rowCommand = useCallback<SessionCommand>((params) => commandRef.current(params), []);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const responseText = useCallback(
    (id: string) => completeResponseText(blocksRef.current ?? [], id),
    [],
  );
  const presentation = useRef(new TranscriptPresentation());
  const earlier = useEarlierSession(scope, session);
  const scrollPosition = useRef(navigation ?? new TranscriptScrollPosition());
  // History offset to restore after route hydration; computed once, before the first layout.
  const [restoreOffset] = useState(() => scrollPosition.current.restoreOffset());
  const reduceMotion = useReducedMotionPreference();
  const [following, setFollowing] = useState(() => scrollPosition.current.following);
  const [unseen, setUnseen] = useState(false);
  const [inspection, setInspection] = useState<ActivityInspection | null>(null);
  const [findQuery, setFindQuery] = useState("");
  const deferredQuery = useDeferredValue(findQuery);
  const [activeFindId, setActiveFindId] = useState<string | null>(null);
  const [findScrollFailed, setFindScrollFailed] = useState(false);
  const inspectedBlocks = useMemo(() => {
    const ids = new Set(inspection?.ids);
    return (blocks ?? []).filter((block) => ids.has(block.id));
  }, [inspection?.ids, blocks]);

  const applyScroll = useCallback((event: FollowEvent, offset?: number) => {
    if (!scrollPosition.current.apply(event, offset)) return;
    const next = scrollPosition.current.following;
    setFollowing(next);
    if (next) setUnseen(false);
  }, []);
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const native = event.nativeEvent;
      applyScroll({ type: "scroll", distance: distanceFromEnd(native) }, native.contentOffset.y);
    },
    [applyScroll],
  );
  const onScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const native = event.nativeEvent;
      applyScroll(
        { type: "endDrag", distance: distanceFromEnd(native), velocity: native.velocity?.y },
        native.contentOffset.y,
      );
    },
    [applyScroll],
  );
  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const native = event.nativeEvent;
      applyScroll(
        { type: "endMomentum", distance: distanceFromEnd(native) },
        native.contentOffset.y,
      );
    },
    [applyScroll],
  );
  const onScrollBeginDrag = useCallback(() => applyScroll({ type: "beginDrag" }), [applyScroll]);
  const onMomentumScrollBegin = useCallback(
    () => applyScroll({ type: "beginMomentum" }),
    [applyScroll],
  );

  const toolVisibility = useChatDisplay((state) => state.toolVisibility);
  const visibleBlocks = useMemo(() => {
    const running = session?.status === "running";
    const entries = presentation.current.update(blocks ?? [], session?.session.harness, { view, running });
    // The Details view is the explicit inspection surface and always lists every record.
    return view === "messages" ? applyToolVisibility(entries, toolVisibility, running) : entries;
  }, [blocks, session?.session.harness, session?.status, view, toolVisibility]);
  const live = session?.status === "running";
  const [targetState, setTargetState] = useState<"searching" | "ready" | "failed" | "dismissed">(
    targetTurnId ? "searching" : "dismissed",
  );
  const targetEntry = targetTurnId ? citedTurnEntry(visibleBlocks, targetTurnId) : undefined;
  const targetPages = useRef(new Set<number>());
  // Resolve the exact cited user turn using the same bounded, revision-checked history reader.
  useEffect(() => {
    if (targetState !== "searching" || !session || session.session.id !== scope.sessionId) return;
    if (targetEntry) {
      setTargetState("ready");
      return;
    }
    if (earlier.isPending) return;
    const before = session.history?.before;
    if (before === undefined || targetPages.current.size >= 20 || targetPages.current.has(before)) {
      setTargetState("failed");
      return;
    }
    targetPages.current.add(before);
    void earlier.mutateAsync().catch(() => setTargetState("failed"));
  }, [targetState, targetEntry, session, scope.sessionId, earlier.isPending]);
  // Wait until the virtual list mounts before locating the cited entry.
  useEffect(() => {
    if (targetState !== "ready" || !targetEntry || !listRef.current) return;
    applyScroll({ type: "release" });
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void listRef.current
      .scrollToKey({ key: targetEntry.id, viewPosition: 0.5, animated: !reduceMotion })
      .then(() => {
        if (!cancelled) timer = setTimeout(() => setTargetState("dismissed"), 3500);
      })
      .catch(() => {
        if (!cancelled) setTargetState("failed");
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [targetState, targetEntry, applyScroll, reduceMotion]);

  // Content that arrives while the user reads earlier messages raises the "new" marker.
  const last = visibleBlocks.at(-1);
  const tail = `${visibleBlocks.length}:${last?.id}:${
    last?.kind === "message" ? (last.block.text?.length ?? 0) : (last?.blocks.length ?? 0)
  }`;
  const seenTail = useRef(tail);
  useEffect(() => {
    if (seenTail.current === tail) return;
    const hadContent = !seenTail.current.startsWith("0:");
    seenTail.current = tail;
    if (hadContent && !scrollPosition.current.following) setUnseen(true);
  }, [tail]);

  // A session that hydrates after the list mounted still opens at its newest message.
  const hydrated = useRef(visibleBlocks.length > 0);
  useEffect(() => {
    if (hydrated.current || !visibleBlocks.length) return;
    hydrated.current = true;
    if (restoreOffset !== undefined) {
      void listRef.current?.scrollToOffset({ offset: restoreOffset, animated: false });
    } else if (scrollPosition.current.following) {
      void listRef.current?.scrollToEnd({ animated: false });
    }
  }, [visibleBlocks.length, restoreOffset]);

  const [findResults, setFindResults] = useState<TranscriptFindResult[]>([]);
  const [findPending, setFindPending] = useState(false);
  const findIndex = useRef(new TranscriptFindIndex());
  useEffect(() => {
    const controller = new AbortController();
    // Do not navigate results from the previous query or transcript revision.
    setFindResults([]);
    setFindPending(findOpen && !!deferredQuery.trim());
    if (findOpen && deferredQuery.trim()) {
      void findTranscriptAsync(visibleBlocks, deferredQuery, {
        signal: controller.signal,
        index: findIndex.current,
      }).then((results) => {
        if (!controller.signal.aborted) {
          setFindResults(results);
          setFindPending(false);
        }
      });
    }
    return () => controller.abort();
  }, [visibleBlocks, deferredQuery, findOpen]);
  const activeFind = findResults.find((result) => result.blockId === activeFindId);
  const scrollToFind = useCallback(
    (result: TranscriptFindResult) => {
      Keyboard.dismiss();
      setFindScrollFailed(false);
      setActiveFindId(result.blockId);
      // Searching owns the scroll until Jump to latest or an explicit user scroll.
      applyScroll({ type: "release" });
      void listRef.current
        ?.scrollToKey({ key: result.entryId, viewPosition: 0.5, animated: !reduceMotion })
        .catch(() => setFindScrollFailed(true));
    },
    [applyScroll, reduceMotion],
  );
  const navigateFind = (direction: 1 | -1) => {
    const result = nextTranscriptResult(findResults, activeFindId, direction);
    if (result) scrollToFind(result);
  };
  const pending = session?.session.pendingQuestion;
  const questionScope = JSON.stringify([scope.machineId, scope.sessionId, session?.runId]);
  useEffect(() => {
    if (!session || session.session.id !== scope.sessionId) return;
    questionCardStates.retain(questionScope, [
      ...(session.session.submittedQuestions ?? []),
      ...(pending ? [pending] : []),
    ]);
  }, [session, pending, questionScope, scope.sessionId]);
  // The keyboard rising over an open question keeps its input in view.
  const lastInset = useRef(bottomInset);
  useEffect(() => {
    const grew = bottomInset > lastInset.current;
    lastInset.current = bottomInset;
    if (grew && pending && !scrollPosition.current.following)
      void listRef.current?.scrollToEnd({ animated: false });
  }, [bottomInset, pending]);
  const jumpToLatest = () => {
    applyScroll({ type: "jump" }, 0);
    setUnseen(false);
    void listRef.current?.scrollToEnd({ animated: !reduceMotion });
  };
  const onInspect = useCallback<TranscriptRowProps["onInspect"]>(
    (entry, selectedId) =>
      setInspection({
        ids: entry.blocks.map((block) => block.id),
        selectedId,
        author: entry.author,
      }),
    [],
  );
  const revision = session?.revision ?? 0;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const getRevision = useCallback(() => revisionRef.current, []);
  const runId = session?.runId;
  const harness = session?.session.harness;
  const machine = useActiveMachine();
  // Desktop's Edit from here uses the Host rewind behind its capability; the review sheet confirms.
  const rewindAvailable = useMemo(() => {
    if (!session || blocked || session.status === "running" || machine?.id !== scope.machineId) return false;
    if (!machine.capabilities?.includes("sessions.rewind")) return false;
    const user = session.session.blocks.findLast((block) => block.role === "user" && !block.draft && !block.internal);
    return !!user && canRewindConversation(session.session, user.id);
  }, [session, blocked, machine, scope.machineId]);
  const [rewind, setRewind] = useState<RewindReview | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const onRewind = useCallback((blockId: string) => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      setActionError(null);
      setRewind(reviewRewind(current, blockId));
    } catch (cause) {
      setActionError(cause);
    }
  }, []);
  const confirmRewind = () => {
    const current = sessionRef.current;
    const review = rewind;
    setRewind(null);
    if (!current || !review) return;
    try {
      // Like desktop, the rewound prompt returns to the composer; appending keeps any unsent text.
      void onCommand(rewindCommand(current, review))
        .then(() => appendToDraft(scope, { text: review.prompt }))
        .catch(() => {});
    } catch (cause) {
      setActionError(cause);
    }
  };
  const [stopping, setStopping] = useState(false);
  // Same exact-run cancel as the composer's Stop; the notice never resends the turn.
  const stopTurn = () => {
    if (!session?.runId || stopping) return;
    setStopping(true);
    void onCommand({ type: "cancel", sessionId: scope.sessionId, runId: session.runId })
      .catch((cause: unknown) => setActionError(cause))
      .finally(() => setStopping(false));
  };
  const continueTurn = () => {
    if (!session) return;
    try {
      void onCommand(composerCommand(session, "send", CONTINUE_PROMPT, [])).catch(() => {});
    } catch (cause) {
      setActionError(cause);
    }
  };
  const activeEntryId = targetState === "ready" ? targetEntry?.id : activeFind?.entryId;
  const renderItem = useCallback(
    ({ item }: { item: TranscriptEntry }) => (
      <TranscriptRow
        canRewind={
          rewindAvailable && item.kind === "message" && item.block.role === "user" && !item.block.draft
        }
        onRewind={onRewind}
        item={item}
        highlighted={item.id === activeEntryId}
        live={item.kind === "activity" && live}
        getRevision={getRevision}
        parentProvider={harness}
        context={context}
        responseText={responseText}
        scope={rowScope}
        runId={runId}
        disabled={blocked}
        onCommand={rowCommand}
        onInspect={onInspect}
      />
    ),
    [
      activeEntryId,
      live,
      getRevision,
      harness,
      context,
      responseText,
      rowScope,
      runId,
      blocked,
      rowCommand,
      onInspect,
      rewindAvailable,
      onRewind,
    ],
  );
  const loadEarlier = () => {
    void earlier.mutateAsync().catch(() => {});
  };

  if (targetState === "searching" || targetState === "failed") {
    return (
      <View style={{ flex: 1, justifyContent: "center", gap: space.md }}>
        {targetState === "searching" ? (
          <Loading label={copy("Alıntılanan mesaj aranıyor…", "Finding cited message…")} />
        ) : (
          <>
            <Body>
              {copy(
                "Alıntılanan mesaj bulunamadı veya yüklenemedi.",
                "The cited message could not be found or loaded.",
              )}
            </Body>
            <Button
              label={copy("Oturumun tamamını aç", "Open full conversation")}
              onPress={() => setTargetState("dismissed")}
            />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <TranscriptFindControls
        open={findOpen}
        onToggle={() => {
          if (findOpen) Keyboard.dismiss();
          onFindOpenChange(!findOpen);
          setActiveFindId(null);
          setFindScrollFailed(false);
        }}
        query={findQuery}
        onQuery={(value) => {
          setFindQuery(value);
          setActiveFindId(null);
          setFindScrollFailed(false);
        }}
        count={findQuery === deferredQuery ? findResults.length : 0}
        searching={findPending || findQuery !== deferredQuery}
        active={activeFind}
        activeIndex={findResults.findIndex((result) => result.blockId === activeFindId)}
        hasEarlier={session?.history?.before !== undefined}
        busy={earlier.isPending}
        onEarlier={loadEarlier}
        onNavigate={navigateFind}
        failed={findScrollFailed}
        onRetry={() => {
          if (activeFind) scrollToFind(activeFind);
        }}
        onInspect={
          activeFind && visibleBlocks[activeFind.index]?.kind === "activity"
            ? () => {
                const entry = visibleBlocks[activeFind.index];
                if (entry?.kind === "activity") onInspect(entry, activeFind.blockId);
              }
            : undefined
        }
      />
      {findOpen ? <MutationState mutation={earlier} /> : null}
      <ChatConversation style={{ flex: 1, minHeight: 0 }} collapsable={false}>
        <LegendList<TranscriptEntry>
          ref={listRef}
          style={{ flex: 1, minHeight: 0 }}
          data={visibleBlocks}
          renderItem={renderItem}
          keyExtractor={keyOf}
          getItemType={typeOf}
          estimatedItemSize={ESTIMATED_ITEM_SIZE}
          alignItemsAtEnd
          initialScrollAtEnd={restoreOffset === undefined}
          initialScrollOffset={restoreOffset}
          maintainScrollAtEnd={following ? KEEP_END : false}
          maintainVisibleContentPosition={KEEP_POSITION}
          // Rows hold local state (sheets, drafts), so containers are never reused across items.
          recycleItems={false}
          extraData={activeEntryId}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={scrollKeyboardDismissMode()}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ ...readableColumn, paddingTop: space.sm, paddingBottom: bottomInset + space.sm }}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          onMomentumScrollBegin={onMomentumScrollBegin}
          onMomentumScrollEnd={onMomentumScrollEnd}
          ListHeaderComponent={
            <View style={{ gap: space.row, paddingBottom: space.sm }}>
              {session?.history?.before !== undefined ? (
                <Button
                  label={copy("Önceki mesajları yükle", "Load earlier messages")}
                  tone="quiet"
                  density="compact"
                  busy={earlier.isPending}
                  onPress={loadEarlier}
                />
              ) : null}
              {!findOpen ? <MutationState mutation={earlier} /> : null}
              {header}
            </View>
          }
          ListFooterComponent={
            <View style={uiStyles.stack}>
              <OutboxTranscript scope={scope} blocked={blocked} />
              <SessionSecretRequests machineId={scope.machineId} sessionId={scope.sessionId} disabled={blocked} />
              {live && session?.session.retryMessage?.trim() ? (
                <ProviderRetryNotice
                  provider={providerName(session.session.harness)}
                  message={session.session.retryMessage}
                  disabled={blocked || !session.runId}
                  stopping={stopping}
                  onStop={stopTurn}
                  onRefresh={onRefresh}
                />
              ) : live && !pending && awaitingFirstOutput(blocks ?? []) ? (
                <ThinkingPlaceholder />
              ) : null}
              {session && canContinueInterruptedTurn(session) ? (
                <InterruptedTurnNotice disabled={blocked} onContinue={continueTurn} />
              ) : null}
              {actionError ? <ErrorText error={actionError} /> : null}
              {session?.runId ? (
                <SessionQuestions
                  client={client ?? undefined}
                  pending={pending}
                  submitted={session.session.submittedQuestions}
                  scope={scope}
                  runId={session.runId}
                  revision={session.revision}
                  disabled={blocked}
                  onCommand={onCommand}
                />
              ) : null}
              {command.isSuccess ? <ChatCommandReceipt onExpire={onReceiptHandled} /> : null}
              <CommandError
                error={command.error}
                onRecovered={onReceiptHandled}
                onDismiss={onReceiptHandled}
              />
            </View>
          }
        />
        {rewind && session ? (
          <SessionCheckpointReview
            value={{
              kind: "rewind",
              review: rewind,
              blocks: session.session.blocks.filter((block) => rewind.affectedIds.includes(block.id)),
            }}
            machineName={machine?.name ?? scope.machineId}
            cwd={rewind.cwd}
            onClose={() => setRewind(null)}
            onConfirm={confirmRewind}
          />
        ) : null}
        {inspection ? (
          <ActivityInspector
            blocks={inspectedBlocks}
            inspection={inspection}
            onChange={setInspection}
            live={live}
            context={context}
            author={inspection.author}
            scope={scope}
            getRevision={getRevision}
            runId={runId}
            parentProvider={harness}
            disabled={blocked}
            onCommand={onCommand}
          />
        ) : null}
        {!visibleBlocks.length && !!session && !pending ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <Empty
              compact={false}
              illustration="chat-empty"
              title={copy("Sohbeti başlat", "Start the conversation")}
              detail={copy(
                "Ne yapmak istediğini yaz; bilgisayarındaki ajan devralır.",
                "Describe what you want done and the agent on your computer takes it from there.",
              )}
            />
          </View>
        ) : null}
        {!following && visibleBlocks.length > 0 ? (
          <TranscriptJumpPill unseen={unseen} bottom={bottomInset} onPress={jumpToLatest} />
        ) : null}
      </ChatConversation>
    </View>
  );
}
import { OutboxTranscript } from "../outbox/ui/outbox-transcript";
