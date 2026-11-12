import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import { Image } from "expo-image";
import { ScrollView, View } from "react-native";
import X from "lucide-react-native/icons/x";
import File from "lucide-react-native/icons/file";
import ImageIcon from "lucide-react-native/icons/image";
import { Body, Button, ErrorText, PressableCard, Sheet } from "@/ui/primitives";
import { ChatAction } from "@/ui/chat-controls";
import { MediaViewer } from "@/ui/media-viewer";
import { radii, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { formatAttachmentSize, thumbnailSplit } from "./attachment-presentation";
import type { StagedAttachment, TransferState } from "./attachment-model";

const THUMB = 64;

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
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<StagedAttachment | null>(null);
  const images = files.filter((file) => file.kind === "image" && !!file.uri);
  const others = files.filter((file) => !images.includes(file));
  const thumbs = thumbnailSplit(images, expanded);
  return (
    <>
      {images.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingTop: space.xs }}>
          {thumbs.shown.map((file) => (
            <View key={file.id} style={{ width: THUMB, gap: space.xs }}>
              <View style={{ width: THUMB, height: THUMB }}>
                <PressableCard
                  role="imagebutton"
                  label={copy("Eki aç: {p0}", "Open attachment: {p0}", { p0: file.name })}
                  onPress={() => setSelected(file)}
                  style={{ width: THUMB, height: THUMB, paddingVertical: 0, paddingHorizontal: 0, marginHorizontal: 0, minHeight: 0, borderRadius: radii.control, overflow: "hidden", backgroundColor: colors.raised }}
                >
                  <Image source={{ uri: file.uri }} contentFit="cover" accessibilityIgnoresInvertColors style={{ width: THUMB, height: THUMB }} />
                  {transfers[file.id]?.status === "uploading" ? (
                    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 2, backgroundColor: colors.scrim, alignItems: "center" }}>
                      <Body style={uiStyles.caption}>{Math.round(transfers[file.id]!.progress * 100)}%</Body>
                    </View>
                  ) : null}
                </PressableCard>
                <View style={{ position: "absolute", top: -space.xs, right: -space.xs }}>
                  <ChatAction
                    label={copy("Eki kaldır: {p0}", "Remove attachment: {p0}", { p0: file.name })}
                    disabled={disabled}
                    onPress={() => { if (selected?.id === file.id) setSelected(null); onRemove(file); }}
                  >
                    <X size={15} color={colors.muted} />
                  </ChatAction>
                </View>
              </View>
              {transfers[file.id]?.status === "error" ? (
                <Button label={copy("Yeniden yükle", "Retry upload")} density="compact" disabled={disabled} onPress={() => onRetry(file)} />
              ) : null}
            </View>
          ))}
          {thumbs.hidden ? (
            <PressableCard
              label={copy("{p0} görsel daha göster", "Show {p0} more images", { p0: thumbs.hidden })}
              onPress={() => setExpanded(true)}
              style={{ width: THUMB, height: THUMB, alignItems: "center", justifyContent: "center", backgroundColor: colors.raised, borderWidth: 0, borderRadius: radii.control }}
            >
              <Body>{`+${thumbs.hidden}`}</Body>
            </PressableCard>
          ) : null}
        </View>
      ) : null}
      {others.length ? <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}
      >
        {others.map((file) => {
          const transfer = transfers[file.id];
          const size =
            transfer?.status === "uploading"
              ? `${Math.round(transfer.progress * 100)}%`
              : formatAttachmentSize(file.size, locale);
          return (
            <View key={file.id} style={{ maxWidth: 240, minWidth: 150, gap: space.xs }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.raised,
                  borderRadius: radii.control,
                  paddingEnd: space.xs,
                }}
              >
                <PressableCard
                  label={copy("Eki aç: {p0}", "Open attachment: {p0}", { p0: file.name })}
                  onPress={() => setSelected(file)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 48,
                    padding: space.sm,
                    backgroundColor: "transparent",
                    borderWidth: 0,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.sm,
                  }}
                >
                  {file.kind === "image" ? (
                    <ImageIcon size={16} color={colors.muted} />
                  ) : (
                    <File size={16} color={colors.muted} />
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body numberOfLines={2} ellipsizeMode="middle" style={uiStyles.caption}>
                      {file.name}
                    </Body>
                    <Body muted style={uiStyles.caption}>
                      {size}
                    </Body>
                  </View>
                </PressableCard>
                <ChatAction
                  label={copy("Eki kaldır: {p0}", "Remove attachment: {p0}", { p0: file.name })}
                  disabled={disabled}
                  onPress={() => {
                    if (selected?.id === file.id) setSelected(null);
                    onRemove(file);
                  }}
                >
                  <X size={15} color={colors.muted} />
                </ChatAction>
              </View>
              {transfer?.status === "error" ? (
                <>
                  <ErrorText error={transfer.error} />
                  <Button
                    label={copy("Yeniden yükle", "Retry upload")}
                    disabled={disabled}
                    onPress={() => onRetry(file)}
                  />
                </>
              ) : null}
            </View>
          );
        })}
      </ScrollView> : null}
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
