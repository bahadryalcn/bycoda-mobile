import { View } from "react-native";
import { Badge, Body } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { lineHeight, radii, space } from "@/ui/tokens";
import { pullRequestTone } from "./git-link-pr-model";

/** Pull request state pill: merged uses the purple merged tone (desktop `feature`), others the shared Badge tones. */
export function PullRequestStateBadge({ state, label }: { state: string; label: string }) {
  const { colors, uiStyles } = useMobileTheme();
  if (state.toUpperCase() !== "MERGED") return <Badge label={label} tone={pullRequestTone(state)} />;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        maxWidth: "100%",
        paddingHorizontal: space.sm,
        paddingVertical: space.xxs,
        borderRadius: radii.control,
        backgroundColor: colors.mergedSurface,
      }}
    >
      <Body
        selectable={false}
        style={{ fontSize: uiStyles.badge.fontSize, lineHeight: lineHeight.badge, fontWeight: "600", color: colors.merged }}
      >
        {label}
      </Body>
    </View>
  );
}
