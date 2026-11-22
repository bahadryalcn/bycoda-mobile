import { useMobileTheme } from "@/ui/theme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack } from "expo-router";
import { AppState, Linking, StyleSheet, View } from "react-native";
import { useBackHandler } from "panelui-native/hooks/use-back-handler";
import { CameraView, useCameraPermissions, type PermissionResponse } from "expo-camera";
import { duringSystemPrompt } from "@/state/system-prompt";
import { useIsFocused } from "expo-router/react-navigation";
import { useAsyncAction } from "@/state/actions";
import { useSecurity } from "@/state/security";
import {
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
import { HintLabel } from "@/ui/info-hint";
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
  const [, requestPermission, refreshPermission] = useCameraPermissions({ get: false });
  const [permissionCheck, setPermissionCheck] = useState<{
    owner: object;
    permission?: PermissionResponse;
    error?: Error;
  }>();
  const requested = useRef(false);
  const permissionAction = useAsyncAction();
  const scan = useAsyncAction();
  const latched = useRef(false);
  const leaving = useRef(false);
  const session = useRef(0);
  const available = focused && foreground && unlocked;
  const permissionOwner = useMemo(() => ({}), [available, cameraRevision]);
  const currentPermissionOwner = useRef(permissionOwner);
  currentPermissionOwner.current = permissionOwner;
  const checked = permissionCheck?.owner === permissionOwner ? permissionCheck : undefined;
  const permission = checked?.permission;
  const cameraOwner = useMemo(() => ({}), [permissionOwner, cameraFailed, permission?.granted, scan.isError]);
  const currentCamera = useRef(cameraOwner);
  currentCamera.current = cameraOwner;
  const active = useRef(available);
  active.current = available && !leaving.current;
  // Reason: invalidate asynchronous camera work when screen ownership changes.
  useEffect(() => {
    active.current = available && !leaving.current;
    session.current++;
    return () => { active.current = false; session.current++; };
  }, [available]);
  const retryPermission = () => setCameraRevision((revision) => revision + 1);
  const requestAccess = useCallback((owner: object, generation: number) => permissionAction.run(async () => {
    if (!active.current || generation !== session.current || currentPermissionOwner.current !== owner) return;
    requested.current = true;
    const next = await duringSystemPrompt(requestPermission);
    if (!active.current) return;
    if (generation === session.current && currentPermissionOwner.current === owner) {
      setPermissionCheck({ owner, permission: next });
    } else {
      // Android may blur for its own permission prompt. Recheck the new foreground owner.
      setCameraRevision((revision) => revision + 1);
    }
  }), [requestPermission, permissionAction.run]);
  // Reason: a fresh permission read belongs to the current foreground owner, independently of opening Settings.
  useEffect(() => {
    if (!available) return;
    const generation = session.current;
    const stillOwnsRead = () => active.current && generation === session.current && currentPermissionOwner.current === permissionOwner;
    void refreshPermission().then((current) => {
      if (!stillOwnsRead()) return;
      setPermissionCheck({ owner: permissionOwner, permission: current });
      if (!requested.current && current.status === "undetermined" && current.canAskAgain) {
        void requestAccess(permissionOwner, generation);
      }
    }, (error: unknown) => {
      if (stillOwnsRead()) {
        setPermissionCheck({ owner: permissionOwner, error: error instanceof Error ? error : new Error(String(error)) });
      }
    });
  }, [available, permissionOwner, refreshPermission, requestAccess]);
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
    <Screen onContentViewport={measureViewport}>
      <Stack.Screen options={{ title: copy("QR kodu tara", "Scan QR code"), headerLeft: () => <HeaderBackButton onPress={() => leave(onClose)} /> }} />
      <Animated.View entering={enterItem(0)} style={{ width: "100%", maxWidth: metrics.entryWidth, alignSelf: "center", gap: space.lg }}>
      <View onLayout={event => setIntroHeight(event.nativeEvent.layout.height)}>
        <HintLabel label={copy("Bağlantı kodu", "Pairing code")} always help={copy(
          "Bilgisayarındaki bycoda bağlantı QR kodunu kameraya göster.",
          "Point the camera at the pairing QR code in bycoda on your computer.",
        )} />
      </View>
      {available && !permission && !checked?.error ? <Loading label={copy("Kamera hazırlanıyor…", "Preparing camera…")} /> : null}
      {permission && !permission.granted ? (
        <StateView
          illustration="permission"
          title={copy("Kamera", "Camera")}
          action={{
            label: permission.canAskAgain
              ? copy("Kameraya izin ver", "Allow camera")
              : copy("Kamera ayarlarını aç", "Open camera settings"),
            busy: permissionAction.isPending,
            reserveTouchTarget: true,
            onPress: () => {
              const generation = session.current;
              if (permission.canAskAgain) {
                void requestAccess(permissionOwner, generation);
                return;
              }
              void permissionAction.run(async () => {
                if (active.current && generation === session.current && currentPermissionOwner.current === permissionOwner) {
                  await Linking.openSettings();
                }
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
            key={cameraRevision}
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
      <ErrorNotice error={checked?.error ?? (!permission?.granted ? permissionAction.error : undefined)}
        retrying={permissionAction.isPending} onRetry={() => {
          permissionAction.reset();
          retryPermission();
        }} />
      {scan.isError ? <ErrorNotice error={scan.error}
        retryLabel={copy("Yeniden tara", "Scan again")}
        onRetry={() => { if (active.current && !scan.isPending) { scan.reset(); latched.current = false; } }}
      /> : <MutationState mutation={scan} /> }
      <Button
        label={copy("Kodu yapıştır", "Paste pairing code")}
        tone="secondary" fullWidth reserveTouchTarget disabled={scan.isPending}
        onPress={() => leave(onPaste)}
      />
      </View>
      </Animated.View>
    </Screen>
  );
}
