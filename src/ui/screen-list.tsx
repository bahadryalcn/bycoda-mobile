import { useMobileTheme } from "./theme";
import { scrollKeyboardDismissMode } from "./scroll-keyboard";
import { FlatList, RefreshControl, View, type FlatListProps } from "react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenHeading, useScreenChrome } from "./layout";
import { colors, metrics, space } from "./tokens";
import { uiStyles } from "./styles";
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
  grouped = false,
  style,
  contentContainerStyle,
  ListHeaderComponent,
  ListFooterComponent,
  refreshControl,
  ...props
}: ScreenListProps<T>) {
  useMobileTheme();
  const insets = useSafeAreaInsets();
  const chrome = useScreenChrome();
  const heading = useScreenHeading({ title, subtitle, context, actions });
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
          gap: grouped ? 0 : space.sm,
          paddingStart: Math.max(insets.left, space.screen),
          paddingEnd: Math.max(insets.right, space.screen),
          paddingTop: space.sm,
          paddingBottom: space.lg + (chrome.bottomSafeArea ? insets.bottom : 0),
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
          <View style={{ gap: space.sm, paddingBottom: space.sm }}>
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
