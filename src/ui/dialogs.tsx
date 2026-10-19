import { useMobileTheme } from "./theme";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Heading } from "./typography";
import {
  AccessibilityInfo,
  findNodeHandle,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { createContext, useContext, useId, useLayoutEffect, useSyncExternalStore, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import X from "lucide-react-native/icons/x";
import { Card, Row } from "./layout";
import { Button, IconButton } from "./buttons";
import { colors, metrics, radii } from "./tokens";
import { space } from "./tokens";
import { uiStyles } from "./styles";
import { useCopy } from "./copy";
import type { FormActionsProps, ConfirmationCardProps, SheetProps } from "./component-props";
import { ScreenOverlay, useOverlayProgress } from "./overlays";
import { SheetGuardContext, useSheetGuards } from "./sheet-guard";
import { useSecurity } from "@/state/security";
import { createSheetActionsStore } from "./sheet-actions-store";

const SheetActionsContext = createContext<ReturnType<typeof createSheetActionsStore> | null>(null);

/** Editors retain their state; only their action presentation moves to the footer. */
export function FormActions(props: FormActionsProps) {
  const store = useContext(SheetActionsContext);
  const id = useId();
  useLayoutEffect(() => { store?.set(id, props); }, [store, id, props]);
  useLayoutEffect(() => () => { store?.remove(id); }, [store, id]);
  return store ? null : <FormActionRow {...props} />;
}

function SheetActionArea({ store, footer, bottom }: {
  store: ReturnType<typeof createSheetActionsStore>;
  footer: import("react").ReactNode;
  bottom: number;
}) {
  useMobileTheme();
  const insets = useSafeAreaInsets();
  const entries = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const content = !!footer || entries.length > 0;
  return (
    <View style={{
      flexShrink: 0,
      paddingStart: Math.max(space.screen, insets.left),
      paddingEnd: Math.max(space.screen, insets.right),
      paddingTop: content ? space.md : 0,
      paddingBottom: bottom + (content ? space.md : 0),
      gap: space.sm,
      borderTopWidth: content ? 1 : 0,
      borderTopColor: colors.separator,
      backgroundColor: colors.panel,
    }}>
      {footer}
      {entries.map(([id, actions]) => <FormActionRow key={id} {...actions} />)}
    </View>
  );
}

function SheetSurface({
  full,
  children,
  style,
}: import("react").PropsWithChildren<{
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

function FormActionRow({
  feedback,
  submitLabel,
  onSubmit,
  onCancel,
  cancelLabel,
  cancelDisabled,
  busy,
  disabled,
  tone = "primary",
}: FormActionsProps) {
  useMobileTheme();
  const copy = useCopy();
  const { height } = useWindowDimensions();
  return (
    <View style={{ gap: space.sm }}>
    {feedback ? <ScrollView
      style={{ maxHeight: Math.max(metrics.touchTarget, height * 0.25), flexShrink: 1 }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: space.sm }}
    >{feedback}</ScrollView> : null}
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      <Button label={submitLabel} onPress={onSubmit} busy={busy} disabled={disabled} tone={tone} style={{ flexGrow: 1, flexBasis: 160, minWidth: 0 }} />
      {onCancel ? (
        <Button
          label={cancelLabel ?? copy("Vazgeç", "Cancel")}
          onPress={onCancel}
          disabled={cancelDisabled || busy}
          tone="quiet"
          style={{ flexGrow: 1, flexBasis: 96, minWidth: 0 }}
        />
      ) : null}
    </View>
    </View>
  );
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
      <Row>
        <Button label={cancelLabel} onPress={onCancel} disabled={busy} tone="quiet" />
        <Button
          label={confirmLabel}
          onPress={onConfirm}
          busy={busy}
          disabled={disabled}
          tone={tone}
        />
        {additionalActions}
      </Row>
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
  returnFocusRef,
}: SheetProps) {
  useMobileTheme();
  const insets = useSafeAreaInsets();
  const copy = useCopy();
  const { height } = useWindowDimensions();
  const heading = useRef<View>(null);
  const guards = useSheetGuards();
  const [confirming, setConfirming] = useState(false);
  const [actionsStore] = useState(createSheetActionsStore);
  const canClose = dismissible && !guards.pending;
  const requestClose = useCallback(() => {
    if (!canClose) return;
    if (dirty || guards.dirty) setConfirming(true);
    else onClose();
  }, [canClose, dirty, guards.dirty, onClose]);
  const guardContext = useMemo(
    () => ({ register: guards.register, requestClose }),
    [guards.register, requestClose],
  );
  const full = size === "full";
  useEffect(() => {
    if (!visible) setConfirming(false);
  }, [visible]);
  useEffect(() => {
    if (!visible || process.env.EXPO_OS === "web") return;
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (!enabled || !active) return;
      requestAnimationFrame(() => {
        if (!active || useSecurity.getState().status !== "unlocked") return;
        const tag = findNodeHandle(heading.current);
        if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
      });
    });
    return () => {
      active = false;
      requestAnimationFrame(() => {
        if (useSecurity.getState().status !== "unlocked") return;
        const tag = returnFocusRef?.current && findNodeHandle(returnFocusRef.current);
        if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
      });
    };
  }, [visible, returnFocusRef]);
  const bodyStyle = {
    paddingTop: space.sm,
    paddingStart: Math.max(space.screen, insets.left),
    paddingEnd: Math.max(space.screen, insets.right),
    paddingBottom: space.lg,
  };
  return (
    <ScreenOverlay visible={visible} label={title} onClose={requestClose}>
      <KeyboardAvoidingView
        behavior="padding"
        automaticOffset
        style={{
          flex: 1,
          justifyContent: "flex-end",
          paddingTop: full ? 0 : insets.top + space.lg,
          backgroundColor: full ? colors.background : colors.scrim,
        }}
      >
        {!full ? (
          <Pressable
            accessible={false}
            onPress={requestClose}
            disabled={!canClose}
            style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0 }}
          />
        ) : null}
        <SheetSurface
          full={full}
          style={{
            backgroundColor: colors.panel,
            paddingTop: full ? insets.top : space.sm,
            borderTopStartRadius: full ? 0 : radii.sheet,
            borderTopEndRadius: full ? 0 : radii.sheet,
            overflow: "hidden",
            maxHeight: full
              ? height
              : Math.min(height - insets.top - space.lg, size === "form" ? height * 0.9 : height),
            height: full ? "100%" : size === "form" && !scroll ? height * 0.9 : undefined,
            flexShrink: 1,
            width: "100%",
            maxWidth: full ? undefined : metrics.contentWidth,
            alignSelf: "center",
          }}
        >
          {!full ? (
            <View
              accessible={false}
              style={{
                height: 5,
                width: 36,
                borderRadius: radii.pill,
                backgroundColor: colors.tertiary,
                alignSelf: "center",
                marginBottom: space.xs,
              }}
            />
          ) : null}
          <SheetActionsContext.Provider value={actionsStore}>
          <SheetGuardContext.Provider value={guardContext}>
            <View
              style={[
                uiStyles.header,
                {
                  flexDirection: "row",
                  alignItems: "center",
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
                style={uiStyles.grow}
              >
                <Heading style={[uiStyles.title, { fontWeight: "700" }]}>
                  {title}
                </Heading>
              </View>
              {headerAction ?? (
                <IconButton
                  label={copy("Kapat", "Close")}
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
                style={{ flexShrink: 1, flexGrow: full ? 1 : 0, minHeight: 0 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={process.env.EXPO_OS === "ios" ? "interactive" : "on-drag"}
                automaticallyAdjustKeyboardInsets={false}
                contentInsetAdjustmentBehavior="never"
                contentContainerStyle={[uiStyles.content, bodyStyle]}
              >
                {children}
              </ScrollView>
            ) : (
              <View
                style={{
                  flexShrink: 1,
                  flexGrow: size === "compact" ? 0 : 1,
                  minHeight: 0,
                }}
              >
                {children}
              </View>
            )}
            <SheetActionArea store={actionsStore} footer={footer} bottom={insets.bottom} />
          </SheetGuardContext.Provider>
          </SheetActionsContext.Provider>
        </SheetSurface>
      </KeyboardAvoidingView>
      {confirming ? (
        <Sheet
          visible
          title={copy("Değişiklikler kaydedilmedi", "Unsaved changes")}
          size="compact"
          onClose={() => setConfirming(false)}
        >
          <Body>
            {copy(
              "Kaydedilmemiş değişiklikleri silmek istiyor musun?",
              "Discard your unsaved changes?",
            )}
          </Body>
          <FormActions
            submitLabel={copy("Değişiklikleri sil", "Discard changes")}
            tone="danger"
            onSubmit={() => {
              setConfirming(false);
              onClose();
            }}
            cancelLabel={copy("Düzenlemeye devam et", "Keep editing")}
            onCancel={() => setConfirming(false)}
          />
        </Sheet>
      ) : null}
    </ScreenOverlay>
  );
}
