import { useMobileTheme } from "@/ui/theme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, View } from "react-native";
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
import { transcriptEntries, type TranscriptEntry } from "./transcript-model";
import { ActivityGroup } from "./activity-group";
import type { SessionTranscriptProps } from "./session-types";
import { TranscriptScrollPosition } from "./transcript-scroll";
import { useReducedMotion } from "react-native-reanimated";
import Animated from "react-native-reanimated";
import { reveal } from "@/ui/motion";
import { ChatConversation } from "@/ui/chat";

export function SessionTranscript({
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
  const responseTexts = useMemo(() => {
    const result = new Map<string, string>();
    let group: import("./wire").Block[] = [];
    const flush = () => {
      const text = group
        .map((block) => block.text)
        .filter(Boolean)
        .join("\n\n");
      group.forEach((block) => result.set(block.id, text));
      group = [];
    };
    for (const block of session?.session.blocks ?? []) {
      if (block.role === "user") flush();
      if (block.role === "assistant") group.push(block);
    }
    flush();
    return result;
  }, [session?.session.blocks]);
  const earlier = useEarlierSession(scope, session);
  const inputVisibility = useInvertedInputVisibility<TranscriptEntry>();
  const scrollPosition = useRef(new TranscriptScrollPosition());
  const anchorFrame = useRef<number | null>(null);
  const initialAnchor = useRef(false);
  const [anchored, setAnchored] = useState(false);
  const reduceMotion = useReducedMotion();
  const [awayFromLatest, setAwayFromLatest] = useState(false);
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
    () => transcriptEntries(session?.session.blocks ?? [], session?.session.harness).reverse(),
    [session?.session.blocks, session?.session.harness],
  );
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
          anchored ? { minIndexForVisible: 0, autoscrollToTopThreshold: 32 } : undefined
        }
        contentContainerStyle={{ gap: space.row, paddingVertical: space.sm }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={anchorLatest}
        onContentSizeChange={(width, height) => {
          inputVisibility.onContentSizeChange(width, height);
          anchorLatest();
        }}
        onScrollBeginDrag={() => {
          scrollPosition.current.beginDrag();
          inputVisibility.onScrollBeginDrag();
        }}
        onScrollEndDrag={() => {
          scrollPosition.current.endDrag();
          inputVisibility.onScrollEndDrag();
        }}
        onMomentumScrollEnd={(event) =>
          scrollPosition.current.onScroll(event.nativeEvent.contentOffset.y)
        }
        initialNumToRender={16}
        maxToRenderPerBatch={12}
        windowSize={9}
        renderItem={({ item }) =>
          item.kind === "activity" ? (
            <ActivityGroup
              context={context}
              blocks={item.blocks}
              author={item.author}
              scope={scope}
              revision={session?.revision ?? 0}
              runId={session?.runId}
              disabled={blocked}
              onCommand={onCommand}
            />
          ) : (
            <TranscriptBlock
              context={context}
              responseText={responseTexts.get(item.block.id)}
              block={item.block}
              author={item.author}
              scope={scope}
              revision={session?.revision ?? 0}
              runId={session?.runId}
              disabled={blocked}
              onCommand={onCommand}
            />
          )
        }
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
                busy={earlier.isPending}
                onPress={() => {
                  void earlier.mutateAsync().catch(() => {});
                }}
              />
            ) : null}
            <MutationState
              mutation={earlier}
              success={copy("Önceki mesajlar yüklendi.", "Earlier messages loaded.")}
            />
            {!visibleBlocks.length && !!session ? (
              <Empty
                title={copy("Ne yapmak istersin?", "What would you like to do?")}
                detail={copy(
                  "Mesajını yaz. Çalışma seçtiğin bilgisayarda devam eder.",
                  "Write a message. Work continues on your selected computer.",
                )}
              />
            ) : null}
          </View>
        }
      />
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
          <Button
            label={copy("Son mesaja git", "Jump to latest")}
            density="compact"
            tone="secondary"
            onPress={() => {
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
          </Button>
        </Animated.View>
      ) : null}
    </ChatConversation>
  );
}
