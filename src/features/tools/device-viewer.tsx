import { deviceSystemLabel } from "./device-system";
import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import House from "lucide-react-native/icons/house";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { liveFrameInterval, paceFrame, type FramePace } from "./device-frame-pace";
import { fitFrameWidth, frameDimensions } from "./device-frame-size";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { isReviewedMachine } from "@/state/reviewed-machine";
import {
  StatusText,
  Body,
  Button,
  Field,
  IconButton,
  Loading,
  MutationState,
  QueryState,
  Row,
  Sheet,
  StateView,
} from "@/ui/primitives";
import { ActionMenu } from "@/ui/overflow-menu";
import { RemoteFrame } from "@/ui/remote-frame";
import { useCopy } from "@/ui/copy";
import type { DeviceAction, DeviceFrame, DeviceSummary } from "./types";
import { DeviceRuntime } from "./device-runtime";
import { DevicePreviewSheet } from "./device-preview";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, space } from "@/ui/tokens";

/**
 * Near-fullscreen view of one device: slim header (name, status, close), the screen fitted to the
 * available area, and a compact bottom bar. Control follows the computer's own setting, so there
 * is no take or release step: touch acts directly when the Host allows it, otherwise it is view only.
 */
export function DeviceViewer({
  projectId,
  device,
  canControl,
  starting = false,
  viewOnly = false,
  onDevice,
  onBootChange,
  onClose,
}: {
  projectId: string;
  device: DeviceSummary;
  canControl: boolean;
  starting?: boolean;
  /** Live view only: no control, tools or boot. Used from a session. */
  viewOnly?: boolean;
  onDevice: (device: DeviceSummary) => void;
  /** The list shows a device as starting while its start request is open, also after this view closes. */
  onBootChange?: (deviceId: string, state: "pending" | "done" | "failed") => void;
  onClose: () => void;
}) {
  const { uiStyles, colors } = useMobileTheme();
  const copy = useCopy();
  const machineId = useMachines((state) => state.activeId);
  const machine = useActiveMachine();
  const connection = useConnectionScope();
  const [openingConnection] = useState(connection);
  const [opening] = useState(() => ({
    machineId,
    environmentId: machine?.environmentId,
    projectId,
    deviceId: device.id,
  }));
  const current = () =>
    openingConnection.isCurrent() &&
    isReviewedMachine(openingConnection.review, useMachines.getState()) &&
    !!opening.machineId &&
    !!opening.environmentId &&
    machine?.environmentId === opening.environmentId &&
    useMachines.getState().activeId === opening.machineId &&
    machineId === opening.machineId &&
    projectId === opening.projectId &&
    device.id === opening.deviceId;
  const [runtime, setRuntime] = useState(false);
  const [preview, setPreview] = useState(false);
  const [input, setInput] = useState(false);
  const [live, setLive] = useState(false);
  const [app, setApp] = useState("");
  const [text, setText] = useState("");
  const [area, setArea] = useState({ width: 0, height: 0 });
  const pending = useRef(false);
  const boot = useHostMutation<DeviceSummary>("devices.boot", ["devices"]);
  const action = useHostMutation<string>("devices.action", [
    "devices",
    "capture",
    projectId,
    device.id,
  ]);
  // Static screens back off; any change, action, refresh or toggle returns to the base rate.
  const pace = useRef<FramePace | undefined>(undefined);
  const frame = useHostQuery<DeviceFrame>(
    ["devices", "capture", projectId, device.id],
    "devices.capture",
    { projectId, deviceId: device.id },
    {
      enabled: current() && device.booted && !action.isPending,
      interval: live
        ? (data) => {
            if (data) pace.current = paceFrame(pace.current, data);
            return liveFrameInterval(pace.current);
          }
        : undefined,
    },
  );
  const frameUri = useMemo(
    () => (frame.data ? `data:${frame.data.mime};base64,${frame.data.base64}` : undefined),
    [frame.data?.mime, frame.data?.base64],
  );
  const size = useMemo(
    () => (frame.data ? frameDimensions(frame.data.mime, frame.data.base64) : undefined),
    [frame.data?.mime, frame.data?.base64],
  );
  const busy = boot.isPending || action.isPending;
  const booting = boot.isPending || starting;
  const enabled = current() && canControl && !viewOnly && device.booted && !busy;
  const touchable = canControl && !viewOnly && device.platform === "android";
  const send = (command: DeviceAction) => {
    if (!current() || !enabled || pending.current) return;
    pending.current = true;
    pace.current = undefined;
    void action
      .mutateAsync({ projectId, deviceId: device.id, action: command })
      .then(() => {
        if (command.type === "type" && current())
          setText((latest) => (latest === command.text ? "" : latest));
      })
      .catch(() => {})
      .finally(() => {
        pending.current = false;
      });
  };
  const startBoot = () => {
    if (!current() || booting || pending.current) return;
    pending.current = true;
    onBootChange?.(device.id, "pending");
    void boot
      .mutateAsync({ projectId, deviceId: device.id })
      .then((result) => {
        if (current()) onDevice(result);
        onBootChange?.(device.id, "done");
      })
      .catch(() => {
        // The computer may still be starting the device: say so quietly and let the list reconcile.
        onBootChange?.(device.id, "failed");
      })
      .finally(() => {
        pending.current = false;
      });
  };
  const fitted = fitFrameWidth(area, size);
  const note = viewOnly
    ? undefined
    : !canControl
      ? copy("Yalnızca görüntüleme. Cihaz kontrolünü bilgisayardaki bycoda’dan etkinleştir.", "View only. Enable device control in bycoda on your computer.")
      : !touchable
        ? copy("Bu cihazda yalnızca görüntüleme var.", "View only on this device.")
        : undefined;
  const bar = device.booted ? (
    <Row style={{ flexWrap: "nowrap", alignItems: "center", gap: space.sm }}>
      {!viewOnly ? (
        <IconButton
          label={copy("Ana ekran", "Home")}
          reserveTouchTarget
          disabled={!enabled}
          onPress={() => send({ type: "home" })}
        >
          <House size={iconSize.action} color={colors.accent} />
        </IconButton>
      ) : null}
      <IconButton
        label={copy("Ekranı yenile", "Refresh screen")}
        reserveTouchTarget
        busy={frame.isFetching}
        disabled={!current() || busy}
        onPress={() => {
          if (!current()) return;
          pace.current = undefined;
          void frame.refetch();
        }}
      >
        <RefreshCw size={iconSize.action} color={colors.accent} />
      </IconButton>
      <Button
        label={copy("Canlı", "Live")}
        accessibilityLabel={copy("Canlı görüntü", "Live view")}
        tone="quiet"
        selected={live}
        style={{ flex: 1 }}
        onPress={() => {
          pace.current = undefined;
          setLive((value) => !value);
        }}
      />
      {!viewOnly ? (
        <ActionMenu
          label={copy("Diğer işlemler", "More actions")}
          reserveTouchTarget
          trigger={<Ellipsis size={iconSize.action} color={colors.muted} />}
          actions={[
            { key: "input", label: copy("Metin ve uygulama", "Text and apps"), opens: true, disabled: !enabled, onPress: () => setInput(true) },
            { key: "preview", label: copy("Expo önizlemesi", "Expo preview"), opens: true, disabled: !current() || busy, onPress: () => setPreview(true) },
            { key: "service", label: copy("Cihaz servisi", "Device service"), opens: true, disabled: !current() || busy, onPress: () => setRuntime(true) },
          ]}
        />
      ) : null}
    </Row>
  ) : !viewOnly && !booting ? (
    <Button label={copy("Cihazı başlat", "Boot device")} tone="primary" fullWidth disabled={!current()} onPress={startBoot} />
  ) : undefined;
  return (
    <Sheet visible title={device.name} size="full" scroll={false} footer={bar} onClose={onClose}>
      <View style={{ flex: 1, paddingHorizontal: 16, gap: 8 }}>
        <Row>
          <Body muted style={[uiStyles.caption, uiStyles.grow]}>
            {deviceSystemLabel(device)}
          </Body>
          <StatusText
            label={device.booted ? copy("Hazır", "Ready") : booting ? copy("Başlatılıyor", "Starting") : copy("Kapalı", "Off")}
            tone={device.booted ? "live" : booting ? "active" : "default"}
          />
        </Row>
        {runtime ? (
          <DeviceRuntime
            projectId={opening.projectId}
            deviceId={opening.deviceId}
            onClose={() => setRuntime(false)}
          />
        ) : null}
        {preview ? (
          <DevicePreviewSheet
            projectId={opening.projectId}
            device={device}
            onClose={() => setPreview(false)}
          />
        ) : null}
        {input ? (
          <Sheet visible title={copy("Metin ve uygulama", "Text and apps")} size="form" onClose={() => setInput(false)}>
            <Field
              label={copy("Uygulama veya paket kimliği", "App or bundle ID")}
              value={app}
              placeholder="com.example.app"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setApp}
            />
            <Button
              label={copy("Uygulamayı aç", "Open app")}
              fullWidth
              disabled={!enabled || !app.trim()}
              onPress={() => send({ type: "openApp", app: app.trim() })}
            />
            <Field
              label={copy("Metin", "Text")}
              value={text}
              multiline
              maxLength={4096}
              onChangeText={setText}
            />
            <Button
              label={copy("Metni yaz", "Type text")}
              fullWidth
              disabled={!enabled || !text}
              onPress={() => send({ type: "type", text })}
            />
            <MutationState mutation={action} />
          </Sheet>
        ) : null}
        {!device.booted ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
            {booting ? (
              <>
                <Loading centered label={copy("Cihaz başlatılıyor…", "Starting the device…")} immediate />
                <Body muted style={{ textAlign: "center" }}>
                  {copy("Bu birkaç dakika sürebilir. Pencereyi kapatabilirsin; başlatma sürer ve cihaz listesinde görünür.", "This can take a few minutes. You can close this; it keeps starting and shows in the device list.")}
                </Body>
              </>
            ) : (
              <>
                <StateView
                  title={copy("Cihaz kapalı", "Device is off")}
                  description={viewOnly ? undefined : copy("Ekranı görmek ve kullanmak için başlat.", "Start it to see and use its screen.")}
                />
                <MutationState mutation={boot} />
              </>
            )}
          </View>
        ) : (
          <>
            {note ? <Body muted style={uiStyles.caption}>{note}</Body> : null}
            <View
              style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
              onLayout={(event) => setArea(event.nativeEvent.layout)}
            >
              {current() && frameUri ? (
                <View style={{ width: fitted || "100%" }}>
                  <RemoteFrame
                    uri={frameUri}
                    label={copy("Cihaz ekranı", "Device screen")}
                    disabled={!enabled}
                    onPress={touchable ? (point) => send({ type: "press", ...point }) : undefined}
                  />
                </View>
              ) : (
                <QueryState query={frame} size="region" loading="centered"
                  loadingLabel={copy("Cihaz ekranı", "Device screen")} />
              )}
            </View>
            {frameUri ? <QueryState query={frame} loading="none" /> : null}
            <MutationState mutation={action} />
          </>
        )}
      </View>
    </Sheet>
  );
}
