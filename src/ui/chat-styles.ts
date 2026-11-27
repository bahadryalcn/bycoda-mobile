import { createThemedStyles, useThemedStyles } from "./themed-styles";
import { colors, monoFont } from "./tokens";
import type { ChatTextSize } from "@/state/chat-appearance-model";

const sizes = {
  compact: {
    assistant: 13,
    user: 14,
    line: 19,
    userLine: 20,
    code: 11,
    codeLine: 17,
    heading: 16,
    headingLine: 22,
  },
  // Phone reading size: 16/24 prose (1.5 leading), one step above the app's 15/21 body text.
  standard: {
    assistant: 16,
    user: 16,
    line: 24,
    userLine: 23,
    code: 13,
    codeLine: 19,
    heading: 18,
    headingLine: 26,
  },
  large: {
    assistant: 18,
    user: 18,
    line: 27,
    userLine: 26,
    code: 14,
    codeLine: 21,
    heading: 20,
    headingLine: 28,
  },
} as const;

function createTextStyles(size: (typeof sizes)[ChatTextSize]) {
  return createThemedStyles(() => ({
    assistant: { color: colors.text, fontSize: size.assistant, lineHeight: size.line },
    user: { color: colors.text, fontSize: size.user, lineHeight: size.userLine },
    code: {
      color: colors.text,
      fontSize: size.code,
      lineHeight: size.codeLine,
      fontFamily: monoFont,
    },
    inlineCode: {
      color: colors.text,
      backgroundColor: colors.fill,
      fontWeight: "500",
    },
    heading: {
      color: colors.text,
      fontSize: size.heading,
      lineHeight: size.headingLine,
      fontWeight: "700",
    },
    author: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
    metadata: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  }));
}

const presets = {
  compact: createTextStyles(sizes.compact),
  standard: createTextStyles(sizes.standard),
  large: createTextStyles(sizes.large),
};

/** Shared with Settings preview; native accessibility font scaling remains enabled. */
export function useChatTextStyles(textSize: ChatTextSize) {
  return useThemedStyles(presets[textSize]);
}
