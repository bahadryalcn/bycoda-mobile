import { useMobileTheme } from "./theme";
import { createContext, use, useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body } from "./typography";
import Animated from "react-native-reanimated";
import { reveal } from "./motion";
import { colors, metrics, space } from "./tokens";
import { uiStyles } from "./styles";
import { Card as PanelCard } from "panelui-native/components/card";
import { surfaceClasses } from "./design-system";
import type { PropsWithChildren, ReactNode } from "react";
import type { ScreenProps, ContainerProps, SectionProps, CodePanelProps } from "./component-props";

const ScreenChrome = createContext<{
  nativeTitle: boolean;
  bottomSafeArea: boolean;
  headerAccessory?: ReactNode;
}>({ nativeTitle: false, bottomSafeArea: true });
export function useScreenChrome() {
  return use(ScreenChrome);
}

/** A native header or tab bar owns its inset; the page must not add it again. */
export function ScreenChromeProvider({
  children,
  nativeTitle = false,
  bottomSafeArea = true,
  headerAccessory,
}: PropsWithChildren<{
  nativeTitle?: boolean;
  bottomSafeArea?: boolean;
  /** Shown beside every large title in this navigator, e.g. the computer switcher. */
  headerAccessory?: ReactNode;
}>) {
  useMobileTheme();
  const value = useMemo(
    () => ({ nativeTitle, bottomSafeArea, headerAccessory }),
    [nativeTitle, bottomSafeArea, headerAccessory],
  );
  return <ScreenChrome.Provider value={value}>{children}</ScreenChrome.Provider>;
}

/** Title ownership never determines whether commands remain available. */
function ScreenActions({ actions }: { actions?: ReactNode }) {
  const chrome = use(ScreenChrome);
  if (!chrome.headerAccessory && !actions) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center",
      justifyContent: chrome.headerAccessory ? "space-between" : "flex-end",
      gap: space.sm, minHeight: metrics.touchTarget }}>
      {chrome.headerAccessory ? <View style={{ flexShrink: 1, minWidth: 0 }}>{chrome.headerAccessory}</View> : null}
      {actions ? <View style={{ flexDirection: "row", flexWrap: "wrap", flexShrink: 1,
        justifyContent: "flex-end", minWidth: 0, maxWidth: "100%", gap: space.xs }}>{actions}</View> : null}
    </View>
  );
}

export function ScreenHeading({ title, subtitle, actions }: {
  title?: string; subtitle?: string; actions?: ReactNode;
}) {
  useMobileTheme();
  const chrome = use(ScreenChrome);
  if (title && !chrome.nativeTitle) return <LargeTitle title={title} subtitle={subtitle} actions={actions} />;
  if (!subtitle && !actions && !(title && chrome.headerAccessory)) return null;
  return <View style={uiStyles.titleGroup}>
    <ScreenActions actions={actions} />
    {subtitle ? <Body muted>{subtitle}</Body> : null}
  </View>;
}

/** iOS large title with the navigator's accessory and optional trailing actions. */
export function LargeTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  useMobileTheme();
  const chrome = use(ScreenChrome);
  return (
    <Animated.View entering={reveal} style={uiStyles.titleGroup}>
      {chrome.headerAccessory ? (
        <View style={{ alignSelf: "flex-start", maxWidth: "100%" }}>{chrome.headerAccessory}</View>
      ) : null}
      <View style={uiStyles.titleRow}>
        <Text selectable accessibilityRole="header" style={[uiStyles.largeTitle, uiStyles.titleText]}>
          {title}
        </Text>
        {actions ? <View style={uiStyles.titleActions}>{actions}</View> : null}
      </View>
      {subtitle ? (
        <Body muted style={uiStyles.caption}>
          {subtitle}
        </Body>
      ) : null}
    </Animated.View>
  );
}

export function Screen({
  children,
  title,
  subtitle,
  scroll = true,
  query,
  refresh,
  actions,
}: ScreenProps) {
  useMobileTheme();
  const insets = useSafeAreaInsets();
  const chrome = use(ScreenChrome);
  const heading = <ScreenHeading title={title} subtitle={subtitle} actions={actions} />;
  if (!scroll)
    return (
      <View style={uiStyles.screen}>
        {title || subtitle || actions ? <ScreenHeader>{heading}</ScreenHeader> : null}
        {children}
      </View>
    );
  const onRefresh = refresh ?? query?.refetch;
  return (
    <KeyboardAwareScrollView
      bottomOffset={space.lg}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustKeyboardInsets={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={process.env.EXPO_OS === "ios" ? "interactive" : "on-drag"}
      style={uiStyles.screen}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            tintColor={colors.muted}
            refreshing={!!query?.isFetching && !query.isPending}
            onRefresh={() => {
              onRefresh();
            }}
          />
        ) : undefined
      }
      contentContainerStyle={[
        uiStyles.content,
        {
          paddingLeft: Math.max(insets.left, space.screen),
          paddingRight: Math.max(insets.right, space.screen),
          paddingBottom: space.lg + (chrome.bottomSafeArea ? insets.bottom : 0),
        },
      ]}
    >
      {heading}
      {children}
    </KeyboardAwareScrollView>
  );
}

export function ScreenHeader({ children }: PropsWithChildren) {
  useMobileTheme();
  return <View style={uiStyles.header}>{children}</View>;
}

export function Card({ children, style }: ContainerProps) {
  useMobileTheme();
  return (
    <PanelCard className={surfaceClasses} style={StyleSheet.flatten([uiStyles.card, style])}>
      {children}
    </PanelCard>
  );
}

export function Row({ children, style }: ContainerProps) {
  useMobileTheme();
  return (
    <View
      className="flex-row flex-wrap items-center gap-ui-row"
      style={StyleSheet.flatten([uiStyles.row, style])}
    >
      {children}
    </View>
  );
}

export function Stack({ children, style }: ContainerProps) {
  useMobileTheme();
  return (
    <View style={StyleSheet.flatten([uiStyles.stack, style])}>
      {children}
    </View>
  );
}

export function Section({ title, children }: SectionProps) {
  useMobileTheme();
  return (
    <Stack style={{ gap: space.sm }}>
      <Text selectable accessibilityRole="header" style={uiStyles.sectionLabel}>
        {title}
      </Text>
      {children}
    </Stack>
  );
}

export function CodePanel({ children, horizontal = true, style }: CodePanelProps) {
  useMobileTheme();
  if (!horizontal)
    return <View style={[uiStyles.codePanel, uiStyles.codeContent, style]}>{children}</View>;
  return (
    <ScrollView
      horizontal={horizontal}
      style={[uiStyles.codePanel, style]}
      contentContainerStyle={uiStyles.codeContent}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
