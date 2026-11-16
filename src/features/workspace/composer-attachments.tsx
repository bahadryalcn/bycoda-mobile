import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import { Image } from "expo-image";
import { View } from "react-native";
import X from "lucide-react-native/icons/x";
import File from "lucide-react-native/icons/file";
import { Attachment } from "panelui-native/components/attachment";
import { Chip } from "panelui-native/components/chip";
import { Body, Button, ErrorText, Sheet } from "@/ui/primitives";
import { MediaViewer } from "@/ui/media-viewer";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { formatAttachmentSize, thumbnailSplit } from "./attachment-presentation";
import type { StagedAttachment, TransferState } from "./attachment-model";

const THUMB = 40;
const rowStyle = { maxWidth: 240, minWidth: 150 } as const;

export function ComposerAttachments({
  files,
  transfers,
  onRemove,
  onRetry,
  disabled,
}: {
  files: StagedAttachment[];
  transfers: Record<string, TransferState>;
  onRemove: (file: StagedAttachment) => void;
  onRetry: (file: StagedAttachment) => void;
  disabled: boolean;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<StagedAttachment | null>(null);
  const images = files.filter((file) => file.kind === "image" && !!file.uri);
  const thumbs = thumbnailSplit(images, expanded);
  const rows = [...thumbs.shown, ...files.filter((file) => !images.includes(file))];
  return (
    <>
      {rows.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingVertical: space.xs }}>
          {rows.map((file) => {
            const transfer = transfers[file.id];
            const uploading = transfer?.status === "uploading";
            const description = uploading
              ? `${Math.round(transfer.progress * 100)}%`
              : formatAttachmentSize(file.size, locale);
            return (
              <View key={file.id} style={[rowStyle, { gap: space.xs }]}>
                <Attachment
                  size="sm"
                  className="min-h-12"
                  state={uploading ? "uploading" : transfer?.status === "error" ? "error" : "done"}
                  progress={uploading ? transfer.progress : undefined}
                  accessibilityLabel={copy("Eki aç: {p0}", "Open attachment: {p0}", { p0: file.name })}
                  onPress={() => setSelected(file)}
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
                    <Attachment.Description>{description}</Attachment.Description>
                  </Attachment.Content>
                  <Attachment.Actions>
                    <Attachment.Action
                      accessibilityLabel={copy("Eki kaldır: {p0}", "Remove attachment: {p0}", { p0: file.name })}
                      disabled={disabled}
                      onPress={() => {
                        if (selected?.id === file.id) setSelected(null);
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
              className="h-12"
              accessibilityLabel={copy("{p0} görsel daha göster", "Show {p0} more images", {
                p0: thumbs.hidden,
              })}
              onPress={() => setExpanded(true)}
            >{`+${thumbs.hidden}`}</Chip>
          ) : null}
        </View>
      ) : null}
      {selected?.kind === "image" ? (
        <MediaViewer
          uri={selected.uri}
          name={selected.name}
          visible
          onClose={() => setSelected(null)}
        />
      ) : (
        <Sheet
          visible={!!selected}
          title={selected?.name ?? ""}
          size="compact"
          onClose={() => setSelected(null)}
        >
          {selected ? (
            <Body>
              {selected.name} · {formatAttachmentSize(selected.size, locale)}
            </Body>
          ) : null}
        </Sheet>
      )}
    </>
  );
}
