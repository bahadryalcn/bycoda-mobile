import { Text, View } from "react-native";
import Laptop from "lucide-react-native/icons/laptop";
import Folder from "lucide-react-native/icons/folder";
import { decorativeSvgProps } from "./accessibility";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { iconSize } from "./tokens";

/** Which computer (and project) a pushed page acts on. */
export type PageScope = { computer?: string; project?: string };

/** Spoken form of a scope; the visible line uses role glyphs instead of the words. */
export function scopeAccessibilityLabel(scope: PageScope, labels: { computer: string; project: string }): string {
  return [
    scope.computer ? `${labels.computer}: ${scope.computer}` : undefined,
    scope.project ? `${labels.project}: ${scope.project}` : undefined,
  ].filter(Boolean).join(", ");
}

/**
 * The one "which computer / project" line under a page title (or alone under a native title):
 * a quiet 13/17 caption, each value led by its role glyph. Heading actions (refresh, add) share
 * its row through `ScreenHeading`, so the context and its commands read as one unit.
 */
export function ScopeLine({ scope }: { scope: PageScope }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  if (!scope.computer && !scope.project) return null;
  const label = scopeAccessibilityLabel(scope, { computer: copy("Bilgisayar", "Computer"), project: copy("Proje", "Project") });
  const item = (Glyph: typeof Laptop, value: string) => (
    <View style={uiStyles.scopeItem}>
      <Glyph {...decorativeSvgProps} size={iconSize.inline} strokeWidth={2} color={colors.muted} />
      <Text numberOfLines={1} style={[uiStyles.caption, { flexShrink: 1 }]}>{value}</Text>
    </View>
  );
  return (
    <View accessible accessibilityLabel={label} style={uiStyles.scopeLine}>
      {scope.computer ? item(Laptop, scope.computer) : null}
      {scope.project ? item(Folder, scope.project) : null}
    </View>
  );
}
