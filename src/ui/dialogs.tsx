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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function SheetSurface({
  full,
  children,
  style,
}: import("react").PropsWithChildren<{
  full: boolean;
  style: import("react-native").StyleProp<import("react-native").ViewStyle>;
}>) {
  const progress = useOverlayProgress();
  const { height } = useWindowDimensions();
  const animation = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - (progress?.value ?? 1)) * (full ? 24 : height) }],
  }));
  return <Animated.View style={[style, animation]}>{children}</Animated.View>;
}

export function FormActions({
  submitLabel,
  onSubmit,
  onCancel,
  cancelLabel,
  cancelDisabled,
  busy,
  disabled,
  tone = "primary",
}: FormActionsProps) {
  const copy = useCopy();
  return (
    <Row>
      <Button label={submitLabel} onPress={onSubmit} busy={busy} disabled={disabled} tone={tone} />
      {onCancel ? (
        <Button
          label={cancelLabel ?? copy("Vazgeç", "Cancel")}
          onPress={onCancel}
          disabled={cancelDisabled || busy}
          tone="quiet"
        />
      ) : null}
    </Row>
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
  const insets = useSafeAreaInsets();
  const copy = useCopy();
  const { height } = useWindowDimensions();
  const heading = useRef<View>(null);
  const guards = useSheetGuards();
  const [confirming, setConfirming] = useState(false);
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
    paddingTop: space.lg,
    paddingStart: Math.max(space.screen, insets.left),
    paddingEnd: Math.max(space.screen, insets.right),
    paddingBottom: space.lg + insets.bottom,
  };
  const body = (
    <>
      {children}
      {footer ? (
        <View
          style={{
            gap: space.sm,
            paddingTop: space.lg,
            paddingStart: scroll ? 0 : Math.max(space.screen, insets.left),
            paddingEnd: scroll ? 0 : Math.max(space.screen, insets.right),
            paddingBottom: scroll ? 0 : space.lg,
          }}
        >
          {footer}
        </View>
      ) : null}
    </>
  );
  return (
    <ScreenOverlay visible={visible} onClose={requestClose}>
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
                height: 4,
                width: 32,
                borderRadius: radii.badge,
                backgroundColor: colors.border,
                alignSelf: "center",
                marginBottom: space.xs,
              }}
            />
          ) : null}
          <SheetGuardContext.Provider value={guardContext}>
            <View
              style={[
                uiStyles.header,
                {
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: space.xs,
                  paddingLeft: Math.max(space.screen, insets.left),
                  paddingRight: Math.max(space.screen, insets.right),
                  borderBottomWidth: 1,
                  borderBottomColor: colors.separator,
                },
              ]}
            >
              <View
                ref={heading}
                accessible
                accessibilityRole="header"
                accessibilityLabel={title}
                style={uiStyles.grow}
              >
                <Heading accessible={false} style={uiStyles.title}>
                  {title}
                </Heading>
              </View>
              {headerAction ?? (
                <IconButton
                  label={copy("Kapat", "Close")}
                  onPress={requestClose}
                  disabled={!canClose}
                >
                  <X size={20} color={colors.muted} />
                </IconButton>
              )}
            </View>
            {scroll ? (
              // The outer frame owns keyboard geometry. A second keyboard-aware
              // scroller would add the IME height again and scroll short forms away.
              <ScrollView
                style={{ flexShrink: 1, flexGrow: full ? 1 : 0 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={process.env.EXPO_OS === "ios" ? "interactive" : "on-drag"}
                automaticallyAdjustKeyboardInsets={false}
                contentInsetAdjustmentBehavior="never"
                contentContainerStyle={[uiStyles.content, bodyStyle]}
              >
                {body}
              </ScrollView>
            ) : (
              <View
                style={{
                  flexShrink: 1,
                  flexGrow: size === "compact" ? 0 : 1,
                  paddingBottom: insets.bottom,
                }}
              >
                {body}
              </View>
            )}
          </SheetGuardContext.Provider>
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
