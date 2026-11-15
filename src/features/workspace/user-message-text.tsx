import { useState } from "react";
import { View } from "react-native";
import type { TextLayoutEvent } from "react-native";
import { Body, Button } from "@/ui/primitives";
import { useChatTextStyles } from "@/ui/chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";

export const USER_MESSAGE_LINES = 4;

/**
 * Desktop shows what the person typed as plain text, clamped to four lines with Show more.
 * A hidden, unclamped copy at the same width reports the real line count, so Show more appears
 * only when the laid-out text exceeds four lines.
 */
export function UserMessageText({ text }: { text: string }) {
  const copy = useCopy();
  const typography = useChatTextStyles(useChatAppearance((state) => state.textSize));
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const measure = (event: TextLayoutEvent) =>
    setOverflows(event.nativeEvent.lines.length > USER_MESSAGE_LINES);
  return (
    <View style={{ gap: space.xxs }}>
      <View>
        <Body
          selectable={expanded || !overflows}
          numberOfLines={expanded ? undefined : USER_MESSAGE_LINES}
          style={typography.user}
        >
          {text}
        </Body>
        {expanded ? null : (
          <Body
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            selectable={false}
            onTextLayout={measure}
            style={[typography.user, { position: "absolute", left: 0, right: 0, opacity: 0 }]}
          >
            {text}
          </Body>
        )}
      </View>
      {overflows ? (
        <Button
          label={expanded ? copy("Daha az göster", "Show less") : copy("Daha fazla göster", "Show more")}
          density="compact"
          tone="quiet"
          style={{ alignSelf: "flex-start" }}
          onPress={() => setExpanded((value) => !value)}
        />
      ) : null}
    </View>
  );
}
