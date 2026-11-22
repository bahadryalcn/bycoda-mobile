import { truncateGraphemes } from "../../../../../src/shared/lib/text/truncate";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useMobileTheme } from "@/ui/theme";
import type { Note } from "@/domain/types";
import { useCopy } from "@/ui/copy";
import { messageSummary } from "@/ui/message-summary";
import { Badge, Body, PressableCard } from "@/ui/primitives";
import { metrics, space } from "@/ui/tokens";
import { useRelativeTime } from "../shared/record-bits";
import { NOTE_TITLE_LIMIT } from "./note-tags";

const MAX_TAG_BADGES = 2;

function noteExcerpt(body: string, title: string): string {
  const summary = messageSummary(body, {
    hideInternalMetadata: false,
    omitLeadingHeadingMatching: title,
  });
  const prefix = title.replace(/\s+/g, " ");
  if (summary === prefix) return "";
  // Older clients derive some titles from the body and cap them mid-word.
  if (Array.from(title).length === NOTE_TITLE_LIMIT && summary.startsWith(prefix)) {
    const rest = summary.slice(prefix.length);
    return /[\p{L}\p{M}\p{N}]$/u.test(prefix)
      ? rest.replace(/^[\p{L}\p{M}\p{N}]+/u, "").trimStart()
      : rest.trimStart();
  }
  return summary;
}

/** A note card: title, two-line preview, relative edit time and tag/source badges. */
export function NoteSummaryRow({
  note,
  disabled,
  onPress,
  labelLines,
  projectName,
  trailing,
}: {
  note: Note;
  disabled: boolean;
  onPress: () => void;
  labelLines?: number;
  /** Project the note belongs to; shown when listing across projects. */
  projectName?: string;
  /** Separate focus target for secondary actions. */
  trailing?: ReactNode;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const relative = useRelativeTime();
  const savedTitle = note.title.trim();
  const title = savedTitle || copy("Başlıksız", "Untitled");
  const excerpt = truncateGraphemes(noteExcerpt(note.body, savedTitle), 600);
  const edited = relative(note.updatedAt);
  const tags = note.tags.slice(0, MAX_TAG_BADGES);
  const extraTags = note.tags.length - tags.length;
  const accessibilityLabel = [title, edited, note.tags.map((tag) => `#${tag}`).join(" "), projectName ?? note.sourceCwd]
    .filter(Boolean)
    .join(". ");
  const row = (
    <PressableCard
      label={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={{
        ...(trailing ? { flex: 1, minWidth: 0 } : {}),
        gap: space.sm,
        // PressableCard's row defaults set per-axis padding and a bleed margin; override each axis.
        paddingVertical: space.md,
        paddingHorizontal: space.xs,
        minHeight: metrics.touchTarget,
        marginHorizontal: 0,
        marginVertical: 0,
        borderBottomWidth: trailing ? 0 : metrics.groupGuide,
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
  return trailing ? (
    <View style={{
      flexDirection: "row", alignItems: "flex-start", gap: space.xs,
      borderBottomWidth: metrics.groupGuide, borderBottomColor: colors.separator,
    }}>
      {row}
      <View style={{ paddingTop: space.xs }}>{trailing}</View>
    </View>
  ) : row;
}
