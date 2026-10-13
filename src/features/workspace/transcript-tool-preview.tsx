import { useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Body, Button, CodePanel, CodeText, ErrorText, Row } from "@/ui/primitives";
import { ScopedFilePreview } from "@/ui/message-text";
import type { MessageContext } from "@/ui/media-policy";
import { useCopy } from "@/ui/copy";
import { colors, space } from "@/ui/tokens";
import type { Block } from "./wire";
import File from "lucide-react-native/icons/file";
import { ChatSummary } from "@/ui/chat-controls";
import { Sheet } from "@/ui/primitives";

type PreviewProps = {
  preview: NonNullable<Block["tool"]>["preview"];
  status?: string;
  context?: MessageContext;
};

export function TranscriptToolPreview(props: PreviewProps) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const preview = props.preview;
  if (!preview) return null;
  const name = preview.path || preview.fileName || preview.title || copy("Değişiklik", "Change");
  return (
    <>
      <ChatSummary
        label={name}
        detail={[
          copy("Değişikliği aç", "Open change"),
          preview.additions ? `+${preview.additions}` : "",
          preview.deletions ? `−${preview.deletions}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}
        icon={<File size={16} color={colors.muted} />}
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} title={name} size="full" onClose={() => setOpen(false)}>
        {open ? <PreviewContent {...props} /> : null}
      </Sheet>
    </>
  );
}

function PreviewContent({ preview, status, context }: PreviewProps) {
  const copy = useCopy();
  const [file, setFile] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!preview) return null;
  const rejected = ["denied", "rejected", "failed", "error"].includes(status ?? "");
  return (
    <View style={{ gap: space.sm }}>
      <Row>
        <Body style={{ flex: 1 }}>
          {preview.path || preview.fileName || preview.title || copy("Değişiklik", "Change")}
        </Body>
        <Body muted>
          {preview.additions ? `+${preview.additions} ` : ""}
          {preview.deletions ? `−${preview.deletions}` : ""}
        </Body>
      </Row>
      {preview.kind === "write" ? (
        <Body muted>
          {rejected
            ? copy("Uygulanmadı", "Not applied")
            : ["completed", "done", "success"].includes(status ?? "")
              ? copy("Uygulandı", "Applied")
              : copy("Önerilen değişiklik", "Proposed change")}
        </Body>
      ) : null}
      {preview.contentOnly ? (
        <Body muted>
          {copy(
            "Önceki sürüm kaydedilmemiş; yeni içerik gösteriliyor.",
            "The previous version was not recorded; showing new content.",
          )}
        </Body>
      ) : null}
      <CodePanel>
        <View>
          {preview.lines?.slice(0, 300).map((line, index) => (
            <CodeText
              key={index}
              style={{
                color:
                  line.kind === "add"
                    ? colors.success
                    : line.kind === "del"
                      ? colors.danger
                      : colors.text,
              }}
            >{`${line.number ?? " "} ${line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "} ${line.text}`}</CodeText>
          ))}
          {preview.output ? <CodeText>{preview.output}</CodeText> : null}
        </View>
      </CodePanel>
      {(preview.lines?.length ?? 0) > 300 ? (
        <Body muted>{copy("İlk 300 satır gösteriliyor.", "Showing the first 300 lines.")}</Body>
      ) : null}
      {preview.path ? (
        <Row>
          <Button
            tone="quiet"
            density="compact"
            label={copy("Yolu kopyala", "Copy path")}
            onPress={() => {
              void Clipboard.setStringAsync(preview.path!).catch(setError);
            }}
          />
          {context ? (
            <Button
              tone="quiet"
              density="compact"
              label={copy("Dosyayı aç", "Open file")}
              onPress={() => setFile(true)}
            />
          ) : null}
        </Row>
      ) : null}
      <ErrorText error={error} />
      {file && context && preview.path ? (
        <ScopedFilePreview
          path={`${preview.path}${preview.startLine ? `:${preview.startLine}` : ""}`}
          context={context}
          onClose={() => setFile(false)}
        />
      ) : null}
    </View>
  );
}
