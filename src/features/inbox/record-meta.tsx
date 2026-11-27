import { View } from "react-native";
import ArrowRight from "lucide-react-native/icons/arrow-right";
import GitBranch from "lucide-react-native/icons/git-branch";
import { Body } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, radii, space } from "@/ui/tokens";

/**
 * A record's identity line under its title: where it lives (provider · repo · #n), who opened it as
 * a small initial avatar with the name, and for a pull request its branches as monospace chips
 * (head → base). Long branch names end in an ellipsis instead of wrapping the row.
 */
export function RecordMeta({ source, author, head, base }: { source: string; author?: string; head?: string; base?: string }) {
  const copy = useCopy();
  const { colors, uiStyles } = useMobileTheme();
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.sm, rowGap: space.xs }}>
        <Body muted style={uiStyles.caption}>{source}</Body>
        {author ? (
          <View accessible accessibilityLabel={copy("Yazar: {p0}", "Author: {p0}", { p0: author })}
            style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minWidth: 0, flexShrink: 1 }}>
            <View style={{ width: 18, height: 18, borderRadius: radii.pill, backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" }}>
              <Body style={[uiStyles.caption, { color: colors.text }]}>{author.slice(0, 1).toUpperCase()}</Body>
            </View>
            <Body numberOfLines={1} style={[uiStyles.caption, { color: colors.text, flexShrink: 1 }]}>{author}</Body>
          </View>
        ) : null}
      </View>
      {head && base ? (
        <View accessible accessibilityLabel={copy("{p0} dalından {p1} dalına", "From {p0} into {p1}", { p0: head, p1: base })}
          style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minWidth: 0 }}>
          <BranchChip name={head} grow />
          <ArrowRight size={iconSize.inline} color={colors.muted} />
          <BranchChip name={base} />
        </View>
      ) : null}
    </View>
  );
}

function BranchChip({ name, grow = false }: { name: string; grow?: boolean }) {
  const { colors, uiStyles } = useMobileTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs, minWidth: 0, flexShrink: grow ? 1 : 0, maxWidth: grow ? undefined : "45%",
      paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radii.badge, backgroundColor: colors.panel }}>
      <GitBranch size={iconSize.inline} color={colors.muted} />
      <Body mono muted numberOfLines={1} ellipsizeMode="middle" style={[uiStyles.caption, { flexShrink: 1 }]}>{name}</Body>
    </View>
  );
}
