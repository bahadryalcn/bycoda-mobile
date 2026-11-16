import { CodeBlock } from "panelui-native/components/code-block";
import { CodePanel, CodeText } from "./primitives";
import { useMobileTheme } from "./theme";
import { useChatTextStyles } from "./chat-styles";
import type { ChatTextSize } from "@/state/chat-appearance-model";

/**
 * One native code surface for every reader size; no HTML injection or code execution.
 * Source is PanelUI CodeBlock: themed highlighting, lines kept whole and scrolled sideways.
 * `plain` pages of a long document wrap instead, since one page can be a single minified line.
 */
export function CodeSource({ code, language, textSize, plain = false }: { code: string; language: string; textSize: ChatTextSize; plain?: boolean }) {
  const text = useChatTextStyles(textSize);
  if (!plain)
    return (
      <CodeBlock
        code={code}
        language={language}
        textStyle={text.code}
        className="rounded-none border-0 bg-transparent"
      />
    );
  return <PlainSource code={code} textSize={textSize} />;
}

function PlainSource({ code, textSize }: { code: string; textSize: ChatTextSize }) {
  const { colors } = useMobileTheme();
  const text = useChatTextStyles(textSize);
  return (
    <CodePanel style={{ borderWidth: 0, borderRadius: 0, backgroundColor: colors.panel }}>
      <CodeText style={[text.code, { color: colors.text }]}>{code}</CodeText>
    </CodePanel>
  );
}
