import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import X from "lucide-react-native/icons/x";
import File from "lucide-react-native/icons/file";
import ImageIcon from "lucide-react-native/icons/image";
import { Body, Button, ErrorText, PressableCard, Sheet } from "@/ui/primitives";
import { ChatAction } from "@/ui/chat-controls";
import { MediaViewer } from "@/ui/media-viewer";
import { colors, radii, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import type { StagedAttachment, TransferState } from "./attachment-model";

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
  useMobileTheme();
  const copy = useCopy();
  const [selected, setSelected] = useState<StagedAttachment | null>(null);
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}
      >
        {files.map((file) => {
          const transfer = transfers[file.id];
          const size =
            transfer?.status === "uploading"
              ? `${Math.round(transfer.progress * 100)}%`
              : `${Math.ceil(file.size / 1024)} KB`;
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
                    <Body numberOfLines={1} ellipsizeMode="middle" style={uiStyles.caption}>
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
      </ScrollView>
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
              {selected.name} · {Math.ceil(selected.size / 1024)} KB
            </Body>
          ) : null}
        </Sheet>
      )}
    </>
  );
}
