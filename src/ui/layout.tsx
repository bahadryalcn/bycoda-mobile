import { createContext, use, useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Heading, Body } from "./typography";
import { colors, space } from "./tokens";
import { uiStyles } from "./styles";
import { Card as GlueCard } from "./gluestack/card";
import { HStack } from "./gluestack/hstack";
import { VStack } from "./gluestack/vstack";
import { surfaceClasses } from "./design-system";
import type { PropsWithChildren } from "react";
import type { ScreenProps, ContainerProps, SectionProps, CodePanelProps } from "./component-props";

const ScreenChrome = createContext({ nativeTitle: false, bottomSafeArea: true });
export function useScreenChrome() {
  return use(ScreenChrome);
}

/** A native header or tab bar owns its inset; the page must not add it again. */
export function ScreenChromeProvider({
  children,
  nativeTitle = false,
  bottomSafeArea = true,
}: PropsWithChildren<{ nativeTitle?: boolean; bottomSafeArea?: boolean }>) {
  const value = useMemo(() => ({ nativeTitle, bottomSafeArea }), [nativeTitle, bottomSafeArea]);
  return <ScreenChrome.Provider value={value}>{children}</ScreenChrome.Provider>;
}

export function Screen({ children, title, subtitle, scroll = true, query, refresh }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const chrome = use(ScreenChrome);
  const showTitle = !!title && !chrome.nativeTitle;
  const heading =
    showTitle || subtitle ? (
      <View style={uiStyles.titleGroup}>
        {showTitle ? <Heading>{title}</Heading> : null}
        {subtitle ? <Body muted>{subtitle}</Body> : null}
      </View>
    ) : null;
  if (!scroll)
    return (
      <View style={uiStyles.screen}>
        {heading}
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
  return <View style={uiStyles.header}>{children}</View>;
}

export function Card({ children, style }: ContainerProps) {
  return (
    <GlueCard className={surfaceClasses} style={StyleSheet.flatten([uiStyles.card, style])}>
      {children}
    </GlueCard>
  );
}

export function Row({ children, style }: ContainerProps) {
  return (
    <HStack
      className="flex-row flex-wrap items-center gap-ui-row"
      style={StyleSheet.flatten([uiStyles.row, style])}
    >
      {children}
    </HStack>
  );
}

export function Stack({ children, style }: ContainerProps) {
  return (
    <VStack className="gap-ui-md" style={StyleSheet.flatten([uiStyles.stack, style])}>
      {children}
    </VStack>
  );
}

export function Section({ title, children }: SectionProps) {
  return (
    <Stack style={{ paddingTop: space.sm }}>
      <Text selectable accessibilityRole="header" style={uiStyles.sectionLabel}>
        {title}
      </Text>
      {children}
    </Stack>
  );
}

export function CodePanel({ children, horizontal = true, style }: CodePanelProps) {
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
