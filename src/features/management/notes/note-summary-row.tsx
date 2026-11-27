import { truncateGraphemes } from "../../../../../src/shared/lib/text/truncate";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useMobileTheme } from "@/ui/theme";
import type { Note } from "@/domain/types";
import { useCopy } from "@/ui/copy";
import { messageSummary } from "@/ui/message-summary";
import { Body, PressableCard } from "@/ui/primitives";
import { metrics, space } from "@/ui/tokens";
import { useRelativeTime } from "../shared/record-bits";
import { NOTE_TITLE_LIMIT } from "./note-tags";

const MAX_TAGS = 3;

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

/** A note row: title, two-line preview, then edit time, project, origin and tags as quiet metadata. */
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
  const tags = note.tags.slice(0, MAX_TAGS);
  const extraTags = note.tags.length - tags.length;
  const meta = [edited, projectName, note.sourceSessionId && copy("Oturumdan", "From session")].filter(Boolean).join(" · ");
  const tagLine = [...tags.map((tag) => `#${tag}`), extraTags > 0 && `+${extraTags}`].filter(Boolean).join(" ");
  // A folder path is not a spoken name; the project name is read when it is known.
  const accessibilityLabel = [title, edited, note.tags.map((tag) => `#${tag}`).join(" "), projectName]
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
      <Body selectable={false} numberOfLines={labelLines ?? 2} style={[uiStyles.title, !savedTitle && { color: colors.subtle }]}>{title}</Body>
      {excerpt ? <Body muted selectable={false} numberOfLines={2}>{excerpt}</Body> : null}
      {meta || tagLine ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.md, rowGap: space.xxs }}>
          {meta ? <Body muted selectable={false} numberOfLines={1} style={[uiStyles.caption, { flexShrink: 1 }]}>{meta}</Body> : null}
          {tagLine ? <Body muted selectable={false} numberOfLines={1} style={[uiStyles.caption, { flexShrink: 1 }]}>{tagLine}</Body> : null}
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
