import { useMobileTheme } from "@/ui/theme";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { AppState, BackHandler, Linking, StyleSheet, View } from "react-native";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useIsFocused } from "expo-router/react-navigation";
import { useAsyncAction } from "@/state/actions";
import { useSecurity } from "@/state/security";
import {
  Body,
  Button,
  ErrorNotice,
  IconButton,
  Loading,
  MutationState,
  Notice,
  Screen,
} from "@/ui/primitives";
import { colors, radii, space } from "@/ui/tokens";
import { enterItem } from "@/ui/motion";
import Animated from "react-native-reanimated";
import { useCopy } from "@/ui/copy";
import type { PairingScannerProps } from "./connection-types";

export function PairingScanner({ onCode, onClose, onPaste }: PairingScannerProps) {
  useMobileTheme();
  const copy = useCopy();
  const focused = useIsFocused();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [cameraFailed, setCameraFailed] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const permissionAction = useAsyncAction();
  const scan = useAsyncAction();
  useEffect(() => {
    if (!focused) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
    return () => listener.remove();
  }, [focused, onClose]);

  // Native camera sessions are mounted only while this screen can receive input.
  useEffect(() => {
    const changed = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    const blurred =
      process.env.EXPO_OS === "android"
        ? AppState.addEventListener("blur", () => setForeground(false))
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
    <Screen>
      <Stack.Screen options={{ title: copy("QR kodu tara", "Scan QR code"), headerLeft: () => <IconButton label={copy("Geri", "Back")} onPress={onClose}><ChevronLeft size={22} color={colors.text} /></IconButton> }} />
      <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <Body muted style={{ textAlign: "center" }}>
        {copy(
          "Bilgisayarındaki Bycoda bağlantı QR kodunu kameraya göster.",
          "Point the camera at the pairing QR code in Bycoda on your computer.",
        )}
      </Body>
      {!permission ? <Loading label={copy("Kamera hazırlanıyor…", "Preparing camera…")} /> : null}
      {permission && !permission.granted ? (
        <>
          <Notice
            tone="info"
            message={copy(
              "QR kodunu okumak için kamera izni gerekiyor.",
              "Camera access is needed to read the QR code.",
            )}
          />
          <Button
            label={
              permission.canAskAgain
                ? copy("Kameraya izin ver", "Allow camera")
                : copy("Kamera ayarlarını aç", "Open camera settings")
            }
            busy={permissionAction.isPending}
            tone="primary"
            onPress={() => {
              void permissionAction.run(() =>
                permission.canAskAgain ? requestPermission() : Linking.openSettings(),
              );
            }}
          />
        </>
      ) : null}
      {permission?.granted && foreground && unlocked && focused && !cameraFailed ? (
        <View
          style={{
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
            onMountError={() => setCameraFailed(true)}
            onBarcodeScanned={
              scan.isPending
                ? undefined
                : (result) => {
                    void scan.run(() => onCode(result.data));
                  }
            }
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <View
              style={{
                width: "62%",
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
      <MutationState mutation={permissionAction} />
      <MutationState mutation={scan} />
      <Button
        label={copy("Kodu yapıştır", "Paste pairing code")}
        tone="quiet"
        onPress={onPaste}
        style={{ alignSelf: "center" }}
      />
      </Animated.View>
    </Screen>
  );
}
