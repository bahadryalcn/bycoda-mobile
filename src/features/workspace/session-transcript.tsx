import { useMobileTheme } from "@/ui/theme";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Keyboard, View } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import CircleCheck from "lucide-react-native/icons/circle-check";
import { Body, Button, Empty, MutationState, Row } from "@/ui/primitives";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { useHostClient } from "@/state/queries";
import { CommandError, workspaceStyles } from "./shared";
import { useEarlierSession } from "./session-queries";
import { QuestionCard } from "./question-card";
import { TranscriptBlock } from "./transcript-block";
import { useInvertedInputVisibility } from "./use-inverted-input-visibility";
import { completeResponseText, TranscriptPresentation, type TranscriptEntry } from "./transcript-model";
import { ActivityGroup } from "./activity-group";
import { ActivityInspector, type ActivityInspection } from "./activity-inspector";
import type { SessionTranscriptProps } from "./session-types";
import { TranscriptScrollPosition } from "./transcript-scroll";
import { useReducedMotionPreference } from "@/ui/use-reduced-motion";
import Animated from "react-native-reanimated";
import { reveal } from "@/ui/motion";
import { ChatConversation } from "@/ui/chat";
import { ChatCircleAction } from "@/ui/chat-controls";
import { TranscriptFindControls } from "./transcript-find-controls";
import { findTranscript, nextTranscriptResult, type TranscriptFindResult } from "./transcript-find-model";
import { TranscriptFindScroll } from "./transcript-find-scroll";

export function SessionTranscript({
  view,
  scope,
  session,
  blocked,
  command,
  onCommand,
  onReceiptHandled,
}: SessionTranscriptProps) {
  useMobileTheme();
  const copy = useCopy();
  const client = useHostClient();
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
  const responseText = useCallback((id: string) => completeResponseText(session?.session.blocks ?? [], id), [session?.session.blocks]);
  const presentation = useRef(new TranscriptPresentation());
  const earlier = useEarlierSession(scope, session);
  const inputVisibility = useInvertedInputVisibility<TranscriptEntry>();
  const scrollPosition = useRef(new TranscriptScrollPosition());
  const anchorFrame = useRef<number | null>(null);
  const initialAnchor = useRef(false);
  const [anchored, setAnchored] = useState(false);
  const reduceMotion = useReducedMotionPreference();
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const [inspection, setInspection] = useState<ActivityInspection | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const deferredQuery = useDeferredValue(findQuery);
  const [activeFindId, setActiveFindId] = useState<string | null>(null);
  const [findScrollFailed, setFindScrollFailed] = useState(false);
  const findScroll = useRef(new TranscriptFindScroll());
  const findRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspectedBlocks = useMemo(() => {
    const ids = new Set(inspection?.ids);
    return (session?.session.blocks ?? []).filter((block) => ids.has(block.id));
  }, [inspection?.ids, session?.session.blocks]);
  const awayRef = useRef(false);
  const trackInputScroll = inputVisibility.onScroll;
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      trackInputScroll(event);
      // Ignore native anchoring offsets before the first hydrated layout.
      if (initialAnchor.current) scrollPosition.current.onScroll(event.nativeEvent.contentOffset.y);
      const away = event.nativeEvent.contentOffset.y > 96;
      if (away !== awayRef.current) {
        awayRef.current = away;
        setAwayFromLatest(away);
      }
    },
    [trackInputScroll],
  );
  const visibleBlocks = useMemo(
    () => presentation.current.update(session?.session.blocks ?? [], session?.session.harness, {
      view, running: session?.status === "running",
    }).slice().reverse(),
    [session?.session.blocks, session?.session.harness, session?.status, view],
  );
  const findResults = useMemo(() => findOpen ? findTranscript(visibleBlocks, deferredQuery) : [], [visibleBlocks, deferredQuery, findOpen]);
  const activeFind = findResults.find((result) => result.blockId === activeFindId);
  const findEntriesRef = useRef(visibleBlocks);
  findEntriesRef.current = visibleBlocks;
  const cancelFindScroll = useCallback(() => {
    if (findRetryTimer.current !== null) clearTimeout(findRetryTimer.current);
    findRetryTimer.current = null;
    findScroll.current.cancel();
  }, []);
  useEffect(() => cancelFindScroll, [cancelFindScroll]);
  const scrollToFind = useCallback((result: TranscriptFindResult) => {
    cancelFindScroll();
    Keyboard.dismiss();
    setFindScrollFailed(false);
    setActiveFindId(result.blockId);
    // Searching owns the scroll until Jump to latest or an explicit user scroll.
    scrollPosition.current.beginDrag();
    if (anchorFrame.current !== null) {
      cancelAnimationFrame(anchorFrame.current);
      anchorFrame.current = null;
    }
    findScroll.current.select(result.entryId);
    inputVisibility.listRef.current?.scrollToIndex({ index: result.index, viewPosition: 0.5, animated: !reduceMotion });
  }, [cancelFindScroll, inputVisibility.listRef, reduceMotion]);
  const navigateFind = (direction: 1 | -1) => {
    const result = nextTranscriptResult(findResults, activeFindId, direction);
    if (result) scrollToFind(result);
  };
  const pending = session?.session.pendingQuestion;
  const anchorLatest = useCallback(() => {
    if (!scrollPosition.current.shouldAnchor(visibleBlocks.length > 0 || !!pending)) return;
    if (anchorFrame.current !== null) cancelAnimationFrame(anchorFrame.current);
    anchorFrame.current = requestAnimationFrame(() => {
      anchorFrame.current = null;
      if (!scrollPosition.current.shouldAnchor(true)) return;
      inputVisibility.listRef.current?.scrollToOffset({ offset: 0, animated: false });
      initialAnchor.current = true;
      setAnchored(true);
    });
  }, [visibleBlocks.length, pending, inputVisibility.listRef]);
  useEffect(() => {
    anchorLatest();
    return () => {
      if (anchorFrame.current !== null) cancelAnimationFrame(anchorFrame.current);
    };
  }, [anchorLatest]);
  useEffect(() => {
    if (!command.isSuccess) return;
    const timer = setTimeout(onReceiptHandled, 3500);
    return () => clearTimeout(timer);
  }, [command.isSuccess, onReceiptHandled]);

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <TranscriptFindControls
        open={findOpen}
        onToggle={() => {
          cancelFindScroll();
          if (findOpen) Keyboard.dismiss();
          setFindOpen((current) => !current);
          setActiveFindId(null);
          setFindScrollFailed(false);
        }}
        query={findQuery}
        onQuery={(value) => {
          cancelFindScroll();
          setFindQuery(value);
          setActiveFindId(null);
          setFindScrollFailed(false);
        }}
        count={findQuery === deferredQuery ? findResults.length : 0}
        active={activeFind}
        activeIndex={findResults.findIndex((result) => result.blockId === activeFindId)}
        hasEarlier={session?.history?.before !== undefined}
        busy={earlier.isPending}
        onEarlier={() => { void earlier.mutateAsync().catch(() => {}); }}
        onNavigate={navigateFind}
        failed={findScrollFailed}
        onRetry={() => { if (activeFind) scrollToFind(activeFind); }}
        onInspect={activeFind && visibleBlocks[activeFind.index]?.kind === "activity" ? () => {
          const entry = visibleBlocks[activeFind.index];
          if (entry?.kind === "activity") setInspection({ ids: entry.blocks.map((block) => block.id), selectedId: activeFind.blockId, author: entry.author });
        } : undefined}
      />
      {findOpen ? <MutationState mutation={earlier} /> : null}
      <ChatConversation
        ref={inputVisibility.viewportRef}
        onLayout={inputVisibility.onViewportLayout}
        style={{ flex: 1, minHeight: 0 }}
        collapsable={false}
      >
      <FlatList<TranscriptEntry>
        ref={inputVisibility.listRef}
        style={{ flex: 1, minHeight: 0 }}
        data={visibleBlocks}
        inverted
        keyExtractor={(block) => block.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={process.env.EXPO_OS === "ios" ? "interactive" : "on-drag"}
        contentInsetAdjustmentBehavior="never"
        maintainVisibleContentPosition={
          anchored ? { minIndexForVisible: 0 } : undefined
        }
        contentContainerStyle={{ gap: space.row, paddingVertical: space.sm }}
        onScroll={onScroll}
        onScrollToIndexFailed={({ averageItemLength }) => {
          const index = findScroll.current.retry(findEntriesRef.current);
          if (index === undefined) {
            setFindScrollFailed(true);
            return;
          }
          inputVisibility.listRef.current?.scrollToOffset({ offset: Math.max(0, averageItemLength * index), animated: false });
          if (findRetryTimer.current !== null) clearTimeout(findRetryTimer.current);
          findRetryTimer.current = setTimeout(() => {
            findRetryTimer.current = null;
            const currentIndex = findScroll.current.index(findEntriesRef.current);
            if (currentIndex >= 0) inputVisibility.listRef.current?.scrollToIndex({ index: currentIndex, viewPosition: 0.5, animated: false });
          }, 150);
        }}
        scrollEventThrottle={16}
        onLayout={anchorLatest}
        onContentSizeChange={(width, height) => {
          inputVisibility.onContentSizeChange(width, height);
          anchorLatest();
        }}
        onScrollBeginDrag={() => {
          cancelFindScroll();
          scrollPosition.current.beginDrag();
          inputVisibility.onScrollBeginDrag();
        }}
        onScrollEndDrag={(event) => {
          const { contentOffset, velocity } = event.nativeEvent;
          scrollPosition.current.endDrag(contentOffset.y, velocity?.y);
          inputVisibility.onScroll(event);
          if (!velocity?.y) inputVisibility.onScrollEndDrag();
        }}
        onMomentumScrollBegin={() => {
          scrollPosition.current.beginMomentum();
          inputVisibility.onScrollBeginDrag();
        }}
        onMomentumScrollEnd={(event) => {
          scrollPosition.current.endMomentum(event.nativeEvent.contentOffset.y);
          inputVisibility.onScroll(event);
          inputVisibility.onScrollEndDrag();
        }}
        initialNumToRender={16}
        maxToRenderPerBatch={12}
        windowSize={9}
        extraData={activeFind?.entryId}
        renderItem={({ item }) => <View style={item.id === activeFind?.entryId ? { backgroundColor: colors.selected } : undefined}>
          {item.kind === "activity" ? (
            <ActivityGroup
              live={session?.status === "running"}
              blocks={item.blocks}
              onInspect={(selectedId) => setInspection({
                ids: item.blocks.map((block) => block.id), selectedId, author: item.author,
              })}
            />
          ) : (
            <TranscriptBlock
              parentProvider={session?.session.harness}
              context={context}
              responseText={responseText}
              block={item.block}
              author={item.author}
              scope={scope}
              revision={session?.revision ?? 0}
              runId={session?.runId}
              disabled={blocked}
              onCommand={onCommand}
            />
          )}
        </View>}
        ListHeaderComponent={
          <View style={workspaceStyles.stack}>
            {pending && session?.runId ? (
              <QuestionCard
                key={`${session.runId}:${pending.requestId}`}
                question={pending}
                disabled={blocked}
                onAnswer={(reply) =>
                  onCommand({
                    type: "answer",
                    sessionId: scope.sessionId,
                    runId: session.runId,
                    requestId: pending.requestId,
                    reply,
                  })
                }
              />
            ) : null}
            {command.isSuccess ? (
              <Row style={{ flexWrap: "nowrap", gap: space.xs, paddingVertical: space.xxs }}>
                <CircleCheck size={13} color={colors.success} />
                <Body style={[uiStyles.caption, { color: colors.success }]}>
                  {copy("Komut bilgisayara ulaştı.", "The computer accepted the command.")}
                </Body>
              </Row>
            ) : null}
            <CommandError
              error={command.error}
              onRecovered={onReceiptHandled}
              onDismiss={onReceiptHandled}
            />
          </View>
        }
        ListFooterComponent={
          <View style={{ gap: space.row, paddingVertical: space.sm }}>
            {session?.history?.before !== undefined ? (
              <Button
                label={copy("Önceki mesajları yükle", "Load earlier messages")}
                tone="quiet"
                density="compact"
                busy={earlier.isPending}
                onPress={() => {
                  void earlier.mutateAsync().catch(() => {});
                }}
              />
            ) : null}
            <MutationState mutation={earlier} />
            {!visibleBlocks.length && !!session ? (
              <Empty
                title={copy("Ne yapmak istersin?", "What would you like to do?")}
              />
            ) : null}
          </View>
        }
      />
      {inspection ? <ActivityInspector blocks={inspectedBlocks} inspection={inspection} onChange={setInspection}
        live={session?.status === "running"}
        context={context} author={inspection.author} scope={scope} revision={session?.revision ?? 0}
        runId={session?.runId} parentProvider={session?.session.harness} disabled={blocked} onCommand={onCommand} /> : null}
      {awayFromLatest ? (
        <Animated.View
          entering={reveal}
          style={{
            position: "absolute",
            bottom: space.sm,
            alignSelf: "center",
            alignItems: "center",
          }}
        >
          <ChatCircleAction
            label={copy("Son mesaja git", "Jump to latest")}
            surface
            onPress={() => {
              cancelFindScroll();
              scrollPosition.current.jumpToLatest();
              inputVisibility.listRef.current?.scrollToOffset({
                offset: 0,
                animated: !reduceMotion,
              });
              awayRef.current = false;
              setAwayFromLatest(false);
            }}
          >
            <ArrowDown size={14} color={colors.accent} />
          </ChatCircleAction>
        </Animated.View>
      ) : null}
      </ChatConversation>
    </View>
  );
}
