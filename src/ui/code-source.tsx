import { useMemo } from "react";
import { Text } from "react-native";
import { CodePanel, CodeText } from "./primitives";
import { useMobileTheme } from "./theme";
import { useChatTextStyles } from "./chat-styles";
import { highlightCode } from "./message-highlight";
import type { ChatTextSize } from "@/state/chat-appearance-model";

/** One native code surface for every reader size; no HTML injection or code execution. */
export function CodeSource({ code, language, textSize, plain = false }: { code: string; language: string; textSize: ChatTextSize; plain?: boolean }) {
  const { colors } = useMobileTheme();
  const text = useChatTextStyles(textSize);
  const tokens = useMemo(() => plain ? [{ text: code, kind: "plain" as const }] : highlightCode(code, language), [code, language, plain]);
  return (
    <CodePanel style={{ borderWidth: 0, borderRadius: 0, backgroundColor: colors.panel }}>
      <CodeText style={text.code}>
        {tokens.map((token, index) => (
          <Text key={index} style={{ color:
            token.kind === "string" ? colors.success :
            token.kind === "comment" ? colors.subtle :
            token.kind === "keyword" ? colors.accent :
            token.kind === "number" ? colors.warning : colors.text,
          }}>{token.text}</Text>
        ))}
      </CodeText>
    </CodePanel>
  );
}

