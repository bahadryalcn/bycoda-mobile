import { FlatList, RefreshControl, View, type FlatListProps } from "react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenChrome } from "./layout";
import { Body, Heading } from "./typography";
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
};

/** The page owns one vertical list; headers/forms live in list slots, never another ScrollView. */
export function ScreenList<T>({
  title,
  subtitle,
  header,
  footer,
  query,
  refresh,
  style,
  contentContainerStyle,
  ListHeaderComponent,
  ListFooterComponent,
  refreshControl,
  ...props
}: ScreenListProps<T>) {
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
          gap: space.sm,
          paddingStart: Math.max(insets.left, space.screen),
          paddingEnd: Math.max(insets.right, space.screen),
          paddingTop: space.lg,
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
        header !== undefined || title || subtitle ? (
          <View style={{ gap: space.lg, paddingBottom: space.sm }}>
            {title && !chrome.nativeTitle ? <Heading>{title}</Heading> : null}
            {subtitle ? <Body muted>{subtitle}</Body> : null}
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
