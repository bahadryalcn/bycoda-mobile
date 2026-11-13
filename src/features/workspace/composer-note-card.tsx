import { View } from "react-native";
import X from "lucide-react-native/icons/x";
import { Body } from "@/ui/primitives";
import { ChatAction } from "@/ui/chat-controls";
import { radii, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import type { ComposerDraft } from "./composer-draft";
import { useMobileTheme } from "@/ui/theme";

type NoteComposerCard = NonNullable<ComposerDraft["noteCard"]>;

/** Attached note context retains its full title beside the remove control. */
export function ComposerNoteCard({
  card,
  error,
  disabled,
  onRemove,
}: {
  card: NoteComposerCard;
  error?: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  return (
    <View
      style={{
        backgroundColor: colors.fill,
        borderRadius: radii.control,
        paddingLeft: space.md,
        paddingVertical: space.xs,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body style={{ fontWeight: "500" }}>{card.title || copy("Başlıksız", "Untitled")}</Body>
          <Body muted numberOfLines={1}>
            {copy("Not bağlamı · incelenen kopya", "Note context · reviewed copy")}
          </Body>
        </View>
        <ChatAction
          label={copy("Not bağlamını kaldır", "Remove note context")}
          disabled={disabled}
          onPress={onRemove}
        >
          <X size={16} color={colors.muted} />
        </ChatAction>
      </View>
      {error ? <Body muted>{error}</Body> : null}
    </View>
  );
}
