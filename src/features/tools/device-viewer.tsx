import { useRef, useState } from "react";
import House from "lucide-react-native/icons/house";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useMachines } from "@/state/machines";
import {
  Badge, Body, Button, Disclosure, Field, IconButton, MutationState, Notice, QueryState, Row, Sheet, ToggleField, NavigationGroup,
} from "@/ui/primitives";
import { RemoteFrame } from "@/ui/remote-frame";
import { useCopy } from "@/ui/copy";
import { colors } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import type { DeviceAction, DeviceFrame, DeviceSummary } from "./types";

export function DeviceViewer({ projectId, device, canControl, onDevice, onClose }: {
  projectId: string;
  device: DeviceSummary;
  canControl: boolean;
  onDevice: (device: DeviceSummary) => void;
  onClose: () => void;
}) {
  const copy = useCopy();
  const machineId = useMachines((state) => state.activeId);
  const [control, setControl] = useState(false);
  const [live, setLive] = useState(false);
  const [app, setApp] = useState("");
  const [text, setText] = useState("");
  const [element, setElement] = useState("");
  const pending = useRef(false);
  const boot = useHostMutation<DeviceSummary>("devices.boot", ["devices"]);
  const action = useHostMutation<string>("devices.action", ["devices", "capture", projectId, device.id]);
  const frame = useHostQuery<DeviceFrame>(
    ["devices", "capture", projectId, device.id], "devices.capture", { projectId, deviceId: device.id },
    { enabled: device.booted && !action.isPending, interval: live ? 3_000 : undefined },
  );
  const busy = boot.isPending || action.isPending;
  const enabled = control && canControl && device.booted && !busy;
  const send = (input: DeviceAction) => {
    if (!enabled || pending.current) return;
    pending.current = true;
    void action.mutateAsync({ projectId, deviceId: device.id, action: input }).then(() => {
      if (input.type === "type" && useMachines.getState().activeId === machineId) setText("");
    }).catch(() => {}).finally(() => { pending.current = false; });
  };
  return (
    <Sheet visible title={device.name} size="full" dismissible={!busy} onClose={onClose}>
      <Row>
        <Body muted style={[uiStyles.caption, uiStyles.grow]}>{`${device.platform} ${device.version}`}</Body>
        <Badge label={device.booted ? copy("Hazır", "Ready") : copy("Kapalı", "Off")} tone={device.booted ? "active" : "default"} />
      </Row>
      {!device.booted ? <Button label={copy("Cihazı başlat", "Boot device")} tone="primary" busy={boot.isPending} onPress={() => {
        if (pending.current) return;
        pending.current = true;
        void boot.mutateAsync({ projectId, deviceId: device.id }).then((result) => {
          if (useMachines.getState().activeId === machineId) onDevice(result);
        }).catch(() => {}).finally(() => { pending.current = false; });
      }} /> : null}
      <MutationState mutation={boot} />
      {device.booted ? <>
        <Row style={{ justifyContent: "flex-end" }}>
          <IconButton label={copy("Ana ekran", "Home")} disabled={!enabled} onPress={() => send({ type: "home" })}>
            <House size={22} strokeWidth={2} color={colors.accent} />
          </IconButton>
          <IconButton label={copy("Ekranı yenile", "Refresh screen")} busy={frame.isFetching} disabled={busy} onPress={() => { void frame.refetch(); }}>
            <RefreshCw size={22} strokeWidth={2} color={colors.accent} />
          </IconButton>
        </Row>
        <NavigationGroup>
          <ToggleField label={copy("Canlı görüntü", "Live view")} value={live} onChange={setLive} />
          <ToggleField label={copy("Cihazı kontrol et", "Control device")} value={control} disabled={!canControl} onChange={setControl} />
        </NavigationGroup>
        {!canControl ? <Notice message={copy("Cihaz kontrolünü önce bilgisayardaki bycoda’dan etkinleştir.", "Enable device control in bycoda on your computer first.")} /> : null}
        <QueryState query={frame} />
        {frame.data ? <RemoteFrame
          uri={`data:${frame.data.mime};base64,${frame.data.base64}`}
          label={copy("Cihaz ekranı", "Device screen")}
          disabled={!enabled}
          onPress={device.platform === "android" ? (point) => send({ type: "press", ...point }) : undefined}
        /> : null}
        <MutationState mutation={action} />
        <Disclosure label={copy("Kontroller", "Controls")}>
          <Field label={copy("Uygulama veya paket kimliği", "App or bundle ID")} value={app} autoCapitalize="none" autoCorrect={false} onChangeText={setApp} />
          <Button label={copy("Uygulamayı aç", "Open app")} disabled={!enabled || !app.trim()} onPress={() => send({ type: "openApp", app: app.trim() })} />
          <Field label={copy("Metin", "Text")} value={text} multiline maxLength={4096} onChangeText={setText} />
          <Button label={copy("Metni yaz", "Type text")} disabled={!enabled || !text} onPress={() => send({ type: "type", text })} />
          <Field label={copy("Kontrol etiketi", "Element label")} value={element} onChangeText={setElement} />
          <Button label={copy("Etikete dokun", "Press element")} disabled={!enabled || !element.trim()} onPress={() => send({ type: "pressElement", label: element.trim() })} />
        </Disclosure>
      </> : null}
    </Sheet>
  );
}
