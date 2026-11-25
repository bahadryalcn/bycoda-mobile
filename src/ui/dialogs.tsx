import { scrollKeyboardDismissMode } from "./scroll-keyboard";
import { useMobileTheme } from "./theme";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Heading } from "./typography";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type HostInstance, type ScrollViewInstance } from "react-native";
import { createContext, useContext, useId, useLayoutEffect, useSyncExternalStore, useCallback, useMemo, useRef, useState } from "react";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import X from "lucide-react-native/icons/x";
import { Card } from "./layout";
import { Button, IconButton } from "./buttons";
import { metrics, radii } from "./tokens";
import { space } from "./tokens";
import { useCopy } from "./copy";
import type { FormActionsProps, ConfirmationCardProps, SheetProps } from "./component-props";
import { ScreenOverlay, useOverlayProgress } from "./overlays";
import { ConnectionFeedbackScope } from "./connection-feedback-scope";
import { ScreenFrameInsets } from "./screen-content-insets";
import { SheetGuardContext, useSheetDismissal, useSheetGuards } from "./sheet-guard";
import { useNativeSheetFocus } from "./use-native-sheet-focus";
import { createSheetActionsStore } from "./sheet-actions-store";
import { FormActionRow } from "./form-action-row";
import { UnsavedBadge } from "./unsaved-badge";
import { useAdaptiveLayout } from "./adaptive-layout";
import { sheetCardMaxHeight, sheetPresentation } from "./sheet-layout-model";
import { useKeyCommand } from "../../modules/bycoda-key-commands";
import { useKeepFocusedFieldVisible } from "./use-sheet-focused-field";
import { SectionErrorBoundary } from "./error-boundary";
import { ScreenScopeControl } from "./screen-chrome";

const SheetActionsContext = createContext<ReturnType<typeof createSheetActionsStore> | null>(null);

/** Editors retain their state; only their action presentation moves to the footer. */
export function FormActions(props: FormActionsProps) {
  const sheetActions = useContext(SheetActionsContext);
  const store = props.placement === "inline" ? null : sheetActions;
  const id = useId();
  useLayoutEffect(() => { store?.set(id, props); }, [store, id, props]);
  useLayoutEffect(() => () => { store?.remove(id); }, [store, id]);
  return store ? null : <FormActionRow {...props} />;
}

function SheetActionArea({ store, footer, bottom, maxHeight, dirty }: {
  store: ReturnType<typeof createSheetActionsStore>;
  footer: import("react").ReactNode;
  bottom: number;
  maxHeight: number;
  dirty: boolean;
}) {
  const { colors } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const entries = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const content = !!footer || entries.length > 0;
  // A FormActions row that reports its own dirtiness shows the pill itself.
  const showDirty = dirty && content && !entries.some(([, actions]) => actions.dirty);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      automaticallyAdjustKeyboardInsets={false}
      contentInsetAdjustmentBehavior="never"
      style={{ flexGrow: 0, flexShrink: 0, minHeight: content ? Math.min(maxHeight, metrics.touchTarget) : 0,
        maxHeight, borderTopWidth: content ? StyleSheet.hairlineWidth : 0,
        borderTopColor: colors.border, backgroundColor: colors.panel }}
      contentContainerStyle={{
      // Actions stay in the same centered column as the header and body on wide screens.
      width: "100%",
      maxWidth: metrics.contentWidth,
      alignSelf: "center",
      paddingStart: Math.max(space.screen, insets.left),
      paddingEnd: Math.max(space.screen, insets.right),
      paddingTop: content ? space.md : 0,
      paddingBottom: (keyboardVisible ? 0 : bottom) + (content ? space.md : 0),
      gap: space.sm,
    }}>
      {showDirty ? <UnsavedBadge /> : null}
      {footer}
      {entries.map(([id, actions]) => <FormActionRow key={id} {...actions} scrollFeedback={false} feedbackPlacement="after" />)}
    </ScrollView>
  );
}

function SheetSurface({
  full,
  children,
  style,
}: import("react").PropsWithChildren<{
  /** Full sheets and tablet cards settle with a short rise; bottom sheets slide in from the edge. */
  full: boolean;
  style: import("react-native").StyleProp<import("react-native").ViewStyle>;
}>) {
  useMobileTheme();
  const progress = useOverlayProgress();
  const { height } = useWindowDimensions();
  const animation = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - (progress?.value ?? 1)) * (full ? 24 : height) }],
  }));
  return <Animated.View style={[style, animation]}>{children}</Animated.View>;
}

export function ConfirmationCard({
  message,
  children,
  cancelLabel,
  onCancel,
  confirmLabel,
  onConfirm,
  busy,
  disabled,
  tone = "danger",
  additionalActions,
}: ConfirmationCardProps) {
  useMobileTheme();
  return (
    <Card>
      {message ? <Body>{message}</Body> : null}
      {children}
      {/* Same action stack as FormActionRow: long labels and large text keep their full width. */}
      <View style={{ gap: space.xs, alignItems: "stretch" }}>
        <Button
          label={confirmLabel}
          onPress={onConfirm}
          busy={busy}
          disabled={disabled}
          tone={tone}
          fullWidth
        />
        {additionalActions}
        <Button label={cancelLabel} onPress={onCancel} disabled={busy} tone="quiet" style={{ alignSelf: "center" }} />
      </View>
    </Card>
  );
}

export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
  headerAction,
  size = "form",
  scroll = true,
  dismissible = true,
  dirty = false,
  dismissalRetryKey,
  discardTitle,
  discardMessage,
  returnFocusRef,
}: SheetProps) {
  const { colors, uiStyles } = useMobileTheme();
  const parentSheet = useContext(SheetGuardContext);
  const parentSheetRef = useRef(parentSheet);
  parentSheetRef.current = parentSheet;
  const insets = useSafeAreaInsets();
  const copy = useCopy();
  const { height, fontScale } = useWindowDimensions();
  const [frameHeight, setFrameHeight] = useState(height);
  const [headerHeight, setHeaderHeight] = useState(metrics.touchTarget);
  const heading = useRef<HostInstance>(null);
  const body = useRef<ScrollViewInstance>(null);
  const guards = useSheetGuards();
  const [actionsStore] = useState(createSheetActionsStore);
  const canClose = dismissible && !guards.pending;
  const { confirming, requestClose, requestCloseThen, cancelClose, confirmClose } = useSheetDismissal({
    visible, dirty: dirty || guards.dirty, pending: !canClose, onClose, dismissalRetryKey,
  });
  const blocked = !canClose || !!parentSheet?.blocked;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const requestCloseStackThen = useCallback((afterClose: () => void) => {
    if (blockedRef.current) return;
    requestCloseThen(() => {
      const parent = parentSheetRef.current;
      if (parent) (parent.requestCloseStackThen ?? parent.requestCloseThen)(afterClose);
      else afterClose();
    });
  }, [requestCloseThen]);
  const guardContext = useMemo(
    () => ({ register: guards.register, requestClose, requestCloseThen, requestCloseStackThen, blocked }),
    [guards.register, requestClose, requestCloseThen, requestCloseStackThen, blocked],
  );
  const full = size === "full";
  const { tablet } = useAdaptiveLayout();
  const presentation = sheetPresentation(tablet, full);
  const card = presentation === "card";
  // Hardware Escape closes the topmost sheet; a later-mounted nested sheet registers last and wins.
  useKeyCommand({ key: "Escape", title: copy("Kapat", "Close"), enabled: visible && canClose, priority: 50 }, requestClose);
  // A caller-owned list/reader needs a definite viewport for virtualization.
  // Ordinary forms use our scroller and can fit their intrinsic content.
  const fill = full || (size === "form" && !scroll);
  // The inner frame is measured after the existing keyboard owner applies its
  // padding. Reserve an input-sized body, sharing space when both regions need
  // to scroll, rather than allowing a tall footer to collapse the editor.
  const sheetHeight = card
    ? sheetCardMaxHeight(height, frameHeight, space.lg)
    : Math.min(frameHeight, !full && size === "form" ? height * 0.9 : frameHeight);
  const topChrome = full ? insets.top : card ? space.xs : space.sm;
  // Long identities remain readable in their own viewport instead of consuming
  // the body. The title scrolls in full (no line clamp) and the close/action
  // target stays outside that scroller at the top, even at large text sizes.
  const headerMaximum = Math.max(metrics.touchTarget, Math.min(metrics.touchTarget * 2, Math.max(0, sheetHeight - topChrome) / 3));
  const usableHeight = Math.max(0, sheetHeight - topChrome - headerHeight);
  // A compact sheet (a question, a short choice) fits its content; only forms reserve an input-sized body.
  const bodyMinimum = size === "compact" ? 0
    : Math.min(usableHeight / 2, metrics.inputHeight * Math.max(1, fontScale) + space.sm + space.lg);
  const actionsMaximum = Math.max(0, usableHeight - bodyMinimum);
  useNativeSheetFocus(visible, heading, returnFocusRef);
  // The focused field stays visible above the keyboard and the action area.
  const trackBodyScroll = useKeepFocusedFieldVisible(body, visible && scroll);
  const bodyStyle = {
    paddingTop: space.sm,
    paddingStart: Math.max(space.screen, insets.left),
    paddingEnd: Math.max(space.screen, insets.right),
    paddingBottom: size === "compact" ? space.md : space.xl,
  };
  // One broken block inside the body never removes the whole sheet or the screen under it.
  // A sheet is its own surface: the page route's project pill never appears in its headings.
  const content = <ScreenScopeControl value={undefined}><SectionErrorBoundary scope="sheet">{children}</SectionErrorBoundary></ScreenScopeControl>;
  return (
    <ScreenOverlay visible={visible} label={title} onClose={requestClose}>
      <KeyboardAvoidingView
        behavior="padding"
        automaticOffset
        style={{
          flex: 1,
          justifyContent: card ? "center" : "flex-end",
          paddingTop: full ? 0 : card ? space.lg : insets.top + space.lg,
          paddingBottom: card ? space.lg : 0,
          backgroundColor: full ? colors.background : colors.scrim,
        }}
      >
        <View style={{ flex: 1, justifyContent: card ? "center" : "flex-end" }}
          onLayout={({ nativeEvent: { layout } }) => setFrameHeight((current) =>
            Math.abs(current - layout.height) < 1 ? current : layout.height)}>
        {!full ? (
          <Pressable
            accessible={false}
            onPress={requestClose}
            disabled={!canClose}
            style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0 }}
          />
        ) : null}
        <SheetSurface
          full={full || card}
          style={{
            backgroundColor: colors.panel,
            borderWidth: full ? 0 : StyleSheet.hairlineWidth,
            borderColor: colors.border,
            paddingTop: full ? insets.top : card ? space.xs : space.sm,
            borderTopStartRadius: full ? 0 : radii.sheet,
            borderTopEndRadius: full ? 0 : radii.sheet,
            borderBottomStartRadius: card ? radii.sheet : 0,
            borderBottomEndRadius: card ? radii.sheet : 0,
            overflow: "hidden",
            maxHeight: sheetHeight,
            // Forms fit short content; their maximum still reserves the route
            // context above. Caller-owned scrollers retain a definite viewport.
            height: full ? "100%" : fill ? sheetHeight : undefined,
            flexShrink: 1,
            width: "100%",
            maxWidth: full ? undefined : card ? metrics.sheetCardWidth : metrics.contentWidth,
            alignSelf: "center",
          }}
        >
          {/* A sheet is not inside the page frame that pads the home indicator, even when opened from it. */}
          <ScreenFrameInsets value={false}>
          <SheetActionsContext.Provider value={actionsStore}>
          <SheetGuardContext.Provider value={guardContext}>
          {/* Sections of one sheet share a single connection-level message. */}
          <ConnectionFeedbackScope>
            <View
              onLayout={({ nativeEvent: { layout } }) => setHeaderHeight((current) =>
                Math.abs(current - layout.height) < 1 ? current : layout.height)}
              style={[
                uiStyles.header,
                {
                  flexDirection: "row",
                  alignItems: "flex-start",
                  paddingVertical: space.xs,
                  paddingLeft: Math.max(space.screen, insets.left),
                  paddingRight: Math.max(space.sm, insets.right),
                },
              ]}
            >
              <View
                ref={heading}
                accessible
                accessibilityLabel={title}
                style={[uiStyles.grow, { maxHeight: headerMaximum }]}
              >
                <ScrollView style={{ flexGrow: 0, flexShrink: 1, maxHeight: headerMaximum }}
                  keyboardShouldPersistTaps="handled" nestedScrollEnabled
                  contentContainerStyle={{ minHeight: metrics.touchTarget, justifyContent: "center" }}>
                  <Heading style={[uiStyles.title, { fontWeight: "700" }]}>
                    {title}
                  </Heading>
                </ScrollView>
              </View>
              {headerAction ?? (
                <IconButton
                  label={copy("Kapat", "Close")}
                  reserveTouchTarget
                  onPress={requestClose}
                  disabled={!canClose}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: radii.pill,
                      backgroundColor: colors.fill,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <X size={16} strokeWidth={2.6} color={colors.muted} />
                  </View>
                </IconButton>
              )}
            </View>
            {scroll ? (
              // The outer frame owns keyboard geometry. A second keyboard-aware
              // scroller would add the IME height again and scroll short forms away.
              <ScrollView
                ref={body}
                onScroll={trackBodyScroll}
                scrollEventThrottle={16}
                style={{ flexShrink: 1, flexGrow: fill ? 1 : 0,
                  flexBasis: fill ? 0 : undefined, minHeight: bodyMinimum }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={scrollKeyboardDismissMode()}
                automaticallyAdjustKeyboardInsets={false}
                contentInsetAdjustmentBehavior="never"
                contentContainerStyle={[uiStyles.content, bodyStyle]}
              >
                {content}
              </ScrollView>
            ) : (
              <View
                style={{
                  flexShrink: 1,
                  flexGrow: fill ? 1 : 0,
                  flexBasis: fill ? 0 : undefined,
                  minHeight: bodyMinimum,
                }}
              >
                {content}
              </View>
            )}
            <SheetActionArea store={actionsStore} footer={footer} bottom={card ? 0 : insets.bottom} maxHeight={actionsMaximum} dirty={dirty || guards.dirty} />
          </ConnectionFeedbackScope>
          </SheetGuardContext.Provider>
          </SheetActionsContext.Provider>
          </ScreenFrameInsets>
        </SheetSurface>
        </View>
      </KeyboardAvoidingView>
      {confirming ? (
        <Sheet
          visible
          title={discardTitle ?? copy("Değişiklikler kaydedilmedi", "Unsaved changes")}
          size="compact"
          onClose={cancelClose}
        >
          <Body>
            {discardMessage ?? copy(
              "Kaydedilmemiş değişiklikleri silmek istiyor musun?",
              "Discard your unsaved changes?",
            )}
          </Body>
          <FormActions
            submitLabel={copy("Değişiklikleri sil", "Discard changes")}
            tone="danger"
            disabled={!canClose}
            onSubmit={confirmClose}
            cancelLabel={copy("Düzenlemeye devam et", "Keep editing")}
            onCancel={cancelClose}
          />
        </Sheet>
      ) : null}
    </ScreenOverlay>
  );
}
