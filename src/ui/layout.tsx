import { useMobileTheme } from "./theme";
import { scrollKeyboardDismissMode } from "./scroll-keyboard";
import { Children, Fragment, createContext, isValidElement, use, useMemo, useCallback, useLayoutEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { KeyboardAvoidingView, KeyboardAwareScrollView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body } from "./typography";
import { metrics, space } from "./tokens";
import { Card as PanelCard } from "panelui-native/components/card";
import { PageHeader } from "panelui-native/components/page-header";
import { surfaceClasses } from "./design-system";
import { usePullRefresh } from "./use-pull-refresh";
import { HeaderBackButton } from "./header-back-button";
import { ScopePills, type PageScope } from "./scope-line";
import { FormActionScrollOwner } from "./form-action-context";
import { screenFooterLimits } from "./screen-footer-model";
import { ConnectionFeedbackScope } from "./connection-feedback-scope";
import { ScreenChrome, ScreenComputerControl, ScreenHeaderRow, ScreenScopeControl, useScreenChrome, type HeaderIdentityProps } from "./screen-chrome";
import { SheetGuardContext } from "./sheet-guard-context";
import { ScreenFrameInsets, useScreenContentInsets } from "./screen-content-insets";
import type { PropsWithChildren, ReactNode } from "react";
import type { ScreenProps, ContainerProps, CardProps, SectionProps, CodePanelProps } from "./component-props";

// The chrome context lives in its own module so lightweight consumers can read it without this file's imports.
export { useScreenChrome, useBottomInset } from "./screen-chrome";
export type { HeaderIdentityProps } from "./screen-chrome";
export { useScreenContentInsets } from "./screen-content-insets";

/** Suppressed native titles must not leave an empty padded content header behind. */
export function useScreenHeading(props: { title?: string; subtitle?: string; scope?: PageScope; context?: ReactNode; scopeControl?: ReactNode; computerSwitch?: boolean; actions?: ReactNode; onBack?: () => void }) {
  const chrome = useScreenChrome();
  const routeScopeControl = use(ScreenScopeControl);
  const computerControl = use(ScreenComputerControl);
  const visible = props.subtitle || props.scope?.computer || props.scope?.project || props.context || props.scopeControl || routeScopeControl || (props.computerSwitch && computerControl) || props.actions || (props.onBack && !chrome.nativeTitle) || (props.title && (!chrome.nativeTitle || chrome.headerAccessory));
  return visible ? <ScreenHeading {...props} /> : null;
}

/** A native header or tab bar owns its inset; the page must not add it again. */
export function ScreenChromeProvider({
  children,
  nativeTitle = false,
  bottomSafeArea = true,
  bottomInset = 0,
  headerAccessory,
  headerIdentity,
  headerTrailing,
}: PropsWithChildren<{
  nativeTitle?: boolean;
  bottomSafeArea?: boolean;
  /** Measured floating-dock height that scrolling content and absolute elements must clear. */
  bottomInset?: number;
  /** Optional context alongside the title, never a separate introductory row. */
  headerAccessory?: ReactNode;
  /** A navigator can combine page identity and its scope selector in one target. */
  headerIdentity?: (props: HeaderIdentityProps) => ReactNode;
  /** An app-wide command at the far right of a tab's title row, after the page's own actions. */
  headerTrailing?: ReactNode;
}>) {
  useMobileTheme();
  const value = useMemo(
    () => ({ nativeTitle, bottomSafeArea, bottomInset, headerAccessory, headerIdentity, headerTrailing }),
    [nativeTitle, bottomSafeArea, bottomInset, headerAccessory, headerIdentity, headerTrailing],
  );
  return <ScreenChrome.Provider value={value}>{children}</ScreenChrome.Provider>;
}

/**
 * The one page-top pattern: title row (back + title, or the tab identity with the computer pill)
 * → one compact scope row → content. The scope row holds the scope pills (a read-only computer or
 * project pill from `scope`, the shared project pill from `scopeControl` or the route's
 * `ScreenScopeControl`) then `context`, with the page's icon actions (refresh, search, filter,
 * more, add) trailing on the same row. Native title ownership never hides commands.
 */
export function ScreenHeading({ title, subtitle, scope, context, scopeControl: ownScopeControl, computerSwitch, actions, onBack }: {
  title?: string; subtitle?: string; context?: ReactNode; actions?: ReactNode;
  /** Lead the scope row with the switchable computer pill; defaults to true with an own `scopeControl`. */
  computerSwitch?: boolean;
  /** Shared project scope: beside the computer selector in a tab identity, else first in the context. */
  scopeControl?: ReactNode;
  /** Which computer/project the page acts on; shares the row with `actions`. */
  scope?: PageScope;
  /** In-screen back (no native header); the shared HeaderBackButton leads the heading. */
  onBack?: () => void;
}) {
  const { uiStyles } = useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const chrome = use(ScreenChrome);
  const routeScopeControl = use(ScreenScopeControl);
  const ComputerControl = use(ScreenComputerControl);
  const scopeControl = ownScopeControl ?? routeScopeControl;
  const showTitle = !!title && !chrome.nativeTitle;
  const customIdentity = showTitle && chrome.headerIdentity;
  // A page that follows the active computer leads with the switchable computer pill (a tab's
  // identity already carries it); a page bound to one computer shows that computer read-only.
  const switchComputer = !customIdentity && !!ComputerControl && (computerSwitch ?? !!ownScopeControl);
  const accessory = title ? chrome.headerAccessory : undefined;
  // The tab identity row ends with the app-wide command (voice assistant), after the page actions.
  const trailing = customIdentity ? chrome.headerTrailing : undefined;
  const back = !!onBack && !chrome.nativeTitle;
  // The shared project pill replaces a static project name; the computer stays a read-only pill.
  const pills: PageScope | undefined = scope && !customIdentity
    ? { computer: switchComputer ? undefined : scope.computer, project: scopeControl ? undefined : scope.project } : undefined;
  const scoped = !!(pills?.computer || pills?.project);
  const HeaderRow = use(ScreenHeaderRow);
  const inSheet = !!use(SheetGuardContext);
  const { width } = useWindowDimensions();
  const pillCount = (switchComputer ? 1 : 0) + (pills?.computer ? 1 : 0) + (pills?.project ? 1 : 0) + (scopeControl && !customIdentity ? 1 : 0);
  // The character estimate in fitsHeaderRow can be wrong for wide letters or long translations; the
  // hoisted title measures itself, and a title that would be ellipsized gives the row back (this key).
  const fitKey = `${title}|${width}|${fontScale}|${pillCount}|${countActions(actions)}`;
  const [titleWidth, setTitleWidth] = useState<{ key: string; natural?: number; shown?: number }>({ key: "" });
  // Ellipsized: the drawn title is narrower than its own unconstrained line.
  const clipped = titleWidth.key === fitKey && titleWidth.natural !== undefined && titleWidth.shown !== undefined &&
    titleWidth.natural > titleWidth.shown + 0.5;
  // A pushed page with a native title puts its title, scope pills and icon actions in the one top
  // row beside Back when they fit; otherwise the pills (and actions) take a compact row below.
  const hoist = !!(HeaderRow && chrome.nativeTitle && !inSheet && title && !subtitle && !back && pillCount > 0 &&
    !clipped && fitsHeaderRow({ width, fontScale, title, pills: pillCount, actions: countActions(actions) }));
  // Remember (after commit, never during render) that this heading once owned the native top row.
  const [hoisted, setHoisted] = useState(false);
  useLayoutEffect(() => { if (hoist) setHoisted(true); }, [hoist]);
  const measureTitle = (part: "natural" | "shown", value: number) =>
    setTitleWidth((current) => current.key === fitKey && current[part] === value
      ? current : { ...(current.key === fitKey ? current : { key: fitKey }), [part]: value });
  if (hoist) {
    const room = headerRowRoom(width, countActions(actions));
    const identity = (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, width: room, minWidth: 0 }}>
        <Text accessibilityRole="header" numberOfLines={1} style={[uiStyles.title, { flexShrink: 1, maxWidth: "45%" }]}
          onLayout={(event) => measureTitle("shown", event.nativeEvent.layout.width)}>{title}</Text>
        <Text accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden
          onLayout={(event) => measureTitle("natural", event.nativeEvent.layout.width)}
          style={[uiStyles.title, { position: "absolute", opacity: 0, start: 0 }]}>{title}</Text>
        <View style={{ flexDirection: "row", flexWrap: "nowrap", alignItems: "center", gap: space.sm, minWidth: 0, flexShrink: 1 }}>
          {switchComputer && ComputerControl ? <ComputerControl /> : null}
          {scoped ? <ScopePills scope={pills!} /> : null}
          {customIdentity ? null : scopeControl}
        </View>
      </View>
    );
    return <>
      <HeaderRow identity={identity} actions={actions ? <View style={{ flexDirection: "row", alignItems: "center" }}>{actions}</View> : undefined} />
      {context ? <View style={{ paddingTop: space.xs }}>{context}</View> : null}
    </>;
  }
  // Rotated, resized or larger text: hand the top row back to the stack before showing the rows below.
  const releaseHeader = hoisted && HeaderRow ? <HeaderRow identity={null} /> : null;
  if (!showTitle && !subtitle && !scoped && !switchComputer && !context && !scopeControl && !actions && !accessory && !back && !trailing) return null;
  // A custom identity row owns the project control; otherwise the scope row leads the content.
  const ownContext = (scopeControl && !customIdentity) || scoped || switchComputer
    // One line: the pills shrink and ellipsize so the page's icon actions stay on the same row.
    ? <View style={{ flexDirection: "row", flexWrap: showTitle || subtitle ? "wrap" : "nowrap", alignItems: "center", gap: space.sm, minWidth: 0, flexShrink: 1 }}>
        {switchComputer && ComputerControl ? <ComputerControl /> : null}
        {scoped ? <ScopePills scope={pills!} /> : null}{customIdentity ? null : scopeControl}{context}
      </View>
    : context;
  return (
    <PageHeader variant="page" align="start" className="bg-transparent"
      style={[uiStyles.pageHeading, !showTitle && !back && !actions && !accessory && !trailing && { minHeight: 0 }]}>
      {releaseHeader}
      {back ? <HeaderBackButton onPress={onBack!} /> : null}
      {showTitle || subtitle || ownContext ? (
        <PageHeader.Content className="p-0 gap-0" style={[uiStyles.pageIdentity, { flexBasis: 120 * Math.max(1, fontScale) },
          // A scope row alone (native title) shrinks instead of pushing the actions onto a new line.
          !showTitle && !subtitle && { minWidth: 0, flexBasis: 0, flexGrow: 1 }]}>
          {customIdentity ? customIdentity({ title: title!, subtitle, scopeControl }) : (
            <>
              {showTitle ? <PageHeader.Title selectable style={uiStyles.pageTitle}>{title}</PageHeader.Title> : null}
              {subtitle ? <PageHeader.Description selectable style={uiStyles.caption}>{subtitle}</PageHeader.Description> : null}
            </>
          )}
          {ownContext ? (showTitle || subtitle ? <View style={uiStyles.pageContext}>{ownContext}</View> : ownContext) : null}
        </PageHeader.Content>
      ) : null}
      {accessory}
      {actions || trailing ? <PageHeader.Actions className="p-0" style={uiStyles.pageActions}>{actions}{trailing}</PageHeader.Actions> : null}
    </PageHeader>
  );
}

/** Icon actions a page passes as one fragment; each counts as one 48 target in the header. */
export function countActions(actions: ReactNode): number {
  let count = 0;
  Children.forEach(actions, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) count += countActions((child.props as { children?: ReactNode }).children);
    else count += 1;
  });
  return count;
}

/** Width the header row leaves for title and pills: screen gutters, Back and the icon actions. */
export function headerRowRoom(width: number, actions: number): number {
  return Math.max(0, width - space.screen * 2 - metrics.touchTarget * (1 + actions) - space.sm * 2);
}

/**
 * Title and scope pills share the native top row only when the title keeps its words and each pill
 * keeps a readable name; long titles, narrow phones and large text fall back to a second row.
 */
export function fitsHeaderRow({ width, fontScale, title, pills, actions }: {
  width: number; fontScale: number; title: string; pills: number; actions: number;
}): boolean {
  if (fontScale > 1.3) return false;
  const titleWidth = title.length * 9 * Math.max(1, fontScale) + space.sm;
  const pillWidth = 92 * Math.max(1, fontScale);
  return headerRowRoom(width, actions) >= titleWidth + pills * pillWidth + space.sm * pills;
}

export function Screen({
  children,
  title,
  subtitle,
  scope,
  context,
  scopeControl,
  computerSwitch,
  scroll = true,
  query,
  refresh,
  refreshState,
  actions,
  onBack,
  footer,
  onContentViewport,
  contentOwnsBottomInset = false,
}: ScreenProps) {
  const { colors, uiStyles } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const content = useScreenContentInsets();
  const chrome = use(ScreenChrome);
  const heading = useScreenHeading({ title, subtitle, scope, context, scopeControl, computerSwitch, actions, onBack });
  const keyboardVisible = useKeyboardState(state => state.isVisible);
  const { height, fontScale } = useWindowDimensions();
  const [frameHeight, measureFrame] = useScreenHeight(height);
  const [headerHeight, measureHeader] = useScreenHeight(0);
  const footerLimits = screenFooterLimits(frameHeight, fontScale, !scroll && heading ? headerHeight : 0);
  const onRefresh = refresh ?? query?.refetch;
  const ownRefresh = usePullRefresh(refreshState ? undefined : onRefresh);
  const pullRefresh = refreshState ?? ownRefresh;
  // The non-scrolling frame pads the home indicator once for everything below it, except content (a keyboard-aware
  // composer) that reserves it itself. The footer then must not add it again.
  const frameBottomSafe = !scroll && !contentOwnsBottomInset && chrome.bottomSafeArea && !keyboardVisible;
  const actionArea = footer ? <ScrollView
    keyboardShouldPersistTaps="handled"
    automaticallyAdjustKeyboardInsets={false}
    contentInsetAdjustmentBehavior="never"
    style={{ flexGrow: 0, flexShrink: 0, minHeight: 0, maxHeight: footerLimits.maximum,
      backgroundColor: colors.background, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}
    contentContainerStyle={{
      paddingStart: content.left, paddingEnd: content.right,
      paddingTop: space.sm,
      // The non-scrolling frame already pads the floating chrome; here the action area clears it itself.
      paddingBottom: space.sm + (scroll && !keyboardVisible ? chrome.bottomInset : 0) +
        (chrome.bottomSafeArea && !keyboardVisible && (scroll || contentOwnsBottomInset) ? insets.bottom : 0),
    }}>
    <FormActionScrollOwner value>{footer}</FormActionScrollOwner>
  </ScrollView> : null;
  if (!scroll)
    return (
      <KeyboardAvoidingView enabled={!!footer} behavior="padding" automaticOffset style={{ flex: 1 }}>
      <View style={[uiStyles.screen, { paddingBottom: chrome.bottomInset + (frameBottomSafe ? insets.bottom : 0) }]} onLayout={measureFrame}>
        <ScreenFrameInsets value>
          {heading ? <ScreenHeader onLayout={measureHeader}>{heading}</ScreenHeader> : null}
          <ConnectionFeedbackScope>{children}</ConnectionFeedbackScope>
          {actionArea}
        </ScreenFrameInsets>
      </View>
      </KeyboardAvoidingView>
    );
  return (
    <KeyboardAvoidingView enabled={!!footer} behavior="padding" automaticOffset style={{ flex: 1 }}>
    <View style={uiStyles.screen} onLayout={measureFrame}>
      <KeyboardAwareScrollView
        enabled={!footer}
        onLayout={onContentViewport ? ({ nativeEvent: { layout } }) => onContentViewport({
          width: Math.max(0, Math.min(layout.width, metrics.contentWidth) - content.left - content.right),
          height: Math.max(0, layout.height - space.screen - space.lg - (!footer ? content.bottom : 0)),
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
            // Lets a full-area StateView (flex: 1) fill the viewport and center itself.
            flexGrow: 1,
            // Same top inset as ScreenList and the non-scroll header so tab titles do not jump between tabs.
            paddingTop: space.xs,
            paddingLeft: content.left,
            paddingRight: content.right,
            paddingBottom: space.lg + (!footer ? content.bottom : 0),
          },
        ]}
      >
        {heading}
        {/* Sections of one screen share a single connection-level message. */}
        <ConnectionFeedbackScope>{children}</ConnectionFeedbackScope>
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
  const { uiStyles } = useMobileTheme();
  const content = useScreenContentInsets();
  // A landscape notch or cutout wins over the flat gutter; the heading otherwise sits under it.
  return <View style={[uiStyles.header, { paddingLeft: content.left, paddingRight: content.right }]} onLayout={onLayout}>{children}</View>;
}

const CardDepth = createContext(0);

/** Plain task groups align with their page; nesting never multiplies the gutter. */
export function Card({ children, style, variant = "plain" }: CardProps) {
  const { uiStyles } = useMobileTheme();
  const depth = use(CardDepth);
  const surface = variant === "surface";
  return (
    <CardDepth value={depth + 1}>
      <PanelCard
        className={surface ? surfaceClasses : "min-w-0 rounded-none border-0 bg-transparent shadow-none p-0 gap-ui-sm"}
        style={StyleSheet.flatten([
          uiStyles.card,
          !surface && { backgroundColor: "transparent", borderWidth: 0, borderRadius: 0, paddingHorizontal: 0,
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
  const { uiStyles } = useMobileTheme();
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
  const { uiStyles } = useMobileTheme();
  return (
    <View style={StyleSheet.flatten([uiStyles.stack, style])}>
      {children}
    </View>
  );
}

/**
 * Android measures this label a few percent narrower than it draws it, so a short multi-word title
 * that fits was re-broken and its second line clipped. Short titles are kept on one line with
 * no-break spaces; long ones keep normal wrapping.
 */
export function sectionTitleText(text: string): string {
  return text.length <= 32 ? text.replace(/ /g, String.fromCharCode(0xa0)) : text;
}

/** A count is shown as a quiet number only when there is something to count. */
export function sectionCountText(count: number | undefined): string | undefined {
  return count === undefined || !Number.isFinite(count) || count <= 0 ? undefined : String(count);
}

/**
 * The one section header: 12/16 semibold muted label, an optional quiet count (never "(0)"), and a
 * trailing control (info, filter, action) aligned at the end. No rule; spacing separates groups.
 */
export function SectionHeader({ title, count, trailing, flush }: {
  title: string; count?: number; trailing?: ReactNode;
  /** First header of a container with nothing above it (sheet top): drop the group lead-in. */
  flush?: boolean;
}) {
  const { uiStyles } = useMobileTheme();
  const countText = sectionCountText(count);
  return (
    <View style={[uiStyles.sectionHeader, flush && { paddingTop: 0 }]}>
      <Body selectable={false} accessibilityRole="header"
        accessibilityLabel={countText ? `${title}, ${countText}` : title}
        style={[uiStyles.sectionLabel, { flexShrink: 1, minWidth: 0 }]}>
        {sectionTitleText(title)}
        {countText ? <Text style={uiStyles.sectionCount}>{` ${countText}`}</Text> : null}
      </Body>
      {trailing ? <View style={uiStyles.sectionTrailing}>{trailing}</View> : null}
    </View>
  );
}

/** A titled group of rows. Inside a Screen the parent gap plus the header lead-in make the group rhythm. */
export function Section({ title, children }: SectionProps) {
  useMobileTheme();
  // No gap of its own: the header's `rhythm.headerGap` is the one space above the first row.
  return (
    <View>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

export function CodePanel({ children, horizontal = true, style }: CodePanelProps) {
  const { uiStyles } = useMobileTheme();
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
