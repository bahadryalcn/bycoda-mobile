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
  /** Which computer/project the page acts on: read-only scope pills at the start of the scope row. */
  scope?: PageScope;
  /** Lead the scope row with the switchable computer pill; defaults to true with an own `scopeControl`. */
  computerSwitch?: boolean;
  /** Current task scope beside heading actions, including under a native title. */
  context?: ReactNode;
  /** The shared project scope control (`ProjectScopePill`): one compact pill in the page identity row. */
  scopeControl?: ReactNode;
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
  /**
   * The header takes the free height of the viewport (a hero above an empty list, such as the
   * assistant's home), so its own layout can centre content in it. It still scrolls when taller.
   */
  headerFill?: boolean;
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
  scopeControl,
  computerSwitch,
  header,
  footer,
  query,
  refresh,
  refreshState,
  actions,
  onBack,
  grouped = false,
  headerFill = false,
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
  const heading = useScreenHeading({ title, subtitle, scope, context, scopeControl, computerSwitch, actions, onBack });
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
      ListHeaderComponentStyle={headerFill ? { flexGrow: 1 } : props.ListHeaderComponentStyle}
      ListHeaderComponent={
        header !== undefined || heading ? (
          <View style={[{ gap: space.sm, paddingBottom: space.xs }, headerFill && { flexGrow: 1 }]}>
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
