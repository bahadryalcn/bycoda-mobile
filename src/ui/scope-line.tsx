import { Text, View } from "react-native";
import Laptop from "lucide-react-native/icons/laptop";
import Folder from "lucide-react-native/icons/folder";
import { decorativeSvgProps } from "./accessibility";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { iconSize, metrics, radii, SCOPE_PILL_MAX_WIDTH, space } from "./tokens";

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

/**
 * The page-heading form of a scope that cannot be changed on this page: the same 28 high pills as
 * the computer and project selectors (role glyph and one ellipsized name), without a chevron, so
 * every page's scope row looks alike. `ScreenHeading` renders it for `scope`; ScopeLine stays the
 * caption form inside sheets.
 */
export function ScopePills({ scope }: { scope: PageScope }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  if (!scope.computer && !scope.project) return null;
  const label = scopeAccessibilityLabel(scope, { computer: copy("Bilgisayar", "Computer"), project: copy("Proje", "Project") });
  const pill = (Glyph: typeof Laptop, value: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs + 2, height: metrics.chipHeight,
      paddingHorizontal: space.row, borderRadius: radii.pill, backgroundColor: colors.fill,
      maxWidth: SCOPE_PILL_MAX_WIDTH, minWidth: 0, flexShrink: 1 }}>
      <Glyph {...decorativeSvgProps} size={iconSize.inline} strokeWidth={2} color={colors.muted} style={{ flexShrink: 0 }} />
      <Text numberOfLines={1} ellipsizeMode="tail" style={[uiStyles.caption, { color: colors.text, flexShrink: 1, minWidth: 0 }]}>{value}</Text>
    </View>
  );
  return (
    <View accessible accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minWidth: 0, flexShrink: 1 }}>
      {scope.computer ? pill(Laptop, scope.computer) : null}
      {scope.project ? pill(Folder, scope.project) : null}
    </View>
  );
}
