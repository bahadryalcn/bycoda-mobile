import { use, useState } from "react";
import { View } from "react-native";
import type { TextLayoutEvent } from "react-native";
import { Collapsible } from "panelui-native/components/collapsible";
import { Body } from "@/ui/primitives";
import { useChatTextStyles } from "@/ui/chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { SelectableProse } from "@/ui/message-selection";
import { PressableTextContext } from "@/ui/text-selection";

export const USER_MESSAGE_LINES = 4;

/**
 * Desktop shows what the person typed as plain text, clamped to four lines with Show more.
 * A hidden, unclamped copy at the same width reports the real line count, so Show more appears
 * only when the laid-out text exceeds four lines.
 */
export function UserMessageText({ text, preview }: { text: string; preview?: string }) {
  const copy = useCopy();
  const typography = useChatTextStyles(useChatAppearance((state) => state.textSize));
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const collapsedText = preview ?? text;
  // Inside a long-press selection owner, the in-place layer (or the selection sheet) replaces the system callout.
  const ownedSelection = use(PressableTextContext);
  const complete = expanded || !overflows;
  const measure = (event: TextLayoutEvent) =>
    setOverflows(event.nativeEvent.lines.length > USER_MESSAGE_LINES);
  return (
    <Collapsible variant="ghost" open={expanded} onOpenChange={setExpanded} style={{ gap: space.xxs }}>
      <View>
        {/* Clamped text has no complete layout to lay a selection layer over; the sheet covers it. */}
        <SelectableProse text={complete ? (expanded ? text : collapsedText) : undefined} style={typography.user}>
          <Body
            selectable={!ownedSelection && complete}
            numberOfLines={expanded ? undefined : USER_MESSAGE_LINES}
            style={typography.user}
          >
            {expanded ? text : collapsedText}
          </Body>
        </SelectableProse>
        {expanded ? null : (
          <Body
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            selectable={false}
            onTextLayout={measure}
            style={[typography.user, { position: "absolute", left: 0, right: 0, opacity: 0 }]}
          >
            {collapsedText}
          </Body>
        )}
      </View>
      {preview !== undefined || overflows ? (
        <Collapsible.Trigger
          accessibilityLabel={expanded ? copy("Daha az göster", "Show less") : copy("Daha fazla göster", "Show more")}
          className="min-h-12 justify-start gap-2 py-0"
        >
          <Collapsible.Title className="flex-none text-sm text-muted-foreground">
            {expanded ? copy("Daha az göster", "Show less") : copy("Daha fazla göster", "Show more")}
          </Collapsible.Title>
          <Collapsible.Indicator />
        </Collapsible.Trigger>
      ) : null}
    </Collapsible>
  );
}
