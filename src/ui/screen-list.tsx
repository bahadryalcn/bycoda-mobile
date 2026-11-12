import { useMobileTheme } from "./theme";
import { scrollKeyboardDismissMode } from "./scroll-keyboard";
import { FlatList, RefreshControl, View, type FlatListProps } from "react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenHeading, useScreenChrome } from "./layout";
import { metrics, space } from "./tokens";
import type { QueryLike } from "./query-presentation";
import { usePullRefresh } from "./use-pull-refresh";

export type ScreenListProps<T> = FlatListProps<T> & {
  title?: string;
  subtitle?: string;
  /** Current task scope beside heading actions, including under a native title. */
  context?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  query?: QueryLike;
  refresh?: () => unknown;
  /** A toolbar and pull gesture can share one active refresh controller. */
  refreshState?: ReturnType<typeof usePullRefresh>;
  /** Actions owned by the compact page heading (e.g. an IconButton or ActionMenu). */
  actions?: ReactNode;
  /** In-screen back control, shown only when no native header owns navigation. */
  onBack?: () => void;
  /** Adjacent rows own their shared surface and separators. */
  grouped?: boolean;
};

/** The page owns one vertical list; headers/forms live in list slots, never another ScrollView. */
export function ScreenList<T>({
  title,
  subtitle,
  context,
  header,
  footer,
  query,
  refresh,
  refreshState,
  actions,
  onBack,
  grouped = false,
  style,
  contentContainerStyle,
  ListHeaderComponent,
  ListFooterComponent,
  refreshControl,
  ...props
}: ScreenListProps<T>) {
  const { colors, uiStyles } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const chrome = useScreenChrome();
  const heading = useScreenHeading({ title, subtitle, context, actions, onBack });
  const onRefresh = refresh ?? query?.refetch;
  const ownRefresh = usePullRefresh(refreshState ? undefined : onRefresh);
  const pullRefresh = refreshState ?? ownRefresh;
  return (
    <FlatList
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={scrollKeyboardDismissMode()}
      contentInsetAdjustmentBehavior="never"
      {...props}
      style={[uiStyles.screen, style]}
      contentContainerStyle={[
        {
          width: "100%",
          maxWidth: metrics.contentWidth,
          alignSelf: "center",
          gap: grouped ? 0 : space.xs,
          paddingStart: Math.max(insets.left, space.screen),
          paddingEnd: Math.max(insets.right, space.screen),
          paddingTop: space.xs,
          paddingBottom: space.lg + chrome.bottomInset + (chrome.bottomSafeArea ? insets.bottom : 0),
          flexGrow: 1,
        },
        contentContainerStyle,
      ]}
      refreshControl={
        refreshControl ??
        (refreshState || onRefresh ? (
          <RefreshControl
            tintColor={colors.muted}
            refreshing={pullRefresh.refreshing}
            onRefresh={pullRefresh.onRefresh}
          />
        ) : undefined)
      }
      ListHeaderComponent={
        header !== undefined || heading ? (
          <View style={{ gap: space.xs, paddingBottom: space.xs }}>
            {heading}
            {header}
          </View>
        ) : (
          ListHeaderComponent
        )
      }
      ListFooterComponent={
        footer !== undefined ? (
          <View style={{ gap: space.sm, paddingTop: space.sm }}>{footer}</View>
        ) : (
          ListFooterComponent
        )
      }
    />
  );
}
