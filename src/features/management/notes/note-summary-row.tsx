import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import NotebookPen from "lucide-react-native/icons/notebook-pen";
import type { Note } from "@/domain/types";
import { useCopy } from "@/ui/copy";
import { Body, PressableCard } from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { colors, fontSize, space } from "@/ui/tokens";
import { stamp } from "../shared/format";

export function NoteSummaryRow({
  note,
  disabled,
  onPress,
}: {
  note: Note;
  disabled: boolean;
  onPress: () => void;
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
    <PressableCard
      label={title}
      disabled={disabled}
      onPress={onPress}
      style={[
        uiStyles.card,
        { flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingVertical: 10 },
      ]}
    >
      <NotebookPen size={18} color={colors.accent} style={{ marginTop: 2 }} />
      <View style={[uiStyles.grow, { gap: 3 }]}>
        <Body numberOfLines={2} style={uiStyles.title}>
          {title}
        </Body>
        {excerpt ? (
          <Body muted numberOfLines={2} style={{ fontSize: fontSize.control, lineHeight: 20 }}>
            {excerpt}
          </Body>
        ) : null}
        <Body muted numberOfLines={1} style={uiStyles.caption}>
          {metadata}
        </Body>
      </View>
      <ChevronRight size={15} color={colors.subtle} style={{ marginTop: 3 }} />
    </PressableCard>
  );
}
