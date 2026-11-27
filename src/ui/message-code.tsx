import { useMobileTheme } from "@/ui/theme";
import { lazy, memo, Suspense, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Body, Button, ErrorText, Loading, Row, Sheet } from "./primitives";
import { HtmlDocument } from "./html-document";
import type { MessageContext } from "./media-policy";
import type { ChatTextSize } from "@/state/chat-appearance-model";
import { useCopy } from "./copy";
import { radii, space } from "./tokens";
import { useChatTextStyles } from "./chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { CodeSource } from "./code-source";
import { codeDisclosure, codeDisplayText, codePreviewKind } from "./message-code-model";
import { ChatToolbarAction } from "./chat-controls";
import { ReaderActions } from "./reader-actions";
import { useSourcePages } from "./use-source-pages";
import { useClipboardFeedback } from "./use-clipboard-feedback";
import { ReaderContext } from "./reader-context";
import { useChatDisplay } from "./chat-display";
import { decorativeSvgProps } from "./accessibility";
import FileCode from "lucide-react-native/icons/file-code";
import SquareTerminal from "lucide-react-native/icons/square-terminal";
import WrapText from "lucide-react-native/icons/wrap-text";
import Maximize from "lucide-react-native/icons/maximize-2";
import ChevronDown from "lucide-react-native/icons/chevron-down";

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
  readerTitle?: string;
  copyLabel?: string;
  allowPreview?: boolean;
  /** Command output uses the same bounded reader without executable previews. */
  output?: boolean;
  error?: boolean;
};

/**
 * Transcript shows a bounded preview; full code opens outside the list. Memoized: its props are
 * plain values, so a streaming message re-renders only the block whose source changed.
 */
export const MessageCode = memo(function MessageCode({ compact = false, ...props }: MessageCodeProps) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const preference = useChatAppearance(state => state.textSize);
  const pagination = useSourcePages(open ? props.code : "");
  const clipboard = useClipboardFeedback(props.code, open);
  const kind = props.output || props.allowPreview === false ? null : codePreviewKind(props.code, props.language ?? "", props.complete);
  const title = props.readerTitle || props.language || (props.output ? copy("Çıktı", "Output") : copy("Kod", "Code"));
  return <>
    <CodeDocument {...props} compact={compact} onOpen={() => { pagination.setPage(0); setPreview(false); setOpen(true); }} />
    <Sheet visible={open} title={title} size="full" scroll={false} onClose={() => { setPreview(false); setOpen(false); }}
      footer={<ReaderActions page={pagination.page} pages={pagination.pages} onPage={pagination.setPage}
        copyLabel={clipboard.copied ? copy("Kopyalandı", "Copied") : props.copyLabel || (props.output ? copy("Çıktıyı kopyala", "Copy output") : copy("Kodu kopyala", "Copy code"))}
        onCopy={clipboard.copy} busy={clipboard.busy} error={clipboard.error}
        status={props.error || props.complete === false ? <View style={{ gap: space.xs }}>
          {props.error ? <Body accessibilityRole="alert" style={{ color: colors.danger }}>{copy("Başarısız", "Failed")}</Body> : null}
          {props.complete === false ? <Body muted>{props.output ? copy("Çıktı devam ediyor…", "Output is still arriving…") : copy("Kod devam ediyor…", "Code is still arriving…")}</Body> : null}
        </View> : null}>
        {kind ? <Button label={copy("Önizle", "Preview")} tone="quiet" onPress={() => setPreview(true)} /> : null}
      </ReaderActions>}>
      {open ? <ScrollView key={pagination.page} contentContainerStyle={{ gap: space.sm }}>
        <ReaderContext context={props.context} />
        <CodeSource code={pagination.text} language={props.language ?? ""} textSize={props.textSize ?? preference} plain={pagination.pages > 1} />
      </ScrollView> : null}
      <CodePreview code={props.code} context={props.context} kind={kind} visible={open && preview} onClose={() => setPreview(false)} />
    </Sheet>
  </>;
});

function CodePreview({ code, context, kind, visible, onClose }: {
  code: string; context?: MessageContext; kind: ReturnType<typeof codePreviewKind>; visible: boolean; onClose(): void;
}) {
  const copy = useCopy();
  return <Sheet visible={visible} title={kind === "html" ? copy("HTML önizleme", "HTML preview") : copy("Önizle", "Preview")} size="full" scroll={false} onClose={onClose}>
    {visible ? <ReaderContext context={context} bounded /> : null}
    {visible && kind === "html" ? <HtmlDocument html={code} name="preview.html" context={context} fill /> : null}
    {visible && kind === "diagram" ? <Suspense fallback={<Loading />}><MessageDiagram source={code} fill /></Suspense> : null}
  </Sheet>;
}

function CodeDocument({ code, language = "", complete = true, context, textSize,
  compact = false, onOpen, copyLabel, readerTitle, allowPreview = true, output = false, error = false,
}: MessageCodeProps & { onOpen?: () => void }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const preference = useChatAppearance((state) => state.textSize);
  const wrapPreference = useChatDisplay((state) => state.codeWrap);
  const size = textSize ?? preference;
  const styles = useChatTextStyles(size);
  const [preview, setPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [ownWrap, setOwnWrap] = useState<boolean | null>(null);
  const wrap = ownWrap ?? wrapPreference;
  // The prepared payload is always the complete source, never the bounded preview.
  const clipboard = useClipboardFeedback(code);
  const source = useMemo(() => codeDisplayText(code), [code]);
  const disclosure = useMemo(() => codeDisclosure(source, compact ? 6 : 8), [source, compact]);
  const kind = allowPreview && !output ? codePreviewKind(code, language, complete) : null;
  const inlineOpen = expanded && disclosure.mode === "inline";
  const shown = disclosure.mode === "whole" || inlineOpen ? source : disclosure.text;
  const title = readerTitle || language || (output ? copy("Çıktı", "Output") : copy("Kod", "Code"));
  const Glyph = output ? SquareTerminal : FileCode;
  return (
    <View style={{ minWidth: 0, gap: space.xs }}>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.panel }}>
        <Row style={{ paddingStart: space.row, paddingEnd: space.xxs, gap: space.xxs, borderBottomWidth: 1, borderBottomColor: colors.separator }}>
          <Glyph {...decorativeSvgProps} size={14} color={colors.muted} strokeWidth={1.75} />
          <Body muted mono numberOfLines={1} style={[styles.metadata, { flexGrow: 1, flexShrink: 1, paddingStart: space.xxs }]}>{title}</Body>
          {error ? <Body accessibilityRole="alert" style={[styles.metadata, { color: colors.danger }]}>{copy("Başarısız", "Failed")}</Body> : null}
          <ChatToolbarAction hideLabel tone={wrap ? "accent" : "muted"}
            label={wrap ? copy("Satır kaydırmayı kapat", "Turn off line wrap") : copy("Satırları kaydır", "Wrap lines")}
            onPress={() => setOwnWrap(!wrap)}>
            <WrapText {...decorativeSvgProps} size={16} color={wrap ? colors.accent : colors.muted} />
          </ChatToolbarAction>
          <ChatToolbarAction label={clipboard.copied ? copy("Kopyalandı", "Copied") : copyLabel || (output ? copy("Çıktıyı kopyala", "Copy output") : copy("Kodu kopyala", "Copy code"))}
            busy={clipboard.busy} onPress={clipboard.copy} />
          {kind ? <ChatToolbarAction label={copy("Önizle", "Preview")} onPress={() => setPreview(true)} /> : null}
          {onOpen ? <ChatToolbarAction hideLabel label={copy("Tam ekran", "Full screen")} onPress={onOpen}>
            <Maximize {...decorativeSvgProps} size={15} color={colors.muted} />
          </ChatToolbarAction> : null}
        </Row>
        <CodeSource code={shown} language={language} textSize={size} wrap={wrap} />
        {disclosure.mode !== "whole" ? (
          <View style={{ paddingHorizontal: space.xs, borderTopWidth: 1, borderTopColor: colors.separator, alignItems: "flex-start" }}>
            <ChatToolbarAction
              label={disclosure.mode === "inline"
                ? inlineOpen ? copy("Daralt", "Collapse")
                  : disclosure.hiddenLines ? copy("{p0} satır daha göster", "Show {p0} more lines", { p0: disclosure.hiddenLines })
                    : copy("Tümünü göster", "Show all")
                : output
                  ? copy("Tüm çıktıyı göster ({p0} satır)", "Show all output ({p0} lines)", { p0: disclosure.lineCount })
                  : copy("Tüm kodu göster ({p0} satır)", "Show all code ({p0} lines)", { p0: disclosure.lineCount })}
              onPress={() => (disclosure.mode === "inline" ? setExpanded(!inlineOpen) : onOpen?.())}
            >
              {disclosure.mode === "inline"
                ? <ChevronDown {...decorativeSvgProps} size={14} color={colors.muted} style={inlineOpen ? { transform: [{ rotate: "180deg" }] } : undefined} />
                : null}
            </ChatToolbarAction>
          </View>
        ) : null}
      </View>
      {!complete ? <Body muted style={styles.metadata}>{output ? copy("Çıktı devam ediyor…", "Output is still arriving…") : copy("Kod devam ediyor…", "Code is still arriving…")}</Body> : null}
      <ErrorText error={clipboard.error} />
      <CodePreview code={code} context={context} kind={kind} visible={preview} onClose={() => setPreview(false)} />
    </View>
  );
}
