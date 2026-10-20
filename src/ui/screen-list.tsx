import { useMobileTheme } from "./theme";
import { FlatList, RefreshControl, View, type FlatListProps } from "react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeading, useScreenChrome } from "./layout";
import { colors, metrics, space } from "./tokens";
import { uiStyles } from "./styles";
import type { QueryLike } from "./query-presentation";

export type ScreenListProps<T> = FlatListProps<T> & {
  title?: string;
  subtitle?: string;
  header?: ReactNode;
  footer?: ReactNode;
  query?: QueryLike;
  refresh?: () => unknown;
  /** Trailing large-title actions (e.g. a "+" IconButton or ActionMenu). */
  actions?: ReactNode;
  /** Adjacent rows own their shared surface and separators. */
  grouped?: boolean;
};

/** The page owns one vertical list; headers/forms live in list slots, never another ScrollView. */
export function ScreenList<T>({
  title,
  subtitle,
  header,
  footer,
  query,
  refresh,
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
  const onRefresh = refresh ?? query?.refetch;
  return (
    <FlatList
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={process.env.EXPO_OS === "ios" ? "interactive" : "on-drag"}
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
        (onRefresh ? (
          <RefreshControl
            tintColor={colors.muted}
            refreshing={!!query?.isFetching && !query.isPending}
            onRefresh={() => {
              onRefresh();
            }}
          />
        ) : undefined)
      }
      ListHeaderComponent={
        header !== undefined || title || subtitle || actions ? (
          <View style={{ gap: space.lg, paddingBottom: space.sm }}>
            <ScreenHeading title={title} subtitle={subtitle} actions={actions} />
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
