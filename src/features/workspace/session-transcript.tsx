import { readableColumn } from "@/ui/readable-width";
import { scrollKeyboardDismissMode } from "@/ui/scroll-keyboard";
import { useMobileTheme } from "@/ui/theme";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import type { ReactNode } from "react";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { Button, Empty, Loading, MutationState, StateView } from "@/ui/primitives";
import { showToast } from "@/ui/toast";
import { errorMessage } from "@/ui/error-message";
import { useLatestCallback } from "./use-latest-callback";
import { metrics, space } from "@/ui/tokens";
import { useAdaptiveLayout } from "@/ui/adaptive-layout";
import { QUICK_PANEL_MARGIN } from "./tablet-quick-panel-model";
import { useCopy } from "@/ui/copy";
import { useHostClient } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { CONTINUE_PROMPT } from "../../../../src/features/sessions/model/userPromptText";
import { canRewindConversation } from "../../../../src/features/sessions/model/conversationRewind";
import { composerCommand } from "./composer-delivery";
import { appendToDraft } from "./draft-append";
import { reviewRewind, rewindCommand, type RewindReview } from "./session-checkpoint-model";
import { rewindAvailability } from "./rewind-availability";
import type { Block } from "./wire";
import { SessionCheckpointReview } from "./session-checkpoint-review";
import { InterruptedTurnNotice, LiveTurnRow, ProviderRetryNotice } from "./turn-status-notices";
import { FailureRecoveryContext } from "./failure-recovery";
import { UsageLimitNotice } from "./usage-limit-notice";
import { useTurnRecovery } from "./use-turn-recovery";
import { providerName } from "./provider-choices";
import { CommandError, UncertainCommand } from "./shared";
import { useEarlierSession } from "./session-queries";
import { SessionQuestions } from "./session-questions";
import { SessionSecretRequests } from "../secrets/session-secret-requests";
import { questionCardStates } from "./question-card-state";
import {
  canContinueInterruptedTurn,
  completeResponseText,
  withoutOfferedInterruption,
  transcriptTailStamp,
  turnStartedAt as latestTurnStartedAt,
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
  currentTranscriptFind,
  matchingTranscriptActivity,
  matchingTranscriptAgents,
  TranscriptFindIndex,
  nextTranscriptResult,
  type TranscriptFindResult,
  type TranscriptFindSnapshot,
} from "./transcript-find-model";
import { citedTurnEntry } from "./session-reference-target";
import { SessionStatusCluster } from "./session-status-cluster";
import { activeSessionGoal, clusterSegments, hasCapsule, transcriptBottomSpace } from "./session-status-cluster-model";
import { useRegisterStatusCluster, useStatusClusterQueue } from "./session-status-cluster-context";
import { deriveSessionActivity } from "./session-activity-model";
import { useJustFinished } from "./use-just-finished";
import { LinearGradient } from "expo-linear-gradient";
import { useSessionAgentRuns } from "./session-agent-runs";
import { agentsPillCounts, agentsPillExpiresAt, latestTurnAgentsIds } from "./subagent-run-model";
import { placeDelegatedRuns } from "./delegated-runs-model";
import type { ChildSessionEntry } from "./subagent-sessions-model";
import { TranscriptRow, type TranscriptRowProps } from "./transcript-row";
import { ToolVisibilityPresentation } from "./transcript-visibility";
import { useChatDisplay } from "@/ui/chat-display";

/** Height of the soft fades where the list scrolls under the header and above the composer. */
const EDGE_FADE = space.lg;
/** Initial guess only; every row is measured, including activity touch targets and large text. */
const ESTIMATED_ITEM_SIZE = 72;
const KEEP_END = { animated: false } as const;
const KEEP_POSITION = { size: true, data: true } as const;
const keyOf = (item: TranscriptEntry) => item.id;
const NO_CHILDREN: readonly ChildSessionEntry[] = [];
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
  stopping,
  stopError,
  onCommand,
  onReceiptHandled,
  onStopReceiptHandled,
  onRefresh,
  topInset = 0,
}: SessionTranscriptProps & { header?: ReactNode }) {
  const { uiStyles, colors } = useMobileTheme();
  // The tablet quick-panel button floats over the transcript end; leave room so the last lines can
  // scroll clear of it, and keep the centred capsule out from under it.
  const tablet = useAdaptiveLayout().tablet;
  const quickPanelClearance = tablet ? metrics.touchTarget + space.sm + QUICK_PANEL_MARGIN : 0;
  const quickPanelInline = tablet ? metrics.touchTarget + QUICK_PANEL_MARGIN : 0;
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
  const visibility = useRef(new ToolVisibilityPresentation());
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
  const [failedFindScroll, setFailedFindScroll] = useState<TranscriptFindResult>();
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
  // The footer's Continue line already says the turn was cut off; the list does not repeat it.
  const continueOffered = !!session && canContinueInterruptedTurn(session);
  const agentRuns = useSessionAgentRuns();
  const children = agentRuns?.children ?? NO_CHILDREN;
  const visibleBlocks = useMemo(() => {
    const running = session?.status === "running";
    // In the messages view a bycoda delegate call that names a listed child reads as that child's
    // subagent row; Details keeps the raw call.
    const source = view === "messages" ? placeDelegatedRuns(blocks ?? [], children) : blocks ?? [];
    const entries = presentation.current.update(source, session?.session.harness, { view, running });
    // The Details view is the explicit inspection surface and always lists every record.
    const shown = view === "messages" ? visibility.current.update(entries, toolVisibility, running) : entries;
    return continueOffered && view === "messages" ? withoutOfferedInterruption(shown) : shown;
  }, [blocks, children, session?.session.harness, session?.status, view, toolVisibility, continueOffered]);
  const live = session?.status === "running";
  // The latest turn's subagents float beside "back to latest" until the next user turn; an idle
  // session's settled pill leaves a while after its runs ended, so a reopened old session shows none.
  // An untouched screen re-reads the pill once, at the moment its settled tally expires.
  const [pillClock, setPillClock] = useState(0);
  const pillExpiresAt = useMemo(
    () => (agentRuns ? agentsPillExpiresAt(blocks, agentRuns.children, !!live) : undefined),
    [agentRuns, blocks, live],
  );
  useEffect(() => {
    if (pillExpiresAt === undefined) return;
    const wait = pillExpiresAt - Date.now() + 1;
    if (wait <= 0) return;
    const timer = setTimeout(() => setPillClock((tick) => tick + 1), Math.min(wait, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [pillExpiresAt]);
  const agentCounts = useMemo(
    () => (agentRuns ? agentsPillCounts(blocks, agentRuns.children, !!live, Date.now()) : undefined),
    // pillClock: re-read when the settled pill's expiry timer fires.
    [agentRuns, blocks, live, pillClock],
  );
  // Only the latest owner turn's agents rows follow `live`; an older unfinished run stays settled.
  // A joined key keeps the set, and so every row's props, stable across streaming frames.
  const latestAgentsKey = useMemo(() => latestTurnAgentsIds(visibleBlocks).join("\n"), [visibleBlocks]);
  const latestAgents = useMemo(() => new Set(latestAgentsKey ? latestAgentsKey.split("\n") : []), [latestAgentsKey]);
  // The floating capsule stays over the end of the list, so the list reserves its measured height.
  const [capsuleHeight, setCapsuleHeight] = useState(0);
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
    applyScroll({ type: "release" });
    void earlier.mutateAsync().catch(() => setTargetState("failed"));
  }, [targetState, targetEntry, session, scope.sessionId, earlier.isPending, applyScroll]);
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
  const tail = transcriptTailStamp(visibleBlocks);
  const seenTail = useRef(tail);
  useEffect(() => {
    if (seenTail.current === tail) return;
    const hadContent = seenTail.current !== undefined;
    seenTail.current = tail;
    if (hadContent && tail !== undefined && !scrollPosition.current.following) setUnseen(true);
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

  const [findSnapshot, setFindSnapshot] = useState<TranscriptFindSnapshot>();
  const findIndex = useRef(new TranscriptFindIndex());
  // Scan the loaded presentation, and cancel when another presentation or query replaces it.
  useEffect(() => {
    if (!findOpen || !deferredQuery.trim()) {
      setFindSnapshot(undefined);
      return;
    }
    const controller = new AbortController();
    const scan = { entries: visibleBlocks, query: deferredQuery };
    void findTranscriptAsync(visibleBlocks, deferredQuery, {
      signal: controller.signal,
      index: findIndex.current,
    }).then((results) => {
      if (!controller.signal.aborted) setFindSnapshot({ ...scan, results });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setFindSnapshot({ ...scan, results: [], error: error instanceof Error ? error : new Error(String(error)) });
    });
    return () => controller.abort();
  }, [visibleBlocks, deferredQuery, findOpen]);
  const currentFind = currentTranscriptFind(findSnapshot, visibleBlocks, findQuery, findOpen);
  const findResults = currentFind?.results ?? [];
  const activeFind = findResults.find((result) => result.blockId === activeFindId);
  const committedFind = useRef<TranscriptFindSnapshot | undefined>(undefined);
  const scrollAttempt = useRef(0);
  // A queued action may only navigate a scan that still belongs to the committed view.
  useLayoutEffect(() => {
    committedFind.current = currentFind;
    return () => { committedFind.current = undefined; };
  }, [currentFind]);
  const scrollToFind = (result: TranscriptFindResult) => {
    if (!currentFind || committedFind.current !== currentFind) return;
    const attempt = ++scrollAttempt.current;
    Keyboard.dismiss();
    setFailedFindScroll(undefined);
    setActiveFindId(result.blockId);
    // Searching owns the scroll until Jump to latest or an explicit user scroll.
    applyScroll({ type: "release" });
    const failed = () => {
      if (committedFind.current === currentFind && scrollAttempt.current === attempt) setFailedFindScroll(result);
    };
    const list = listRef.current;
    if (!list) { failed(); return; }
    void list.scrollToKey({ key: result.entryId, viewPosition: 0.5, animated: !reduceMotion }).catch(failed);
  };
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
  // A changed file of a settled turn opens its edits: one edit directly, several as the action list.
  const onOpenChangedFile = useCallback<NonNullable<TranscriptRowProps["onOpenChangedFile"]>>(
    (ids, author) => setInspection({ ids, selectedId: ids.length === 1 ? ids[0] : undefined, author }),
    [],
  );
  const matchingActivity = activeFind ? matchingTranscriptActivity(visibleBlocks, activeFind) : undefined;
  const matchingAgents = activeFind ? matchingTranscriptAgents(visibleBlocks, activeFind) : undefined;
  const focusRun = matchingAgents && activeFind ? { entryId: matchingAgents.id, blockId: activeFind.blockId } : undefined;
  // Find's "open matching activity" on a subagent run opens that run in its row.
  const [runRequest, setRunRequest] = useState<{ blockId: string; nonce: number }>();
  const revision = session?.revision ?? 0;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const getRevision = useCallback(() => revisionRef.current, []);
  const runId = session?.runId;
  const harness = session?.session.harness;
  const machine = useActiveMachine();
  // Desktop's Edit from here uses the Host rewind behind its capability; the review sheet confirms.
  // An older computer or a running turn keeps the row visible with its reason.
  const rewindState = useMemo(() => {
    if (!session) return "none" as const;
    const user = session.session.blocks.findLast((block) => block.role === "user" && !block.draft && !block.internal);
    return rewindAvailability({
      blocked,
      sameMachine: machine?.id === scope.machineId,
      capabilities: machine?.capabilities,
      running: session.status === "running",
      rewindable: !!user && canRewindConversation(session.session, user.id),
    });
  }, [session, blocked, machine, scope.machineId]);
  const [rewind, setRewind] = useState<RewindReview | null>(null);
  // Stop, Continue and Rewind failures are transient: a dismissible toast, not a footer line that lingers.
  const setActionError = useLatestCallback((cause: unknown) => {
    if (cause) showToast({ tone: "danger", message: errorMessage(cause, copy) });
  });
  // A lost reply is not a failure to toast: the footer's status check reconciles it.
  const reportActionFailure = useLatestCallback((cause: unknown) => {
    if (!(cause instanceof UncertainCommand)) setActionError(cause);
  });
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const onRewind = useCallback((blockId: string, full?: Block) => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      setRewind(reviewRewind(current, blockId, full));
    } catch (cause) {
      setActionError(cause);
    }
  }, [setActionError]);
  const confirmRewind = () => {
    const current = sessionRef.current;
    const review = rewind;
    setRewind(null);
    if (!current || !review) return;
    try {
      // Like desktop, the rewound prompt returns to the composer; appending keeps any unsent text.
      void onCommand(rewindCommand(current, review))
        .then(() => appendToDraft(scope, { text: review.prompt }))
        .catch(reportActionFailure);
    } catch (cause) {
      setActionError(cause);
    }
  };
  // Accepted commands clear and re-read in the screen's dispatch, after the awaited mutation. The
  // Stop state is the screen's shared request, so a Stop from here or the composer reads the same.
  // A steer belongs to the turn it steered, so the clock keeps the turn's own start.
  const turnStartedAt = live ? latestTurnStartedAt(blocks) : undefined;
  const needsApproval = live && !!blocks?.some((block) => block.approval && !block.approval.decided);
  const retrying = !!live && !!session?.session.retryMessage?.trim();
  const liveRowShown = !!live && !retrying && !pending && !needsApproval;
  // The run state the strip above the composer used to carry ("Waiting for 2 agents", "Needs you",
  // "Done") now lives in the floating cluster with the clock, goal, subagents and queue.
  const justFinished = useJustFinished(!!live);
  const activity = useMemo(() => deriveSessionActivity({
    blocks, live: !!live, children, justFinished,
    pendingQuestion: !!pending,
    backgroundTasks: session?.session.backgroundTasks, backgroundAgents: session?.session.backgroundAgents,
  }), [blocks, live, children, justFinished, pending, session?.session.backgroundTasks, session?.session.backgroundAgents]);
  const queueSummary = useStatusClusterQueue();
  const segments = clusterSegments({
    activity: activity.state,
    live: !!live,
    stopping,
    // The transcript's live row alone carries the turn clock; the capsule says the run
    // state only when that row is not rendered. The provider-retry notice already says the turn is going.
    liveRowShown: retrying || liveRowShown,
    goal: activeSessionGoal(session?.session),
    agents: agentRuns ? agentCounts : undefined,
    queue: queueSummary,
    following,
    hasContent: visibleBlocks.length > 0,
  });
  const capsuleShown = hasCapsule(segments);
  const clusterShown = capsuleShown || segments.jump;
  const { padding: contentBottom, clearance: bottomClearance } = transcriptBottomSpace({
    capsuleHeight,
    capsuleShown,
    reserve: !!live || justFinished,
    minCapsule: metrics.touchTarget,
    gap: space.sm,
    edgeFade: EDGE_FADE,
    quickPanelClearance,
  });
  // A grown band while following would leave the newest line under the capsule; re-pin once the
  // new padding is laid out. A drag, momentum or navigation hold has already released following.
  const pinnedBottom = useRef(contentBottom);
  useEffect(() => {
    if (pinnedBottom.current === contentBottom) return;
    pinnedBottom.current = contentBottom;
    if (!scrollPosition.current.following || !hydrated.current) return;
    const frame = requestAnimationFrame(() => {
      if (scrollPosition.current.following) void listRef.current?.scrollToEnd({ animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [contentBottom]);
  // The composer strip shows the queue count and run state itself whenever this list is not drawing
  // the cluster (cited-turn search, repair, a render failure that unmounts it).
  useRegisterStatusCluster(targetState !== "searching" && targetState !== "failed");
  // Same exact-run cancel as the composer's Stop; the notice never resends the turn.
  const stopTurn = () => {
    if (!session?.runId || stopping) return;
    void onCommand({ type: "cancel", sessionId: scope.sessionId, runId: session.runId }).catch((cause: unknown) => {
      // A lost reply is reconciled by the status check below, not a toast.
      if (!(cause instanceof UncertainCommand)) setActionError(cause);
    });
  };
  const continueTurn = () => {
    if (!session) return;
    try {
      void onCommand(composerCommand(session, "send", CONTINUE_PROMPT, [])).catch(reportActionFailure);
    } catch (cause) {
      setActionError(cause);
    }
  };
  // The latest failed turn's Retry and the usage-limit actions, shown on that turn's failure card.
  const { recovery, footerLimit } = useTurnRecovery({
    session,
    scope,
    blocked,
    queued: !!queueSummary,
    onCommand,
    onFailure: reportActionFailure,
  });
  const activeEntryId =targetState === "ready" ? targetEntry?.id : activeFind?.entryId;
  const renderItem = useCallback(
    ({ item }: { item: TranscriptEntry }) => (
      <TranscriptRow
        rewind={
          item.kind === "message" && item.block.role === "user" && !item.block.draft ? rewindState : "none"
        }
        onRewind={onRewind}
        item={item}
        highlighted={item.id === activeEntryId}
        live={item.kind === "agents" ? live && latestAgents.has(item.id) : (item.kind !== "message" || !!item.block.draft) && live}
        focusRunId={item.kind === "agents" && item.id === focusRun?.entryId ? focusRun.blockId : undefined}
        openRunNonce={item.kind === "agents" && item.id === focusRun?.entryId && runRequest?.blockId === focusRun.blockId ? runRequest.nonce : undefined}
        getRevision={getRevision}
        parentProvider={harness}
        context={context}
        responseText={responseText}
        scope={rowScope}
        runId={runId}
        disabled={blocked}
        onCommand={rowCommand}
        onInspect={onInspect}
        onOpenChangedFile={onOpenChangedFile}
      />
    ),
    [
      activeEntryId,
      live,
      latestAgents,
      focusRun?.entryId,
      focusRun?.blockId,
      runRequest,
      getRevision,
      harness,
      context,
      responseText,
      rowScope,
      runId,
      blocked,
      rowCommand,
      onInspect,
      onOpenChangedFile,
      rewindState,
      onRewind,
    ],
  );
  const loadEarlier = () => {
    if (earlier.isPending || session?.history?.before === undefined) return;
    applyScroll({ type: "release" });
    void earlier.mutateAsync().catch(() => {});
  };

  if (targetState === "searching" || targetState === "failed") {
    return (
      <View style={{ flex: 1, justifyContent: "center", gap: space.md, paddingTop: topInset }}>
        {targetState === "searching" ? (
          <Loading label={copy("Alıntılanan mesaj aranıyor…", "Finding cited message…")} />
        ) : (
          <StateView
            tone="warning"
            title={copy(
              "Alıntılanan mesaj bulunamadı veya yüklenemedi.",
              "The cited message could not be found or loaded.",
            )}
            action={{ label: copy("Oturumun tamamını aç", "Open full session"), onPress: () => setTargetState("dismissed") }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {/* Open, find sits in the flow below the floating header; the list then starts under it. */}
      <View style={{ paddingTop: findOpen ? topInset : 0 }}>
      <TranscriptFindControls
        open={findOpen}
        onToggle={() => {
          if (findOpen) Keyboard.dismiss();
          scrollAttempt.current++;
          onFindOpenChange(!findOpen);
          setActiveFindId(null);
          setFailedFindScroll(undefined);
        }}
        query={findQuery}
        onQuery={(value) => {
          if (value === findQuery) return;
          scrollAttempt.current++;
          setFindQuery(value);
          setActiveFindId(null);
          setFailedFindScroll(undefined);
        }}
        count={findResults.length}
        searching={!!findQuery.trim() && !currentFind}
        searchError={currentFind?.error}
        active={activeFind}
        activeIndex={findResults.findIndex((result) => result.blockId === activeFindId)}
        hasEarlier={session?.history?.before !== undefined}
        busy={earlier.isPending}
        onEarlier={loadEarlier}
        onNavigate={navigateFind}
        failed={!!activeFind && failedFindScroll === activeFind}
        onRetry={() => {
          if (activeFind) scrollToFind(activeFind);
        }}
        onInspect={activeFind && (matchingActivity || matchingAgents) && currentFind ? () => {
          if (committedFind.current !== currentFind) return;
          if (matchingActivity) onInspect(matchingActivity, activeFind.blockId);
          else setRunRequest((current) => ({ blockId: activeFind.blockId, nonce: (current?.nonce ?? 0) + 1 }));
        } : undefined}
      />
      </View>
      {findOpen ? <MutationState mutation={earlier} /> : null}
      <ChatConversation style={{ flex: 1, minHeight: 0 }} collapsable={false}>
        <FailureRecoveryContext.Provider value={recovery}>
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
          // The header floats over the list and the cluster over its end: both reserve their measured height.
          contentContainerStyle={{ ...readableColumn, paddingTop: (findOpen ? 0 : topInset) + space.sm, paddingBottom: contentBottom }}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          onScrollEndDrag={onScrollEndDrag}
          onMomentumScrollBegin={onMomentumScrollBegin}
          onMomentumScrollEnd={onMomentumScrollEnd}
          // In the list flow, the first-use state never covers a live turn, earlier history or footer notices.
          ListEmptyComponent={session && !pending && !live && session.history?.before === undefined ? (
            <Empty
              compact={false}
              illustration="chat-empty"
              title={copy("Oturumu başlat", "Start the session")}
              detail={copy(
                "Ne yapmak istediğini yaz; bilgisayarındaki ajan devralır.",
                "Describe what you want done and the agent on your computer takes it from there.",
              )}
            />
          ) : undefined}
          ListHeaderComponent={
            <View style={{ gap: space.row, paddingBottom: space.sm }}>
              {/* While find is open its row owns Load earlier; the list does not repeat it. */}
              {session?.history?.before !== undefined && !findOpen ? (
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
              <OutboxTranscript scope={scope} blocked={blocked} blocks={blocks} />
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
              ) : liveRowShown ? (
                <LiveTurnRow startedAt={turnStartedAt} stopping={stopping} />
              ) : null}
              {continueOffered ? (
                <InterruptedTurnNotice disabled={blocked} onContinue={continueTurn} />
              ) : null}
              {/* A limit whose failure card is not in the list still offers its recovery here. */}
              {footerLimit ? <UsageLimitNotice {...footerLimit} /> : null}
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
              {/* Only a lost reply needs this card's status check (it also holds the session until
                  reconciled). Every other failure is shown once, by the control that sent it: the
                  composer, an approval, a question, a draft's or this list's toast. */}
              <CommandError
                error={command.error instanceof UncertainCommand ? command.error : null}
                onRecovered={onReceiptHandled}
                onDismiss={onReceiptHandled}
              />
              <CommandError
                error={stopError}
                onRecovered={onStopReceiptHandled}
                onDismiss={onStopReceiptHandled}
              />
            </View>
          }
        />
        </FailureRecoveryContext.Provider>
        {rewind && session ? (
          <SessionCheckpointReview
            value={{
              kind: "rewind",
              review: rewind,
              blocks: session.session.blocks.filter((block) => rewind.affectedIds.includes(block.id)),
            }}
            machineName={machine?.id === scope.machineId && machine.name ? machine.name : copy("Bilgisayar", "Computer")}
            cwd={rewind.cwd}
            onClose={() => setRewind(null)}
            onConfirm={confirmRewind}
          />
        ) : null}
        {inspection ? (
          <ActivityInspector
            blocks={inspectedBlocks}
            inspection={inspection}
            onChange={(next) => setInspection((current) => current === inspection ? next : current)}
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
        {/* The list scrolls under a soft fade above the composer; touches pass through it. */}
        <LinearGradient
          pointerEvents="none"
          colors={[`${colors.background}00`, colors.background]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: EDGE_FADE }}
        />
        {clusterShown ? (
          <View pointerEvents="box-none" style={{ position: "absolute", left: quickPanelInline, right: quickPanelInline, bottom: space.sm, alignItems: "center" }}>
            <SessionStatusCluster
              segments={segments}
              activity={activity}
              startedAt={turnStartedAt}
              unseen={unseen}
              onJump={jumpToLatest}
              onAgents={agentRuns?.openAgents}
              onCapsuleLayout={(event) => {
                const next = Math.ceil(event.nativeEvent.layout.height);
                setCapsuleHeight((current) => (current === next ? current : next));
              }}
            />
          </View>
        ) : null}
      </ChatConversation>
    </View>
  );
}
import { OutboxTranscript } from "../outbox/ui/outbox-transcript";
