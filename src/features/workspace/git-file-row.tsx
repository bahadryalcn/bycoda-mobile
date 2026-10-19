import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import Minus from "lucide-react-native/icons/minus";
import Plus from "lucide-react-native/icons/plus";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Body, IconButton, PressableCard } from "@/ui/primitives";
import { colors, semanticColors, space, fontSize } from "@/ui/tokens";
import { IconTile } from "@/ui/icon-tile";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { gitFilePresentation } from "./git-file-presentation";
import type { GitChangedFile } from "./wire";

/** Preview and staging are separate touch targets; the status letter carries the change type. */
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
  useMobileTheme();
  const copy = useCopy();
  const normalized = file.relative.replaceAll("\\", "/");
  const separator = normalized.lastIndexOf("/");
  const name = normalized.slice(separator + 1);
  const directory = separator < 0 ? "" : normalized.slice(0, separator);
  const status = gitFilePresentation(file.status);
  const tone = semanticColors[status.tone];
  const stageLabel = staged ? copy("Stage’den çıkar", "Unstage") : copy("Stage’e al", "Stage");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: 60, paddingEnd: space.xs }}>
      <PressableCard
        disabled={busy}
        label={`${file.relative}. ${copy("Değişiklikleri göster", "View changes")}`}
        onPress={onPreview}
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: space.row,
          padding: space.sm,
          paddingStart: space.lg,
          borderWidth: 0,
          borderTopStartRadius: 0,
          borderTopEndRadius: 0,
          borderBottomStartRadius: 0,
          borderBottomEndRadius: 0,
          backgroundColor: colors.panel,
        }}
      >
        <IconTile color={tone.text}>
          <Body
            selectable={false}
            style={{
              fontSize: fontSize.body,
              lineHeight: 20,
              fontWeight: "700",
              color: tone.text,
            }}
          >
            {status.marker}
          </Body>
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
              style={uiStyles.caption}
            >
              {directory}
            </Body>
          ) : null}
        </View>
        <Body
          selectable={false}
          style={{ fontSize: fontSize.small, lineHeight: 18, fontVariant: ["tabular-nums"] }}
        >
          <Body
            selectable={false}
            style={{ fontSize: fontSize.small, lineHeight: 18, color: colors.success }}
          >{`+${file.additions}`}</Body>
          {"  "}
          <Body
            selectable={false}
            style={{ fontSize: fontSize.small, lineHeight: 18, color: colors.danger }}
          >{`−${file.deletions}`}</Body>
        </Body>
        <ChevronRight size={14} strokeWidth={2.4} color={colors.tertiary} />
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
