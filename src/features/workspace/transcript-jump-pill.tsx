import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import { Body, PressableCard } from "@/ui/primitives";
import { reveal } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, radii, space } from "@/ui/tokens";

/** Visible size of the pill; close to the 48dp touch target without a hit-slop overlap. */
const PILL_SIZE = 44;

/** Floating "back to latest" pill. It exists only while the list is not following the end. */
export function TranscriptJumpPill({
  unseen,
  bottom,
  onPress,
}: {
  /** New content arrived while the user was reading earlier messages. */
  unseen: boolean;
  /** Space reserved at the bottom (composer and keyboard); the pill floats above it. */
  bottom: number;
  onPress: () => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const label = unseen
    ? copy("Yeni mesajlar, son mesaja git", "New messages, jump to latest")
    : copy("Son mesaja git", "Jump to latest");
  return (
    <Animated.View
      entering={reveal}
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: bottom + space.sm, alignItems: "center" }}
    >
      <PressableCard
        label={label}
        onPress={onPress}
        style={{
          marginHorizontal: 0,
          minWidth: PILL_SIZE,
          minHeight: PILL_SIZE,
          height: PILL_SIZE,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space.xs,
          paddingVertical: 0,
          paddingHorizontal: unseen ? space.md : space.sm,
          borderRadius: radii.pill,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.elevated,
        }}
      >
        <ArrowDown size={14} color={unseen ? colors.accent : colors.text} />
        {unseen ? (
          <Body
            style={{
              fontSize: fontSize.caption,
              lineHeight: lineHeight.caption,
              fontWeight: "600",
              color: colors.accent,
            }}
          >
            {copy("Yeni", "New")}
          </Body>
        ) : null}
      </PressableCard>
    </Animated.View>
  );
}
