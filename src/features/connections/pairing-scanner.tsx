import { useMobileTheme } from "@/ui/theme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack } from "expo-router";
import { AppState, Linking, StyleSheet, View } from "react-native";
import { useBackHandler } from "panelui-native/hooks/use-back-handler";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useIsFocused } from "expo-router/react-navigation";
import { useAsyncAction } from "@/state/actions";
import { useSecurity } from "@/state/security";
import {
  Body,
  Button,
  ErrorNotice,
  HeaderBackButton,
  Loading,
  MutationState,
  Screen,
  StateView,
} from "@/ui/primitives";
import { metrics, radii, space } from "@/ui/tokens";
import { enterItem } from "@/ui/motion";
import Animated from "react-native-reanimated";
import { useCopy } from "@/ui/copy";
import type { PairingScannerProps } from "./connection-types";

export function PairingScanner({ onCode, onClose, onPaste }: PairingScannerProps) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const focused = useIsFocused();
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [introHeight, setIntroHeight] = useState(0);
  const [feedbackHeight, setFeedbackHeight] = useState(0);
  const measureViewport = useCallback((next: { width: number; height: number }) =>
    setViewport(current => current?.width === next.width && current.height === next.height ? current : next), []);
  const cameraSide = viewport ? Math.min(viewport.width, metrics.entryWidth,
    Math.max(metrics.touchTarget, viewport.height - introHeight - feedbackHeight - 2 * space.lg)) : undefined;
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [cameraRevision, setCameraRevision] = useState(0);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const requested = useRef(false);
  const permissionAction = useAsyncAction();
  const scan = useAsyncAction();
  const latched = useRef(false);
  const leaving = useRef(false);
  const session = useRef(0);
  const available = focused && foreground && unlocked;
  const cameraOwner = useMemo(() => ({}), [available, cameraFailed, permission?.granted, scan.isError, cameraRevision]);
  const currentCamera = useRef(cameraOwner);
  currentCamera.current = cameraOwner;
  const active = useRef(available);
  active.current = available && !leaving.current;
  useEffect(() => {
    active.current = available && !leaving.current;
    session.current++;
    return () => { active.current = false; session.current++; };
  }, [available]);
  const refresh = useCallback(() => {
    const owner = session.current;
    return permissionAction.run(async () => {
      if (!active.current || owner !== session.current) return;
      const current = await refreshPermission();
      if (!active.current || owner !== session.current) return;
      if (!requested.current && current.status === "undetermined" && current.canAskAgain) {
        requested.current = true;
        await requestPermission();
      }
    });
  }, [refreshPermission, requestPermission, permissionAction.run]);
  useEffect(() => {
    if (available) void refresh();
  }, [available, refresh]);
  const leave = (next: () => void) => {
    leaving.current = true;
    active.current = false;
    session.current++;
    next();
  };
  useBackHandler(focused, () => leave(onClose));

  // Native camera sessions are mounted only while this screen can receive input.
  useEffect(() => {
    const changed = AppState.addEventListener("change", (state) =>
      { if (state !== "active") { active.current = false; session.current++; setCameraRevision(value => value + 1); } setForeground(state === "active"); },
    );
    const blurred =
      process.env.EXPO_OS === "android"
        ? AppState.addEventListener("blur", () => { active.current = false; session.current++; setCameraRevision(value => value + 1); setForeground(false); })
        : null;
    const returned =
      process.env.EXPO_OS === "android"
        ? AppState.addEventListener("focus", () =>
            setForeground(AppState.currentState === "active"),
          )
        : null;
    return () => {
      changed.remove();
      blurred?.remove();
      returned?.remove();
    };
  }, []);

  return (
    <Screen onContentViewport={measureViewport} footer={<Button
      label={copy("Bunun yerine yapıştır", "Paste instead")}
      tone="quiet" onPress={() => leave(onPaste)}
    />}>
      <Stack.Screen options={{ title: copy("QR kodu tara", "Scan QR code"), headerLeft: () => <HeaderBackButton onPress={() => leave(onClose)} /> }} />
      <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <Body muted onLayout={event => setIntroHeight(event.nativeEvent.layout.height)} style={{ textAlign: "center" }}>
        {copy(
          "Bilgisayarındaki Bycoda bağlantı QR kodunu kameraya göster.",
          "Point the camera at the pairing QR code in Bycoda on your computer.",
        )}
      </Body>
      {!permission && !permissionAction.isError ? <Loading label={copy("Kamera hazırlanıyor…", "Preparing camera…")} /> : null}
      {permission && !permission.granted ? (
        <StateView
          illustration="permission"
          title={copy("Erişim gerekli", "Access needed")}
          description={copy(
            "QR kodunu okumak için kamera izni gerekiyor.",
            "Camera access is needed to read the QR code.",
          )}
          action={{
            label: permission.canAskAgain
              ? copy("Kameraya izin ver", "Allow camera")
              : copy("Kamera ayarlarını aç", "Open camera settings"),
            busy: permissionAction.isPending,
            onPress: () => {
              const owner = session.current;
              void permissionAction.run(async () => {
                if (!active.current || owner !== session.current) return;
                if (permission.canAskAgain) { requested.current = true; await requestPermission(); }
                else await Linking.openSettings();
              });
            },
          }}
        />
      ) : null}
      {permission?.granted && foreground && unlocked && focused && !cameraFailed && !scan.isError ? (
        <View
          style={{
            width: cameraSide ?? "100%", maxWidth: metrics.entryWidth, alignSelf: "center",
            aspectRatio: 1,
            borderRadius: radii.sheet,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: colors.background,
          }}
        >
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onMountError={() => { if (active.current && currentCamera.current === cameraOwner) setCameraFailed(true); }}
            onBarcodeScanned={
              scan.isPending || scan.isError || latched.current
                ? undefined
                : (result) => {
                    if (!active.current || latched.current || currentCamera.current !== cameraOwner) return;
                    latched.current = true;
                    const owner = session.current;
                    void scan.run(async () => {
                      if (!active.current || owner !== session.current) { latched.current = false; return; }
                      await onCode(result.data);
                    });
                  }
            }
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <View
              style={{
                height: "62%", maxWidth: "62%",
                aspectRatio: 1,
                borderWidth: 3,
                borderColor: colors.primaryText,
                borderRadius: radii.card,
                borderCurve: "continuous",
              }}
            />
          </View>
        </View>
      ) : null}
      <View onLayout={event => setFeedbackHeight(event.nativeEvent.layout.height)} style={{ gap: space.lg }}>
      <ErrorNotice
        onRetry={cameraFailed ? () => setCameraFailed(false) : undefined}
        retryLabel={copy("Kamerayı yeniden aç", "Retry camera")}
        error={
          cameraFailed
            ? copy(
                "Kamera açılamadı. Bağlantı kodunu yapıştırarak devam edebilirsin.",
                "The camera could not start. Paste the pairing code to continue.",
              )
            : null
        }
      />
      <ErrorNotice error={permissionAction.error} retrying={permissionAction.isPending} onRetry={() => { void refresh(); }} />
      {scan.isError ? <ErrorNotice error={scan.error}
        retryLabel={copy("Yeniden tara", "Scan again")}
        onRetry={() => { if (active.current && !scan.isPending) { scan.reset(); latched.current = false; } }}
      /> : <MutationState mutation={scan} /> }
      </View>
      </Animated.View>
    </Screen>
  );
}
