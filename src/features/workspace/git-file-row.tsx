import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import Minus from "lucide-react-native/icons/minus";
import Plus from "lucide-react-native/icons/plus";
import { Badge, Body, IconButton, PressableCard } from "@/ui/primitives";
import { space, fontSize, lineHeight } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { gitFilePresentation } from "./git-file-presentation";
import type { GitChangedFile } from "./wire";

/** Preview and staging are separate touch targets; a tone badge names the change type. */
export function GitFileRow({
  file,
  staged,
  busy,
  onPreview,
  onStage,
  onLongPress,
}: {
  file: GitChangedFile;
  staged: boolean;
  busy: boolean;
  onPreview: () => void;
  onStage: () => void;
  onLongPress?: () => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const numbers = new Intl.NumberFormat(useLocale());
  const normalized = file.relative.replaceAll("\\", "/");
  const separator = normalized.lastIndexOf("/");
  const name = normalized.slice(separator + 1);
  const directory = separator < 0 ? "" : normalized.slice(0, separator);
  const status = gitFilePresentation(file.status);
  const stageLabel = staged ? copy("Stage’den çıkar", "Unstage") : copy("Stage’e al", "Stage");
  const changeLabel =
    status.kind === "added"
      ? copy("Eklendi", "Added")
      : status.kind === "deleted"
        ? copy("Silindi", "Deleted")
        : status.kind === "renamed"
          ? copy("Yeniden adlandırıldı", "Renamed")
          : copy("Değiştirildi", "Modified");
  const stageState = staged ? copy("Stage’de", "Staged") : copy("Stage’de değil", "Unstaged");
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", minHeight: 52, paddingEnd: space.xs }}
    >
      <PressableCard
        disabled={busy}
        label={`${file.relative}. ${changeLabel}. ${stageState}. ${copy("Değişiklikleri göster", "View changes")}`}
        onPress={onPreview}
        onLongPress={onLongPress}
        optionsLabel={copy("Dosya işlemleri", "File actions")}
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: space.row,
          paddingVertical: space.sm,
        }}
      >
        <View style={[uiStyles.grow, { gap: space.xxs }]}>
          <Body
            selectable={false}
            numberOfLines={2}
            ellipsizeMode="middle"
            style={{ fontSize: fontSize.control, lineHeight: lineHeight.control, fontWeight: "600" }}
          >
            {name}
          </Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
            <Badge label={changeLabel} tone={status.tone} />
            {directory ? (
              <Body
                selectable={false}
                muted
                numberOfLines={1}
                ellipsizeMode="middle"
                style={[uiStyles.caption, { flexShrink: 1 }]}
              >
                {directory}
              </Body>
            ) : null}
            <Body
              selectable={false}
              style={{ fontSize: fontSize.small, lineHeight: lineHeight.small, fontVariant: ["tabular-nums"] }}
            >
              <Body
                selectable={false}
                style={{ fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.success }}
              >{`+${numbers.format(file.additions)}`}</Body>
              {"  "}
              <Body
                selectable={false}
                style={{ fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.danger }}
              >{`−${numbers.format(file.deletions)}`}</Body>
            </Body>
          </View>
        </View>
      </PressableCard>
      <IconButton label={`${stageLabel}: ${file.relative}`} onPress={onStage} disabled={busy}>
        {staged ? (
          <Minus size={18} color={colors.muted} />
        ) : (
          <Plus size={18} color={colors.accent} />
        )}
      </IconButton>
    </View>
  );
}
