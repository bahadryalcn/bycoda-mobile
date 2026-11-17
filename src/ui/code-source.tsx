import { CodeBlock } from "panelui-native/components/code-block";
import { CodePanel, CodeText } from "./primitives";
import { useMobileTheme } from "./theme";
import { useChatTextStyles } from "./chat-styles";
import { useChatDisplay } from "./chat-display";
import { CODE_SIZE_SCALE } from "./chat-display-model";
import type { ChatTextSize } from "@/state/chat-appearance-model";

/**
 * One native code surface for every reader size; no HTML injection or code execution.
 * Source is PanelUI CodeBlock: themed highlighting, lines kept whole and scrolled sideways.
 * `plain` pages of a long document wrap instead, since one page can be a single minified line;
 * the owner's code word-wrap preference selects the same wrapping surface.
 */
export function CodeSource({ code, language, textSize, plain = false }: { code: string; language: string; textSize: ChatTextSize; plain?: boolean }) {
  const text = useChatTextStyles(textSize);
  const scale = useChatDisplay((state) => CODE_SIZE_SCALE[state.codeSize]);
  const wrap = useChatDisplay((state) => state.codeWrap);
  const style = { ...text.code, fontSize: (text.code.fontSize ?? 12) * scale, lineHeight: (text.code.lineHeight ?? 18) * scale };
  // shortcut: wrapped code loses syntax highlighting because CodeBlock only scrolls sideways; upgrade when PanelUI CodeBlock gains a wrap prop.
  if (!plain && !wrap)
    return (
      <CodeBlock
        code={code}
        language={language}
        textStyle={style}
        className="rounded-none border-0 bg-transparent"
      />
    );
  return <PlainSource code={code} style={style} />;
}

function PlainSource({ code, style }: { code: string; style: object }) {
  const { colors } = useMobileTheme();
  return (
    <CodePanel style={{ borderWidth: 0, borderRadius: 0, backgroundColor: colors.panel }}>
      <CodeText style={[style, { color: colors.text }]}>{code}</CodeText>
    </CodePanel>
  );
}
