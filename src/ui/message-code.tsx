import { useMobileTheme } from "@/ui/theme";
import { lazy, Suspense, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Body, Button, ErrorText, Loading, Row, Sheet } from "./primitives";
import { HtmlDocument } from "./html-document";
import type { MessageContext } from "./media-policy";
import type { ChatTextSize } from "@/state/chat-appearance-model";
import { useCopy } from "./copy";
import { colors, radii, space } from "./tokens";
import { chatTextStyles } from "./chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { CodeSource } from "./code-source";
import { codePreview, codePreviewKind } from "./message-code-model";
import { ChatToolbarAction } from "./chat-controls";
import { ReaderActions } from "./reader-actions";
import { useSourcePages } from "./use-source-pages";
import { useClipboardFeedback } from "./use-clipboard-feedback";
import { ReaderContext } from "./reader-context";

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
};

/** Transcript shows a bounded preview; full code opens outside the inverted list. */
export function MessageCode({ compact = false, ...props }: MessageCodeProps) {
  useMobileTheme();
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const preference = useChatAppearance(state => state.textSize);
  const pagination = useSourcePages(open ? props.code : "");
  const clipboard = useClipboardFeedback(props.code, open);
  const kind = props.allowPreview === false ? null : codePreviewKind(props.code, props.language ?? "", props.complete);
  const title = props.readerTitle || props.language || copy("Kod", "Code");
  return <>
    <CodeDocument {...props} compact={compact} onOpen={() => { pagination.setPage(0); setPreview(false); setOpen(true); }} />
    <Sheet visible={open} title={title} size="full" scroll={false} onClose={() => { setPreview(false); setOpen(false); }}
      footer={<ReaderActions page={pagination.page} pages={pagination.pages} onPage={pagination.setPage}
        copyLabel={clipboard.copied ? copy("Kopyalandı", "Copied") : props.copyLabel || copy("Kodu kopyala", "Copy code")}
        onCopy={clipboard.copy} busy={clipboard.busy} error={clipboard.error}
        status={props.complete === false ? <Body muted>{copy("Kod devam ediyor…", "Code is still arriving…")}</Body> : null}>
        {kind ? <Button label={copy("Önizle", "Preview")} tone="quiet" onPress={() => setPreview(true)} /> : null}
      </ReaderActions>}>
      {open ? <ScrollView key={pagination.page} contentContainerStyle={{ gap: space.sm }}>
        <ReaderContext context={props.context} />
        <CodeSource code={pagination.text} language={props.language ?? ""} textSize={props.textSize ?? preference} plain={pagination.pages > 1} />
      </ScrollView> : null}
      <CodePreview code={props.code} context={props.context} kind={kind} visible={open && preview} onClose={() => setPreview(false)} />
    </Sheet>
  </>;
}

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
  compact = false, onOpen, copyLabel, allowPreview = true,
}: MessageCodeProps & { onOpen?: () => void }) {
  useMobileTheme();
  const copy = useCopy();
  const preference = useChatAppearance((state) => state.textSize);
  const size = textSize ?? preference;
  const styles = chatTextStyles(size);
  const [preview, setPreview] = useState(false);
  // The prepared payload is always the complete source, never the bounded preview.
  const clipboard = useClipboardFeedback(code);
  const summary = useMemo(() => codePreview(code, compact ? 8 : 24), [code, compact]);
  const kind = allowPreview ? codePreviewKind(code, language, complete) : null;
  const shown = summary.text;
  return (
    <View style={{ minWidth: 0, gap: space.xs }}>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.panel }}>
        <Row style={{ paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.separator }}>
          <Body muted style={[styles.metadata, { flexGrow: 1, flexShrink: 1 }]}>{language || copy("Kod", "Code")}</Body>
          <ChatToolbarAction label={clipboard.copied ? copy("Kopyalandı", "Copied") : copyLabel || copy("Kodu kopyala", "Copy code")}
            busy={clipboard.busy} onPress={clipboard.copy} />
          {kind ? <ChatToolbarAction label={copy("Önizle", "Preview")} onPress={() => setPreview(true)} /> : null}
        </Row>
        <CodeSource code={shown} language={language} textSize={size} />
        {summary.truncated ? (
          <View style={{ paddingHorizontal: space.sm }}>
            <ChatToolbarAction label={copy("Tüm kodu göster ({p0} satır)", "Show all code ({p0} lines)", { p0: summary.lineCount })} onPress={() => onOpen?.()} />
          </View>
        ) : null}
      </View>
      {!complete ? <Body muted style={styles.metadata}>{copy("Kod devam ediyor…", "Code is still arriving…")}</Body> : null}
      <ErrorText error={clipboard.error} />
      <CodePreview code={code} context={context} kind={kind} visible={preview} onClose={() => setPreview(false)} />
    </View>
  );
}
