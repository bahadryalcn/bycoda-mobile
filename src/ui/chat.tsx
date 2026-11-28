import React from "react";
import Animated from "react-native-reanimated";
import { View, type ViewProps, type HostInstance } from "react-native";
import { Message } from "panelui-native/components/message";
import { Surface } from "panelui-native/components/surface";
import type { UIMessage } from "ai";
import type { MessageContext } from "./media-policy";
import { MessageText } from "./message-text";
import { fontSize, lineHeight, metrics, radii, space, type MobileColors } from "./tokens";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import FileMinus from "lucide-react-native/icons/file-minus";
import FilePen from "lucide-react-native/icons/file-pen";
import FilePlus from "lucide-react-native/icons/file-plus";
import { useMobileTheme } from "./theme";
import { Body } from "./typography";
import { LifecycleButton as PanelButton } from "./busy-indicator";

/** Product facade keeps transcript semantics while PanelUI owns presentation. */
export const ChatMessage = React.memo(function ChatMessage({
  role,
  message: _message,
  style,
  ...props
}: Omit<ViewProps, "role"> & { role: UIMessage["role"]; message?: UIMessage; className?: string }) {
  return (
    <Message
      {...props}
      align={role === "user" ? "end" : "start"}
      style={[{ flexDirection: "column", alignItems: "stretch", minWidth: 0, maxWidth: "100%", width: role === "user" ? "auto" : "100%" }, style]}
    />
  );
});

/** Bubble width belongs to ChatMessage; rich content must stretch within that budget. */
export function ChatMessageContent({ style, ...props }: React.ComponentProps<typeof Message.Content>) {
  return <Message.Content {...props} style={[{ minWidth: 0, maxWidth: "100%", width: "100%", alignItems: "stretch" }, style]} />;
}
export function ChatResponse({
  message,
  context,
}: {
  message: UIMessage;
  context?: MessageContext;
}) {
  return (
    <MessageText
      text={message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n")}
      role={message.role === "user" ? "user" : "assistant"}
      context={context}
      compactMedia
    />
  );
}

export const ChatConversation = React.forwardRef<HostInstance, ViewProps>(
  function ChatConversation(props, ref) {
    // The application already owns inversion, history anchoring and keyboard space.
    // PanelUI MessageScroller.List was evaluated and not adopted: it is a plain FlatList that
    // animates scrollToEnd on every content-size change, has no drag-aware follow machine,
    // offset restore, keyed find-jump or end-aligned short transcripts, which LegendList plus
    // transcript-scroll.ts provide here.
    return <Surface {...props} variant="transparent" padding="none" ref={ref as never} />;
  },
);

/**
 * Plain capsule row for the composer: the owning feature supplies the leading action,
 * field and trailing action, so drafts, uploads and dispatch stay in one place.
 * Legacy inline consumers retain this surface. Session composers use ChatComposer,
 * backed by PanelUI AIInput with the application's existing keyboard owner.
 */
export const ChatComposerSurface = Animated.View;

/** The user's own message: a rounded trailing bubble that never spans the whole column. */
export function chatUserBubbleStyle(colors: MobileColors) {
  return {
    alignSelf: "flex-end" as const,
    maxWidth: "85%" as const,
    backgroundColor: colors.userMessage,
    borderRadius: radii.bubble,
    paddingHorizontal: space.md + space.xxs,
    paddingVertical: space.sm + space.xxs,
  };
}

/**
 * One file a turn changed (desktop's changed-files strip): type-of-change glyph, the file name ahead
 * of its folder, an Added/Deleted mark and the line delta in the activity steps' colors. A row with
 * `onPress` opens the turn's edits of that file; without it the row is a plain record.
 */
export function ChatChangedFile({
  name,
  folder,
  status,
  statusLabel,
  counts,
  accessibilityLabel,
  onPress,
}: {
  name: string;
  folder?: string;
  status?: "added" | "deleted" | "modified";
  /** Localized Added/Deleted mark; a modified file shows none, like desktop. */
  statusLabel?: string;
  counts?: { additions: number; deletions: number };
  accessibilityLabel: string;
  onPress?: () => void;
}) {
  const { colors } = useMobileTheme();
  const deleted = status === "deleted";
  const Glyph = status === "added" ? FilePlus : deleted ? FileMinus : FilePen;
  const glyphColor = status === "added" ? colors.success : deleted ? colors.danger : colors.muted;
  const caption = { fontSize: fontSize.caption, lineHeight: lineHeight.caption };
  const content = (
    <>
      <View accessible={false} style={{ width: 20, alignItems: "center" }}>
        <Glyph size={16} color={glyphColor} />
      </View>
      <Body
        mono
        selectable={false}
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontSize: fontSize.small,
          lineHeight: lineHeight.small,
          fontWeight: "500",
          ...(deleted ? { textDecorationLine: "line-through" as const, color: colors.muted } : {}),
        }}
      >
        {name}
      </Body>
      {folder ? (
        <Body muted mono selectable={false} numberOfLines={1} ellipsizeMode="head" style={[caption, { flex: 1, minWidth: 0 }]}>
          {folder}
        </Body>
      ) : <View style={{ flex: 1 }} />}
      {statusLabel ? (
        <Body selectable={false} numberOfLines={1} style={[caption, { flexShrink: 0, color: deleted ? colors.danger : colors.success }]}>
          {statusLabel}
        </Body>
      ) : null}
      {counts ? (
        <Body mono selectable={false} numberOfLines={1} style={[caption, { flexShrink: 0, fontVariant: ["tabular-nums"] }]}>
          <Body mono style={[caption, { color: colors.success }]}>{`+${counts.additions}`}</Body>
          {" "}
          <Body mono style={[caption, { color: colors.danger }]}>{`−${counts.deletions}`}</Body>
        </Body>
      ) : null}
      {onPress ? <ChevronRight size={15} color={colors.subtle} /> : null}
    </>
  );
  const rowStyle = {
    minHeight: metrics.touchTarget,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.sm,
    borderRadius: radii.control,
  };
  if (!onPress)
    return (
      <View accessible accessibilityLabel={accessibilityLabel} style={rowStyle}>
        {content}
      </View>
    );
  return (
    <PanelButton
      variant="ghost"
      pressScale={1}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{ ...rowStyle, backgroundColor: "transparent" }}
    >
      {content}
    </PanelButton>
  );
}
