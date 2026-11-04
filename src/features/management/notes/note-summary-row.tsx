import { useMobileTheme } from "@/ui/theme";
import type { Note } from "@/domain/types";
import { useCopy } from "@/ui/copy";
import { NavigationRow } from "@/ui/primitives";
import { stamp } from "../shared/format";

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
  useMobileTheme();
  const copy = useCopy();
  const title = note.title.trim() || copy("Başlıksız", "Untitled");
  const excerpt = note.body.replace(/\s+/g, " ").trim().slice(0, 600);
  const tags = note.tags
    .slice(0, 2)
    .map((tag) => `#${tag}`)
    .join(" ");
  const metadata = [
    stamp(note.updatedAt),
    tags,
    note.tags.length > 2 ? `+${note.tags.length - 2}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <NavigationRow
      label={title}
      labelLines={labelLines}
      detail={excerpt || undefined}
      detailLines={2}
      metadata={metadata}
      accessibilityLabel={[title, metadata, note.sourceCwd].filter(Boolean).join(". ")}
      disabled={disabled}
      onPress={onPress}
    />
  );
}
