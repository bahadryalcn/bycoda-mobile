import { useMobileTheme } from "./theme";
import { scrollKeyboardDismissMode } from "./scroll-keyboard";
import { createContext, use, useMemo, useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { KeyboardAvoidingView, KeyboardAwareScrollView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body } from "./typography";
import Animated from "react-native-reanimated";
import { reveal } from "./motion";
import { colors, metrics, space } from "./tokens";
import { uiStyles } from "./styles";
import { Card as PanelCard } from "panelui-native/components/card";
import { surfaceClasses } from "./design-system";
import { usePullRefresh } from "./use-pull-refresh";
import { FormActionScrollOwner } from "./form-action-context";
import { screenFooterLimits } from "./screen-footer-model";
import type { PropsWithChildren, ReactNode } from "react";
import type { ScreenProps, ContainerProps, CardProps, SectionProps, CodePanelProps } from "./component-props";

const ScreenChrome = createContext<{
  nativeTitle: boolean;
  bottomSafeArea: boolean;
  headerAccessory?: ReactNode;
  headerIdentity?: (props: HeaderIdentityProps) => ReactNode;
}>({ nativeTitle: false, bottomSafeArea: true });

export type HeaderIdentityProps = { title: string; subtitle?: string };
export function useScreenChrome() {
  return use(ScreenChrome);
}

/** Suppressed native titles must not leave an empty padded content header behind. */
export function useScreenHeading(props: { title?: string; subtitle?: string; context?: ReactNode; actions?: ReactNode }) {
  const chrome = useScreenChrome();
  const visible = props.subtitle || props.context || props.actions || (props.title && (!chrome.nativeTitle || chrome.headerAccessory));
  return visible ? <ScreenHeading {...props} /> : null;
}

/** A native header or tab bar owns its inset; the page must not add it again. */
export function ScreenChromeProvider({
  children,
  nativeTitle = false,
  bottomSafeArea = true,
  headerAccessory,
  headerIdentity,
}: PropsWithChildren<{
  nativeTitle?: boolean;
  bottomSafeArea?: boolean;
  /** Optional context alongside the title, never a separate introductory row. */
  headerAccessory?: ReactNode;
  /** A navigator can combine page identity and its scope selector in one target. */
  headerIdentity?: (props: HeaderIdentityProps) => ReactNode;
}>) {
  useMobileTheme();
  const value = useMemo(
    () => ({ nativeTitle, bottomSafeArea, headerAccessory, headerIdentity }),
    [nativeTitle, bottomSafeArea, headerAccessory, headerIdentity],
  );
  return <ScreenChrome.Provider value={value}>{children}</ScreenChrome.Provider>;
}

/** One identity/context/action row. Native title ownership never hides commands. */
export function ScreenHeading({ title, subtitle, context, actions }: {
  title?: string; subtitle?: string; context?: ReactNode; actions?: ReactNode;
}) {
  useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const chrome = use(ScreenChrome);
  const showTitle = !!title && !chrome.nativeTitle;
  const customIdentity = showTitle && chrome.headerIdentity;
  const accessory = title ? chrome.headerAccessory : undefined;
  if (!showTitle && !subtitle && !context && !actions && !accessory) return null;
  return (
    <View style={uiStyles.pageHeading}>
      {showTitle || subtitle || context ? (
        <View style={[uiStyles.pageIdentity, { flexBasis: 120 * Math.max(1, fontScale) }]}>
          {customIdentity ? customIdentity({ title: title!, subtitle }) : (
            <>
              {showTitle ? <Text selectable accessibilityRole="header" style={uiStyles.heading}>{title}</Text> : null}
              {subtitle ? <Body muted style={uiStyles.caption}>{subtitle}</Body> : null}
            </>
          )}
          {context}
        </View>
      ) : null}
      {accessory}
      {actions ? <View style={uiStyles.pageActions}>{actions}</View> : null}
    </View>
  );
}

/** Related scope/view controls share a row only while their text has useful room. */
export function ContextControls({ scope, view }: { scope: ReactNode; view: ReactNode }) {
  useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const column = { flexGrow: 1, flexShrink: 1, flexBasis: 120 * Math.max(1, fontScale), minWidth: 0,
    maxWidth: "100%" as const };
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: space.sm }}>
    <View style={column}>{scope}</View>
    <View style={column}>{view}</View>
  </View>;
}

/** Explicit large-title treatment for entry/overview content, not ordinary tools. */
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
  context,
  scroll = true,
  query,
  refresh,
  refreshState,
  actions,
  footer,
  onContentViewport,
}: ScreenProps) {
  useMobileTheme();
  const insets = useSafeAreaInsets();
  const chrome = use(ScreenChrome);
  const heading = useScreenHeading({ title, subtitle, context, actions });
  const keyboardVisible = useKeyboardState(state => state.isVisible);
  const { height, fontScale } = useWindowDimensions();
  const [frameHeight, measureFrame] = useScreenHeight(height);
  const [headerHeight, measureHeader] = useScreenHeight(0);
  const footerLimits = screenFooterLimits(frameHeight, fontScale, !scroll && heading ? headerHeight : 0);
  const onRefresh = refresh ?? query?.refetch;
  const ownRefresh = usePullRefresh(refreshState ? undefined : onRefresh);
  const pullRefresh = refreshState ?? ownRefresh;
  const actionArea = footer ? <ScrollView
    keyboardShouldPersistTaps="handled"
    automaticallyAdjustKeyboardInsets={false}
    contentInsetAdjustmentBehavior="never"
    style={{ flexGrow: 0, flexShrink: 0, minHeight: 0, maxHeight: footerLimits.maximum,
      backgroundColor: colors.background, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}
    contentContainerStyle={{
      paddingStart: Math.max(insets.left, space.screen), paddingEnd: Math.max(insets.right, space.screen),
      paddingTop: space.sm, paddingBottom: space.sm + (chrome.bottomSafeArea && !keyboardVisible ? insets.bottom : 0),
    }}>
    <FormActionScrollOwner value>{footer}</FormActionScrollOwner>
  </ScrollView> : null;
  if (!scroll)
    return (
      <KeyboardAvoidingView enabled={!!footer} behavior="padding" automaticOffset style={{ flex: 1 }}>
      <View style={uiStyles.screen} onLayout={measureFrame}>
        {heading ? <ScreenHeader onLayout={measureHeader}>{heading}</ScreenHeader> : null}
        {children}
        {actionArea}
      </View>
      </KeyboardAvoidingView>
    );
  return (
    <KeyboardAvoidingView enabled={!!footer} behavior="padding" automaticOffset style={{ flex: 1 }}>
    <View style={uiStyles.screen} onLayout={measureFrame}>
      <KeyboardAwareScrollView
        enabled={!footer}
        onLayout={onContentViewport ? ({ nativeEvent: { layout } }) => onContentViewport({
          width: Math.max(0, Math.min(layout.width, metrics.contentWidth) - Math.max(insets.left, space.screen) - Math.max(insets.right, space.screen)),
          height: Math.max(0, layout.height - space.screen - space.lg - (!footer && chrome.bottomSafeArea ? insets.bottom : 0)),
        }) : undefined}
        bottomOffset={space.lg}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustKeyboardInsets={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={scrollKeyboardDismissMode()}
        style={[uiStyles.screen, { minHeight: footer ? footerLimits.bodyMinimum : 0 }]}
        refreshControl={
          refreshState || onRefresh ? (
            <RefreshControl
              tintColor={colors.muted}
              refreshing={pullRefresh.refreshing}
              onRefresh={pullRefresh.onRefresh}
            />
          ) : undefined
        }
        contentContainerStyle={[
          uiStyles.content,
          {
            paddingLeft: Math.max(insets.left, space.screen),
            paddingRight: Math.max(insets.right, space.screen),
            paddingBottom: space.lg + (!footer && chrome.bottomSafeArea ? insets.bottom : 0),
          },
        ]}
      >
        {heading}
        {children}
      </KeyboardAwareScrollView>
    {actionArea}
    </View>
    </KeyboardAvoidingView>
  );
}

function useScreenHeight(initial: number) {
  const [height, setHeight] = useState(Number.isFinite(initial) && initial > 0 ? initial : 0);
  const measure = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (!Number.isFinite(layout.height) || layout.height <= 0) return;
    setHeight(current => Math.abs(current - layout.height) < 1 ? current : layout.height);
  }, []);
  return [height, measure] as const;
}

export function ScreenHeader({ children, onLayout }: PropsWithChildren<{ onLayout?: (event: LayoutChangeEvent) => void }>) {
  useMobileTheme();
  return <View style={uiStyles.header} onLayout={onLayout}>{children}</View>;
}

const CardDepth = createContext(0);

/** Plain task groups align with their page; nesting never multiplies the gutter. */
export function Card({ children, style, variant = "plain" }: CardProps) {
  useMobileTheme();
  const depth = use(CardDepth);
  const surface = variant === "surface";
  return (
    <CardDepth value={depth + 1}>
      <PanelCard
        className={surface ? surfaceClasses : "min-w-0 rounded-none border-0 bg-transparent shadow-none p-0 gap-ui-sm"}
        style={StyleSheet.flatten([
          uiStyles.card,
          !surface && { backgroundColor: "transparent", borderRadius: 0, paddingHorizontal: 0,
            paddingVertical: depth ? 0 : space.sm },
          style,
        ])}
      >
        {children}
      </PanelCard>
    </CardDepth>
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

/** Read-only status must not squeeze the identity into the space left by its value. */
export function StatusRow({ label, children }: PropsWithChildren<{ label: string }>) {
  return <Row>
    <Body style={{ flexGrow: 1, flexShrink: 1, flexBasis: "auto", minWidth: "auto", maxWidth: "100%" }}>{label}</Body>
    {children}
  </Row>;
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
