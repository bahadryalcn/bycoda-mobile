import { createThemedStyles } from "./themed-styles";
import { colors, monoFont } from "./tokens";
import type { ChatTextSize } from "@/state/chat-appearance-model";

const sizes = {
  compact: {
    assistant: 13,
    user: 14,
    line: 19,
    userLine: 20,
    code: 12,
    codeLine: 18,
    heading: 15,
    headingLine: 21,
  },
  standard: {
    assistant: 15,
    user: 16,
    line: 22,
    userLine: 23,
    code: 13,
    codeLine: 20,
    heading: 16,
    headingLine: 23,
  },
  large: {
    assistant: 17,
    user: 18,
    line: 25,
    userLine: 26,
    code: 15,
    codeLine: 23,
    heading: 18,
    headingLine: 26,
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
    heading: {
      color: colors.text,
      fontSize: size.heading,
      lineHeight: size.headingLine,
      fontWeight: "600",
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
export function chatTextStyles(textSize: ChatTextSize) {
  return presets[textSize];
}
