import { truncateGraphemes } from "../../../../../src/shared/lib/text/truncate";
import { StyleSheet, View } from "react-native";
import { useMobileTheme } from "@/ui/theme";
import type { Note } from "@/domain/types";
import { useCopy } from "@/ui/copy";
import { Badge, Body, PressableCard } from "@/ui/primitives";
import { radii, space } from "@/ui/tokens";
import { useRelativeTime } from "../shared/record-bits";

const MAX_TAG_BADGES = 2;

/** A note card: title, two-line preview, relative edit time and tag/source badges. */
export function NoteSummaryRow({
  note,
  disabled,
  onPress,
  labelLines,
}: {
  note: Note;
  disabled: boolean;
  onPress: () => void;
  labelLines?: number;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const relative = useRelativeTime();
  const title = note.title.trim() || copy("Başlıksız", "Untitled");
  const excerpt = truncateGraphemes(note.body.replace(/\s+/g, " ").trim(), 600);
  const edited = relative(note.updatedAt);
  const tags = note.tags.slice(0, MAX_TAG_BADGES);
  const extraTags = note.tags.length - tags.length;
  const accessibilityLabel = [title, edited, note.tags.map((tag) => `#${tag}`).join(" "), note.sourceCwd]
    .filter(Boolean)
    .join(". ");
  return (
    <PressableCard
      label={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={{
        gap: space.xs,
        // PressableCard's row defaults set per-axis padding and a bleed margin; override each axis.
        paddingVertical: space.md,
        paddingHorizontal: space.md,
        marginHorizontal: 0,
        marginVertical: space.xs,
        backgroundColor: colors.panel,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        borderRadius: radii.card,
      }}
    >
      <Body selectable={false} numberOfLines={labelLines ?? 1} style={uiStyles.title}>{title}</Body>
      {excerpt ? <Body muted selectable={false} numberOfLines={2}>{excerpt}</Body> : null}
      {edited || tags.length || note.sourceSessionId ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
          {edited ? <Body muted selectable={false} style={uiStyles.caption}>{edited}</Body> : null}
          {tags.map((tag) => <Badge key={tag} label={`#${tag}`} />)}
          {extraTags > 0 ? <Badge label={`+${extraTags}`} /> : null}
          {note.sourceSessionId ? <Badge label={copy("Oturumdan", "From session")} tone="info" /> : null}
        </View>
      ) : null}
    </PressableCard>
  );
}
