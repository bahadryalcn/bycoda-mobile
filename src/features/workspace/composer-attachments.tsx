import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import { Image } from "expo-image";
import { File as LocalFile } from "expo-file-system";
import { View } from "react-native";
import X from "lucide-react-native/icons/x";
import File from "lucide-react-native/icons/file";
import { Attachment } from "panelui-native/components/attachment";
import { Chip } from "panelui-native/components/chip";
import { Body, Button, ErrorText, Sheet } from "@/ui/primitives";
import { MediaViewer } from "@/ui/media-viewer";
import { DocumentContent } from "@/ui/document-content";
import { metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { formatAttachmentSize, thumbnailSplit } from "./attachment-presentation";
import { ATTACHMENT_LIMIT, type StagedAttachment, type TransferState } from "./attachment-model";
import { isScopedStagedFile } from "./attachment-files";

const THUMB = 40;

export function ComposerAttachments({
  files,
  scope,
  custody = "composer",
  transfers,
  onRemove,
  onRetry,
  disabled,
}: {
  files: StagedAttachment[];
  scope: string;
  custody?: "composer" | "question";
  transfers: Record<string, TransferState>;
  onRemove: (file: StagedAttachment) => void;
  onRetry: (file: StagedAttachment) => void;
  disabled: boolean;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [opening, setOpening] = useState<{ file: StagedAttachment; scope: string; custody: typeof custody; available: boolean } | null>(null);
  const selected = opening?.scope === scope && opening.custody === custody
    ? files.find(file => file.id === opening.file.id && file.uri === opening.file.uri)
    : undefined;
  if (opening && !selected) setOpening(null);
  const close = () => setOpening(null);
  const open = (file: StagedAttachment) => {
    let available = false;
    try {
      if (/^[a-z0-9_-]+$/i.test(file.id) && isScopedStagedFile(file, scope, custody)) {
        const local = new LocalFile(file.uri);
        available = local.exists && local.size === file.size && local.size <= ATTACHMENT_LIMIT;
      }
    } catch {
      // A saved attachment can outlive its local file.
    }
    setOpening({ file, scope, custody, available });
  };
  const images = files.filter((file) => file.kind === "image" && !!file.uri);
  const thumbs = thumbnailSplit(images, expanded);
  const rows = [...thumbs.shown, ...files.filter((file) => !images.includes(file))];
  return (
    <>
      {rows.length ? (
        <View style={{ flexDirection: "column", gap: space.sm, paddingVertical: space.xs }}>
          {rows.map((file) => {
            const transfer = transfers[file.id];
            const uploading = transfer?.status === "uploading";
            const description = uploading
              ? `${Math.round(transfer.progress * 100)}%`
              : formatAttachmentSize(file.size, locale);
            return (
              <View key={file.id} style={{ gap: space.xs }}>
                <Attachment
                  size="sm"
                  className="min-h-12"
                  state={uploading ? "uploading" : transfer?.status === "error" ? "error" : "done"}
                  progress={uploading ? transfer.progress : undefined}
                  accessibilityLabel={copy("Eki aç: {p0}", "Open attachment: {p0}", { p0: file.name })}
                  onPress={() => open(file)}
                >
                  <Attachment.Media variant={images.includes(file) ? "image" : "icon"}>
                    {images.includes(file) ? (
                      <Image
                        source={{ uri: file.uri }}
                        contentFit="cover"
                        accessibilityIgnoresInvertColors
                        style={{ width: THUMB, height: THUMB }}
                      />
                    ) : (
                      <File size={16} color={colors.muted} />
                    )}
                  </Attachment.Media>
                  <Attachment.Content>
                    <Attachment.Title numberOfLines={2} ellipsizeMode="middle">
                      {file.name}
                    </Attachment.Title>
                    <Attachment.Description numberOfLines={1}>{description}</Attachment.Description>
                  </Attachment.Content>
                  <Attachment.Actions>
                    <Attachment.Action
                      accessibilityLabel={copy("Eki kaldır: {p0}", "Remove attachment: {p0}", { p0: file.name })}
                      hitSlop={0}
                      style={{ width: metrics.touchTarget, height: metrics.touchTarget }}
                      disabled={disabled}
                      onPress={() => {
                        if (selected?.id === file.id) close();
                        onRemove(file);
                      }}
                    >
                      <X size={15} color={colors.muted} />
                    </Attachment.Action>
                  </Attachment.Actions>
                </Attachment>
                {transfer?.status === "error" ? (
                  <>
                    <ErrorText error={transfer.error} />
                    <Button
                      label={copy("Yeniden yükle", "Retry upload")}
                      density="compact"
                      reserveTouchTarget
                      disabled={disabled}
                      onPress={() => onRetry(file)}
                    />
                  </>
                ) : null}
              </View>
            );
          })}
          {thumbs.hidden ? (
            <Chip
              className="h-12 self-start"
              accessibilityLabel={copy("{p0} görsel daha göster", "Show {p0} more images", {
                p0: thumbs.hidden,
              })}
              onPress={() => setExpanded(true)}
            >{`+${thumbs.hidden}`}</Chip>
          ) : null}
        </View>
      ) : null}
      {selected?.kind === "image" && opening?.available ? (
        <MediaViewer
          uri={selected.uri}
          name={selected.name}
          visible
          onClose={close}
        />
      ) : selected ? (
        <Sheet
          visible
          title={selected.name}
          size={opening?.available ? "form" : "compact"}
          onClose={close}
        >
          {opening?.available
            ? <DocumentContent name={selected.name} mimeType={selected.mimeType} uri={selected.uri} />
            : <Body muted>{copy("Önizleme açılamadı.", "Preview could not be opened.")}</Body>}
        </Sheet>
      ) : null}
    </>
  );
}
