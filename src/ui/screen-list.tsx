import { useMobileTheme } from "./theme";
import { scrollKeyboardDismissMode } from "./scroll-keyboard";
import { FlatList, RefreshControl, View, type FlatListProps } from "react-native";
import { createElement, isValidElement, type ComponentType, type ReactNode } from "react";
import { useScreenHeading } from "./layout";
import { useScreenContentInsets } from "./screen-content-insets";
import { metrics, space } from "./tokens";
import type { QueryLike } from "./query-presentation";
import { usePullRefresh } from "./use-pull-refresh";
import { ConnectionFeedbackScope } from "./connection-feedback-scope";
import type { PageScope } from "./scope-line";

export type ScreenListProps<T> = FlatListProps<T> & {
  title?: string;
  subtitle?: string;
  /** Which computer/project the page acts on: one quiet glyph-led line beside the heading actions. */
  scope?: PageScope;
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

function renderSlot(slot: FlatListProps<unknown>["ListHeaderComponent"]): ReactNode {
  if (!slot) return null;
  return isValidElement(slot) ? slot : createElement(slot as ComponentType);
}

/** The page owns one vertical list; headers/forms live in list slots, never another ScrollView. */
export function ScreenList<T>({
  title,
  subtitle,
  scope,
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
  ListEmptyComponent,
  refreshControl,
  ...props
}: ScreenListProps<T>) {
  const { colors, uiStyles } = useMobileTheme();
  const content = useScreenContentInsets();
  const heading = useScreenHeading({ title, subtitle, scope, context, actions, onBack });
  const onRefresh = refresh ?? query?.refetch;
  const ownRefresh = usePullRefresh(refreshState ? undefined : onRefresh);
  const pullRefresh = refreshState ?? ownRefresh;
  const callerHeader = renderSlot(ListHeaderComponent);
  const callerFooter = renderSlot(ListFooterComponent);
  // Like Screen and Sheet, a list page reports a failed read once: the first failing section owns it.
  return (
    <ConnectionFeedbackScope>
    <FlatList
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={scrollKeyboardDismissMode()}
      contentInsetAdjustmentBehavior="never"
      {...props}
      style={[uiStyles.screen, style]}
      ListEmptyComponent={ListEmptyComponent ? (
        <View collapsable={false} style={{ flexGrow: 1 }}>
          {isValidElement(ListEmptyComponent) ? ListEmptyComponent : createElement(ListEmptyComponent as ComponentType)}
        </View>
      ) : undefined}
      contentContainerStyle={[
        {
          width: "100%",
          maxWidth: metrics.contentWidth,
          alignSelf: "center",
          gap: grouped ? 0 : space.xs,
          paddingStart: content.left,
          paddingEnd: content.right,
          paddingTop: space.xs,
          paddingBottom: space.lg + content.bottom,
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
          <View style={{ gap: space.sm, paddingBottom: space.xs }}>
            {heading}
            {header}
            {callerHeader}
          </View>
        ) : (
          ListHeaderComponent
        )
      }
      ListFooterComponent={
        footer !== undefined ? (
          <View style={{ gap: space.sm, paddingTop: space.sm }}>
            {footer}
            {callerFooter}
          </View>
        ) : (
          ListFooterComponent
        )
      }
    />
    </ConnectionFeedbackScope>
  );
}
