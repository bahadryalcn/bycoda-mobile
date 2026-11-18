import { useMobileTheme } from "@/ui/theme";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Body, Button, CodePanel, CodeText, ErrorText, Row, Sheet } from "@/ui/primitives";
import { ScopedFilePreview } from "@/ui/message-text";
import { mediaQueryKey, type MessageContext } from "@/ui/media-policy";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { useSingleFlight } from "@/state/actions";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import { SOURCE_PAGE_SIZE, useSourcePages } from "@/ui/use-source-pages";
import { ReaderActions } from "@/ui/reader-actions";
import { useChatTextStyles } from "@/ui/chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import type { Block } from "./wire";
import File from "lucide-react-native/icons/file";
import { ChatSummary } from "@/ui/chat-controls";
import { toolPreviewPage, toolPreviewRows, toolPreviewSource } from "./tool-preview-source";

type PreviewProps = { preview: NonNullable<Block["tool"]>["preview"]; status?: string; context?: MessageContext };
type RecordedPreview = PreviewProps & { preview: NonNullable<PreviewProps["preview"]> };

function writeState(preview: RecordedPreview["preview"], status: string | undefined, copy: (tr: string, en: string) => string) {
  if (preview.kind !== "write") return undefined;
  return ["denied", "rejected", "failed", "error"].includes(status ?? "")
    ? copy("Uygulanmadı", "Not applied")
    : ["completed", "done", "success"].includes(status ?? "")
      ? copy("Uygulandı", "Applied")
      : copy("Önerilen değişiklik", "Proposed change");
}

export function TranscriptToolPreview(props: PreviewProps) {
  if (!props.preview) return null;
  const identity = JSON.stringify(mediaQueryKey(props.context, ["tool-preview-reader", props.preview.kind, props.preview.path, props.preview.fileName]));
  return <PreviewOwner key={identity} {...props} preview={props.preview} />;
}

function PreviewOwner(props: RecordedPreview) {
  const { colors } = useMobileTheme();
  const copy = useCopy(), [open, setOpen] = useState(false);
  const { preview } = props;
  const name = preview.path || preview.fileName || preview.title || copy("Değişiklik", "Change");
  return <>
    <ChatSummary label={name} detail={[preview.kind === "write" ? copy("Değişikliği aç", "Open change") : copy("Çıktıyı aç", "Open output"), preview.additions ? `+${preview.additions}` : "", preview.deletions ? `−${preview.deletions}` : ""].filter(Boolean).join(" · ")}
      status={writeState(preview, props.status, copy)}
      color={["denied", "rejected", "failed", "error"].includes(props.status ?? "") ? colors.danger : colors.muted}
      icon={<File size={16} color={colors.muted} />} onPress={() => setOpen(true)} />
    {open ? <PreviewReader {...props} name={name} onClose={() => setOpen(false)} /> : null}
  </>;
}

function PreviewReader({ preview, status, context, name, onClose }: RecordedPreview & { name: string; onClose(): void }) {
  const { colors } = useMobileTheme();
  const copy = useCopy(), size = useChatAppearance(state => state.textSize), text = useChatTextStyles(size);
  const [file, setFile] = useState<{ path: string; context: MessageContext } | null>(null);
  const source = useMemo(() => toolPreviewSource(preview), [preview.lines, preview.output]);
  const pagination = useSourcePages(source.text);
  const rows = useMemo(() => toolPreviewRows(toolPreviewPage(source, pagination.page * SOURCE_PAGE_SIZE, (pagination.page + 1) * SOURCE_PAGE_SIZE)), [source, pagination.page]);
  const flight = useSingleFlight<void>();
  const clipboard = useClipboardFeedback(source.text, !!source.text, flight);
  const pathCopy = useClipboardFeedback(preview.path ?? "", !!preview.path, flight);
  const busy = clipboard.busy || pathCopy.busy;
  const state = writeState(preview, status, copy);
  return <Sheet visible title={name} size="full" scroll={false} onClose={onClose} footer={<>
    <ReaderActions page={pagination.page} pages={pagination.pages} onPage={pagination.setPage}
      copyLabel={clipboard.copied ? copy("Kopyalandı", "Copied") : copy("Kopyala", "Copy")}
      onCopy={() => { if (!busy) clipboard.copy(); }} busy={clipboard.busy} disabled={pathCopy.busy || !source.text} error={clipboard.error}>
      {preview.path ? <Button tone="quiet" label={copy("Yolu kopyala", "Copy path")} busy={pathCopy.busy} disabled={clipboard.busy} onPress={pathCopy.copy} /> : null}
      {preview.path && context ? <Button tone="quiet" label={copy("Dosyayı aç", "Open file")} onPress={() => setFile({ path: `${preview.path}${preview.startLine ? `:${preview.startLine}` : ""}`, context })} /> : null}
    </ReaderActions>
    {pathCopy.copied ? <Body muted>{copy("Yolu kopyala", "Copy path")} · {copy("Kopyalandı", "Copied")}</Body> : null}
    <ErrorText error={pathCopy.error} />
    {state || preview.additions || preview.deletions ? <Row>{state ? <Body muted>{state}</Body> : null}{preview.additions ? <Body muted>+{preview.additions}</Body> : null}{preview.deletions ? <Body muted>−{preview.deletions}</Body> : null}</Row> : null}
  </>}>
    <ScrollView key={pagination.page} contentContainerStyle={{ padding: space.sm, gap: space.sm }}>
    {preview.contentOnly ? <Body muted>{copy("Önceki sürüm kaydedilmemiş; yeni içerik gösteriliyor.", "The previous version was not recorded; showing new content.")}</Body> : null}
      {source.text ? <CodePanel>{rows.map((row, index) => <View key={index} style={{ backgroundColor: row.kind === "add" ? colors.diffAddBg : row.kind === "del" ? colors.diffDelBg : undefined, paddingHorizontal: space.sm }}><CodeText style={[text.code, { color: row.kind === "add" ? colors.diffAddText : row.kind === "del" ? colors.diffDelText : colors.text }]}>{row.text || " "}</CodeText></View>)}</CodePanel> : <Body muted>{copy("Henüz içerik yok", "No content yet")}</Body>}
    </ScrollView>
    {file ? <ScopedFilePreview path={file.path} context={file.context} onClose={() => setFile(null)} /> : null}
  </Sheet>;
}
