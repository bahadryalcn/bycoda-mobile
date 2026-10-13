import { View } from "react-native";
import FileCode from "lucide-react-native/icons/file-code";
import Plus from "lucide-react-native/icons/plus";
import Minus from "lucide-react-native/icons/minus";
import FilePlus from "lucide-react-native/icons/file-plus";
import FileMinus from "lucide-react-native/icons/file-minus";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Body, IconButton, PressableCard } from "@/ui/primitives";
import { colors, semanticColors, space, fontSize, radii } from "@/ui/tokens";
import { IconTile } from "@/ui/icon-tile";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { gitFilePresentation } from "./git-file-presentation";
import type { GitChangedFile } from "./wire";

/** Preview and staging are separate touch targets; long paths never size the row. */
export function GitFileRow({
  file,
  staged,
  busy,
  onPreview,
  onStage,
}: {
  file: GitChangedFile;
  staged: boolean;
  busy: boolean;
  onPreview: () => void;
  onStage: () => void;
}) {
  const copy = useCopy();
  const normalized = file.relative.replaceAll("\\", "/");
  const separator = normalized.lastIndexOf("/");
  const name = normalized.slice(separator + 1);
  const directory = separator < 0 ? "" : normalized.slice(0, separator);
  const status = gitFilePresentation(file.status);
  const tone = semanticColors[status.tone];
  const stageLabel = staged ? copy("Stage’den çıkar", "Unstage") : copy("Stage’e al", "Stage");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: 72,
        gap: space.xs,
        paddingHorizontal: space.sm,
        backgroundColor: colors.panel,
        borderRadius: radii.control,
        borderWidth: 1,
        borderColor: colors.separator,
      }}
    >
      <PressableCard
        disabled={busy}
        label={`${file.relative}. ${copy("Değişiklikleri göster", "View changes")}`}
        onPress={onPreview}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 72,
          flexDirection: "row",
          alignItems: "center",
          gap: space.row,
          paddingVertical: 7,
          paddingHorizontal: 0,
          borderWidth: 0,
        }}
      >
        <IconTile color={tone.border}>
          {status.kind === "deleted" ? (
            <FileMinus size={20} color={tone.text} />
          ) : status.kind === "added" ? (
            <FilePlus size={20} color={tone.text} />
          ) : (
            <FileCode size={20} color={tone.text} />
          )}
        </IconTile>
        <View style={[uiStyles.grow, { gap: 1 }]}>
          <Body
            selectable={false}
            numberOfLines={1}
            ellipsizeMode="middle"
            style={{ fontSize: fontSize.control, lineHeight: 20, fontWeight: "600" }}
          >
            {name}
          </Body>
          {directory ? (
            <Body
              selectable={false}
              muted
              numberOfLines={1}
              ellipsizeMode="middle"
              style={{ fontSize: fontSize.caption, lineHeight: 18 }}
            >
              {directory}
            </Body>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 1, flexShrink: 0 }}>
          <Body
            selectable={false}
            style={{
              fontSize: fontSize.micro,
              lineHeight: 15,
              color: tone.text,
              fontWeight: "600",
              backgroundColor: tone.surface,
              paddingHorizontal: space.sm,
              borderRadius: radii.badge,
            }}
          >
            {status.marker}
          </Body>
          <Body
            selectable={false}
            style={{ fontSize: fontSize.micro, lineHeight: 15, fontVariant: ["tabular-nums"] }}
          >
            <Body
              selectable={false}
              style={{ fontSize: fontSize.micro, lineHeight: 15, color: colors.success }}
            >{`+${file.additions}`}</Body>{" "}
            <Body
              selectable={false}
              style={{ fontSize: fontSize.micro, lineHeight: 15, color: colors.danger }}
            >{`−${file.deletions}`}</Body>
          </Body>
        </View>
        <ChevronRight size={14} color={colors.subtle} />
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
