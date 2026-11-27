import { useEffect, useState } from "react";
import { View } from "react-native";
import { TextSweep, sweepRemaining } from "@/ui/text-sweep";
import { useFeedbackAnimation } from "@/ui/use-feedback-animation";
import { useChatTextStyles } from "@/ui/chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { UserMessageText, USER_MESSAGE_LINES } from "./user-message-text";
import Bot from "lucide-react-native/icons/bot";
import { Body, Button, Sheet } from "@/ui/primitives";
import { pushOnce } from "@/ui/navigation";
import { ChatSummary } from "@/ui/chat-controls";
import { MessageText } from "@/ui/message-text";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import type { TranscriptBlockProps } from "./session-types";
import type { UserTurn } from "./user-turn";
import { useSessionAgentRuns } from "./session-agent-runs";
import { childForRun } from "./subagent-sessions-model";

/** A just-sent message shimmers this long at most, then rests in still, muted text. */
export const PENDING_SWEEP_MS = 10_000;

/**
 * The text of a message on its way to the computer: desktop's working sweep through the words, no
 * "sent" caption. The sweep masks a plain clamped copy (a mask cannot hold the expandable text), so
 * after `PENDING_SWEEP_MS`, or under reduced motion, it rests as the normal expandable text, muted.
 */
export function PendingUserMessage({
  text,
  since,
  sweep = true,
}: {
  text: string;
  /** Epoch ms the message was sent; the cap counts from here (or from first display). */
  since?: number;
  /** Only the latest pending message moves. */
  sweep?: boolean;
}) {
  const { colors } = useMobileTheme();
  const typography = useChatTextStyles(useChatAppearance((state) => state.textSize));
  const feedback = useFeedbackAnimation();
  const [shownAt] = useState(() => Date.now());
  const start = since ?? shownAt;
  const [moving, setMoving] = useState(() => sweepRemaining(start, PENDING_SWEEP_MS) !== 0);
  useEffect(() => {
    const remaining = sweepRemaining(start, PENDING_SWEEP_MS) ?? 0;
    setMoving(remaining > 0);
    if (!remaining) return;
    const timer = setTimeout(() => setMoving(false), remaining);
    return () => clearTimeout(timer);
  }, [start]);
  if (sweep && moving && feedback)
    return (
      <TextSweep active color={colors.muted} ink={colors.text} priority={3} since={start} capMs={PENDING_SWEEP_MS}>
        <Body numberOfLines={USER_MESSAGE_LINES} selectable={false} style={[typography.user, { color: colors.muted }]}>
          {text}
        </Body>
      </TextSweep>
    );
  return (
    <View style={{ opacity: 0.72 }}>
      <UserMessageText text={text} />
    </View>
  );
}

/**
 * A user-role turn nobody typed, shown as desktop does: a delegate's result or message is a
 * compact row with its text behind a sheet, and an app resume prompt is one quiet line. A delegate
 * that is its own listed session also offers to open that session.
 */
export function UserTurnNotice({
  turn,
  context,
}: {
  turn: Exclude<UserTurn, { kind: "message" }>;
  context: TranscriptBlockProps["context"];
}) {
  const copy = useCopy();
  const { colors, uiStyles } = useMobileTheme();
  const [open, setOpen] = useState<number>();
  const agentRuns = useSessionAgentRuns();
  if (turn.kind === "resume")
    return (
      <Body muted style={[uiStyles.caption, { paddingVertical: space.xs }]}>
        {copy("Bu tur sürdürüldü", "Resumed this turn")}
      </Body>
    );
  const sections = turn.sections;
  const section = open === undefined ? undefined : sections[open];
  const sectionTitle = (value: (typeof sections)[number]) =>
    value.reason === "completion"
      ? copy("{p0} sonucu", "Result from {p0}", { p0: value.title })
      : copy("{p0} mesajı", "Message from {p0}", { p0: value.title });
  return (
    <View style={{ gap: space.xs }}>
      {sections.map((value, index) => {
        const child = agentRuns ? childForRun(agentRuns.children, value.runId) : undefined;
        const summary = (
        <ChatSummary
          key={`${value.runId}:${index}`}
          label={sectionTitle(value)}
          status={
            value.status === undefined
              ? undefined
              : value.status === "succeeded"
                ? copy("Tamamlandı", "Done")
                : value.status === "failed"
                  ? copy("Başarısız", "Failed")
                  : copy("Durduruldu", "Stopped")
          }
          color={value.status === "failed" ? colors.danger : colors.muted}
          icon={<Bot size={16} color={colors.muted} />}
          onPress={() => setOpen(index)}
        />
        );
        if (!child || !agentRuns) return summary;
        return (
          <View key={`${value.runId}:${index}`} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <View style={{ flex: 1, minWidth: 0 }}>{summary}</View>
            <Button
              label={copy("Oturumu aç", "Open session")}
              tone="quiet"
              density="compact"
              onPress={() => pushOnce({ pathname: "/session/[id]", params: { id: child.sessionId, machineId: agentRuns.machineId, projectId: child.projectId } })}
            />
          </View>
        );
      })}
      <Sheet
        visible={section !== undefined}
        title={section ? sectionTitle(section) : ""}
        size="full"
        onClose={() => setOpen(undefined)}
      >
        {section ? <MessageText text={section.body} context={context} role="assistant" /> : null}
      </Sheet>
    </View>
  );
}
