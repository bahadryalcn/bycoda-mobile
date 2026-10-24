import { useMobileTheme } from "@/ui/theme";
import { lazy, Suspense, useMemo, useState } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Body, CodePanel, CodeText, ErrorText, Loading, Row, Sheet } from "./primitives";
import { HtmlDocument } from "./html-document";
import type { MessageContext } from "./media-policy";
import type { ChatTextSize } from "@/state/chat-appearance-model";
import { useCopy } from "./copy";
import { colors, radii, space } from "./tokens";
import { chatTextStyles } from "./chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { highlightCode } from "./message-highlight";
import { codePreview } from "./message-code-model";
import { ChatToolbarAction } from "./chat-controls";

const MessageDiagram = lazy(() =>
  import("./message-diagram").then((module) => ({ default: module.MessageDiagram })),
);

type MessageCodeProps = {
  code: string;
  language?: string;
  complete?: boolean;
  context?: MessageContext;
  textSize?: ChatTextSize;
  compact?: boolean;
};

/** One native code surface for every reader size; no HTML injection or code execution. */
function CodeSource({ code, language, textSize }: { code: string; language: string; textSize: ChatTextSize }) {
  useMobileTheme();
  const tokens = useMemo(() => highlightCode(code, language), [code, language]);
  return (
    <CodePanel style={{ borderWidth: 0, borderRadius: 0, backgroundColor: colors.panel }}>
      <CodeText style={chatTextStyles(textSize).code}>
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

/** Transcript shows a bounded preview; full code opens outside the inverted list. */
export function MessageCode({ compact = false, ...props }: MessageCodeProps) {
  useMobileTheme();
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const title = props.language || copy("Kod", "Code");
  return <>
    <CodeDocument {...props} compact={compact} onOpen={() => setOpen(true)} />
    <Sheet visible={open} title={title} size="full" onClose={() => setOpen(false)}>
      {open ? <CodeDocument {...props} allLines /> : null}
    </Sheet>
  </>;
}

function CodeDocument({ code, language = "", complete = true, context, textSize,
  compact = false, allLines = false, onOpen,
}: MessageCodeProps & { allLines?: boolean; onOpen?: () => void }) {
  useMobileTheme();
  const copy = useCopy();
  const preference = useChatAppearance((state) => state.textSize);
  const size = textSize ?? preference;
  const styles = chatTextStyles(size);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copiedSource, setCopiedSource] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const summary = useMemo(() => codePreview(code, compact ? 8 : 24), [code, compact]);
  const html = /^(?:html|htm)$/i.test(language) && complete && code.length <= 2 * 1024 * 1024;
  const diagram = language.toLowerCase() === "mermaid" && complete;
  const shown = allLines ? code : summary.text;
  return (
    <View style={{ minWidth: 0, gap: space.xs }}>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.panel }}>
        <Row style={{ paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.separator }}>
          <Body muted style={[styles.metadata, { flexGrow: 1, flexShrink: 1 }]}>{language || copy("Kod", "Code")}</Body>
          <ChatToolbarAction label={copiedSource === code ? copy("Kopyalandı", "Copied") : copy("Kodu kopyala", "Copy code")}
            busy={copying} onPress={() => {
              setError(null);
              setCopying(true);
              void Clipboard.setStringAsync(code).then(() => setCopiedSource(code)).catch(setError).finally(() => setCopying(false));
            }} />
          {html || diagram ? <ChatToolbarAction label={copy("Önizle", "Preview")} onPress={() => setPreview(true)} /> : null}
        </Row>
        <CodeSource code={shown} language={language} textSize={size} />
        {!allLines && (summary.truncated || compact) ? (
          <View style={{ paddingHorizontal: space.sm }}>
            <ChatToolbarAction label={copy("Tüm kodu göster ({p0} satır)", "Show all code ({p0} lines)", { p0: summary.lineCount })} onPress={() => onOpen?.()} />
          </View>
        ) : null}
      </View>
      {!complete ? <Body muted style={styles.metadata}>{copy("Kod devam ediyor…", "Code is still arriving…")}</Body> : null}
      <ErrorText error={error} />
      <Sheet visible={preview} title={html ? copy("HTML önizleme", "HTML preview") : copy("Önizle", "Preview")}
        size="full" onClose={() => setPreview(false)}>
        {preview && html ? <HtmlDocument html={code} name="preview.html" context={context} height={540} /> : null}
        {preview && diagram ? <Suspense fallback={<Loading />}><MessageDiagram source={code} /></Suspense> : null}
      </Sheet>
    </View>
  );
}
