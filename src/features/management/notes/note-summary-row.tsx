import { truncateGraphemes } from "../../../../../src/shared/lib/text/truncate";
import { View } from "react-native";
import { useMobileTheme } from "@/ui/theme";
import type { Note } from "@/domain/types";
import { useCopy } from "@/ui/copy";
import { Badge, Body, PressableCard } from "@/ui/primitives";
import { metrics, space } from "@/ui/tokens";
import { useRelativeTime } from "../shared/record-bits";

const MAX_TAG_BADGES = 2;

/** A note card: title, two-line preview, relative edit time and tag/source badges. */
export function NoteSummaryRow({
  note,
  disabled,
  onPress,
  labelLines,
  projectName,
}: {
  note: Note;
  disabled: boolean;
  onPress: () => void;
  labelLines?: number;
  /** Project the note belongs to; shown when listing across projects. */
  projectName?: string;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const relative = useRelativeTime();
  const title = note.title.trim() || copy("Başlıksız", "Untitled");
  const excerpt = truncateGraphemes(note.body.replace(/\s+/g, " ").trim(), 600);
  const edited = relative(note.updatedAt);
  const tags = note.tags.slice(0, MAX_TAG_BADGES);
  const extraTags = note.tags.length - tags.length;
  const accessibilityLabel = [title, edited, note.tags.map((tag) => `#${tag}`).join(" "), projectName ?? note.sourceCwd]
    .filter(Boolean)
    .join(". ");
  return (
    <PressableCard
      label={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={{
        gap: space.sm,
        // PressableCard's row defaults set per-axis padding and a bleed margin; override each axis.
        paddingVertical: space.md,
        paddingHorizontal: space.xs,
        minHeight: metrics.touchTarget,
        marginHorizontal: 0,
        marginVertical: 0,
        borderBottomWidth: metrics.groupGuide,
        borderBottomColor: colors.separator,
      }}
    >
      <Body selectable={false} numberOfLines={labelLines ?? 2} style={[uiStyles.title, { fontWeight: "600" }]}>{title}</Body>
      {excerpt ? <Body muted selectable={false} numberOfLines={2}>{excerpt}</Body> : null}
      {edited || projectName || tags.length || note.sourceSessionId ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
          {edited || projectName ? <Body muted selectable={false} numberOfLines={1} style={[uiStyles.caption, { flexShrink: 1 }]}>{[projectName, edited].filter(Boolean).join(" · ")}</Body> : null}
          {tags.map((tag) => <Badge key={tag} label={`#${tag}`} />)}
          {extraTags > 0 ? <Badge label={`+${extraTags}`} /> : null}
          {note.sourceSessionId ? <Badge label={copy("Oturumdan", "From session")} tone="info" /> : null}
        </View>
      ) : null}
    </PressableCard>
  );
}
