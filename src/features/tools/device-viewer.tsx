import { deviceSystemLabel } from "./device-system";
import { useEffect, useMemo, useRef, useState } from "react";
import { PixelRatio, View } from "react-native";
import AppWindow from "lucide-react-native/icons/app-window";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import House from "lucide-react-native/icons/house";
import Keyboard from "lucide-react-native/icons/keyboard";
import Layers from "lucide-react-native/icons/layers";
import Pause from "lucide-react-native/icons/pause";
import Play from "lucide-react-native/icons/play";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import Wrench from "lucide-react-native/icons/wrench";
import { liveFrameInterval, paceFrame, type FramePace } from "./device-frame-pace";
import { fitFrameWidth, frameDimensions } from "./device-frame-size";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { isReviewedMachine } from "@/state/reviewed-machine";
import { isTransientConnectionError } from "@/state/query-retry";
import { useDataSaverActive } from "@/state/data-saver";
import { useInfoHint } from "@/ui/info-hint";
import {
  StatusText,
  Body,
  Button,
  ChoiceChip,
  Field,
  FormActions,
  IconButton,
  Loading,
  MutationState,
  QueryState,
  Row,
  Sheet,
  StateView,
  StatusLine,
} from "@/ui/primitives";
import { ActionMenu } from "@/ui/overflow-menu";
import { RemoteFrame } from "@/ui/remote-frame";
import { useCopy } from "@/ui/copy";
import type { DeviceAction, DeviceFrame, DeviceSummary } from "./types";
import { DeviceRuntime } from "./device-runtime";
import { DevicePreviewSheet } from "./device-preview";
import {
  DEVICE_VIEWER_CAPABILITY,
  appTargetValid,
  frameBlocker,
  knownAppName,
  recentApps,
  rememberApp,
  suggestedApps,
  viewerFrameEdge,
} from "./device-viewer-model";
import { useMobileTheme } from "@/ui/theme";
import { gapIcon, iconSize, space } from "@/ui/tokens";

/** "failed": the answer was lost or late, so the device may still be starting; "rejected": it is not. */
export type DeviceBootChange = "pending" | "done" | "failed" | "rejected";

/** Whether a failed start request may still have started the device. */
export function bootOutcomeUnknown(error: unknown): boolean {
  const failure = error as { uncertain?: boolean; hostDeadline?: boolean; kind?: string } | null | undefined;
  return !!failure?.uncertain || !!failure?.hostDeadline || failure?.kind === "timeout" || isTransientConnectionError(error);
}

/** A first frame slower than this gets a line saying why it can take a while. */
const SLOW_FRAME_MS = 8_000;

/**
 * Near-fullscreen view of one device: the screen fitted to the available area and one compact
 * control bar (back, home, recent apps, keyboard, refresh, More). Control follows the computer's
 * own setting, so there is no take or release step: touch acts directly when the Host allows it,
 * otherwise it is view only. Advanced work (open app, Expo preview, rotation, device service)
 * lives in More, each with a line saying what it does.
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
  onBootChange?: (deviceId: string, state: DeviceBootChange) => void;
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
  // Scaled frames and the system keys need a Host that knows them; older Hosts keep full frames.
  const viewer = !!machine?.capabilities?.includes(DEVICE_VIEWER_CAPABILITY);
  const [sheet, setSheet] = useState<"runtime" | "preview" | "type" | "open">();
  // Live by default only when frames are small enough to stream; a full-size frame is refreshed on request.
  const [live, setLive] = useState(viewer);
  const [app, setApp] = useState("");
  const [appTouched, setAppTouched] = useState(false);
  const [text, setText] = useState("");
  const [landscape, setLandscape] = useState(false);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const pending = useRef(false);
  const boot = useHostMutation<DeviceSummary>("devices.boot", ["devices"]);
  const action = useHostMutation<string>("devices.action", [
    "devices",
    "capture",
    projectId,
    device.id,
  ]);
  // Fixed once the area is known so a layout change does not start a new request key.
  const [maxEdge, setMaxEdge] = useState<number>();
  // Data saver asks for smaller frames (one image pixel per layout point) and polls half as often.
  const dataSaver = useDataSaverActive();
  useEffect(() => {
    if (viewer && maxEdge === undefined && area.width > 0 && area.height > 0)
      setMaxEdge(viewerFrameEdge(area, dataSaver ? 1 : PixelRatio.get()));
  }, [viewer, maxEdge, area, dataSaver]);
  // Static screens back off; any change, action, refresh or toggle returns to the base rate.
  const pace = useRef<FramePace | undefined>(undefined);
  // The last tap, key, refresh or Live toggle; a viewer left alone polls slower (see liveFrameInterval).
  const lastInput = useRef<number | undefined>(undefined);
  const wake = () => {
    pace.current = undefined;
    lastInput.current = Date.now();
  };
  const frame = useHostQuery<DeviceFrame>(
    ["devices", "capture", projectId, device.id, maxEdge ?? "full"],
    "devices.capture",
    { projectId, deviceId: device.id, ...(maxEdge ? { maxEdge } : {}) },
    {
      enabled: current() && device.booted && !action.isPending && (!viewer || maxEdge !== undefined),
      // A sheet over the screen hides it, so Live waits until the sheet closes.
      interval: live && !sheet
        ? (data) => {
            if (data) pace.current = paceFrame(pace.current, data);
            lastInput.current ??= Date.now();
            const interval = liveFrameInterval(pace.current, Date.now() - lastInput.current);
            return dataSaver ? interval * 2 : interval;
          }
        : undefined,
    },
  );
  const frameUri = useMemo(
    () => (frame.data ? `data:${frame.data.mime};base64,${frame.data.base64}` : undefined),
    [frame.data?.mime, frame.data?.base64],
  );
  const size = useMemo(
    () =>
      !frame.data
        ? undefined
        : // A scaled frame carries its source size, which has the same aspect as the image.
          frame.data.sourceWidth && frame.data.sourceHeight
          ? { width: frame.data.sourceWidth, height: frame.data.sourceHeight }
          : frameDimensions(frame.data.mime, frame.data.base64),
    [frame.data?.mime, frame.data?.base64, frame.data?.sourceWidth, frame.data?.sourceHeight],
  );
  // A slow first frame says why instead of spinning without explanation.
  const waiting = device.booted && !frameUri && !frame.error;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!waiting) return;
    const timer = setTimeout(() => setSlow(true), SLOW_FRAME_MS);
    return () => clearTimeout(timer);
  }, [waiting]);
  const busy = boot.isPending || action.isPending;
  const booting = boot.isPending || starting;
  const enabled = current() && canControl && !viewOnly && device.booted && !busy;
  const touchable = canControl && !viewOnly && device.platform === "android";
  const send = (command: DeviceAction) => {
    if (!current() || !enabled || pending.current) return;
    pending.current = true;
    wake();
    void action
      .mutateAsync({ projectId, deviceId: device.id, action: command })
      .then(() => {
        if (!current()) return;
        if (command.type === "type") {
          setText((latest) => (latest === command.text ? "" : latest));
          setSheet((open) => (open === "type" ? undefined : open));
        }
        if (command.type === "openApp") {
          rememberApp(opening.machineId ?? undefined, device.platform, command.app);
          setSheet((open) => (open === "open" ? undefined : open));
        }
        if (command.type === "rotate") setLandscape(command.orientation === "landscape");
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
      .catch((cause) => {
        // A lost or late answer may still be starting the device: say so quietly and let the list
        // reconcile. A definite refusal shows at once with its error and the start action.
        onBootChange?.(device.id, bootOutcomeUnknown(cause) ? "failed" : "rejected");
      })
      .finally(() => {
        pending.current = false;
      });
  };
  const refreshFrame = () => {
    if (!current()) return;
    wake();
    void frame.refetch();
  };
  // Live paused under the sheet; catch the screen up once it is visible again.
  const closeSheet = () => {
    setSheet(undefined);
    if (!action.isPending) refreshFrame();
  };
  const fitted = fitFrameWidth(area, size);
  // The frame tells the real orientation; the last rotate request only fills in before the first frame.
  const isLandscape = size ? size.width > size.height : landscape;
  const blocker = frame.error ? frameBlocker(frame.error) : undefined;
  // Optional help sits behind the info icon; the missing device tools keep a visible line with its fix.
  const touchHint = useInfoHint(!viewOnly && canControl && !touchable ? copy(
    "Ekrana dokunma yalnızca Android’de çalışır; düğmeler ve Diğer menüsü kullanılabilir.",
    "Tapping the screen works on Android only; the buttons and More still work.",
  ) : undefined);
  const controlReason = !canControl
    ? copy("Cihaz araçları kurulu değil", "Device tools are not set up")
    : undefined;
  const appValid = appTargetValid(app, device.platform);
  const appChoices = [...new Set([...recentApps(opening.machineId ?? undefined, device.platform), ...suggestedApps(device.platform)])];
  const refreshInBar = viewOnly || !viewer;
  const bar = device.booted ? (
    <Row style={{ flexWrap: "nowrap", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
      {!viewOnly ? (
        <>
          {viewer ? (
            <IconButton label={copy("Geri", "Back")} reserveTouchTarget disabled={!enabled}
              onPress={() => send({ type: "key", key: "back" })}>
              <ArrowLeft size={iconSize.action} color={colors.accent} />
            </IconButton>
          ) : null}
          <IconButton label={copy("Ana ekran", "Home")} reserveTouchTarget disabled={!enabled}
            onPress={() => send({ type: "home" })}>
            <House size={iconSize.action} color={colors.accent} />
          </IconButton>
          {viewer ? (
            <IconButton label={copy("Son uygulamalar", "Recent apps")} reserveTouchTarget disabled={!enabled}
              onPress={() => send({ type: "key", key: "appSwitcher" })}>
              <Layers size={iconSize.action} color={colors.accent} />
            </IconButton>
          ) : null}
          <IconButton label={copy("Metin yaz", "Type text")} reserveTouchTarget disabled={!enabled}
            onPress={() => setSheet("type")}>
            <Keyboard size={iconSize.action} color={colors.accent} />
          </IconButton>
        </>
      ) : null}
      {/* With the system keys the bar is full, so Refresh moves into More; Live is the frequent switch. */}
      {refreshInBar ? (
        <IconButton
          label={copy("Ekranı yenile", "Refresh screen")}
          reserveTouchTarget
          busy={frame.isFetching}
          disabled={!current() || busy}
          onPress={refreshFrame}
        >
          <RefreshCw size={iconSize.action} color={colors.accent} />
        </IconButton>
      ) : null}
      <IconButton
        label={live ? copy("Canlı görüntüyü duraklat", "Pause live view") : copy("Canlı görüntü", "Live view")}
        reserveTouchTarget
        expanded={live}
        onPress={() => {
          wake();
          setLive((value) => !value);
        }}
      >
        {live ? <Pause size={iconSize.action} color={colors.accent} /> : <Play size={iconSize.action} color={colors.accent} />}
      </IconButton>
      {viewOnly ? null : (
        <ActionMenu
          label={copy("Diğer", "More")}
          reserveTouchTarget
          trigger={<Ellipsis size={iconSize.action} color={colors.muted} />}
          actions={[
            {
              key: "open",
              label: copy("Uygulama aç", "Open app"),
              detail: controlReason ?? copy("Yüklü bir uygulamayı paket veya paket kimliğiyle başlatır.", "Launch an installed app by its package or bundle ID."),
              icon: <AppWindow />,
              opens: true,
              disabled: !enabled,
              onPress: () => setSheet("open"),
            },
            {
              key: "preview",
              label: copy("Expo önizlemesi", "Expo preview"),
              detail: copy("Projenin geliştirme sunucusunu bu cihazda Expo Go ile açar.", "Open your project's dev server in Expo Go on this device."),
              icon: <Play />,
              opens: true,
              disabled: !current() || busy,
              onPress: () => setSheet("preview"),
            },
            viewer ? {
              key: "rotate",
              label: isLandscape ? copy("Dikey çevir", "Rotate to portrait") : copy("Yatay çevir", "Rotate to landscape"),
              detail: controlReason,
              icon: <RotateCw />,
              disabled: !enabled,
              onPress: () => send({ type: "rotate", orientation: isLandscape ? "portrait" : "landscape" }),
            } : null,
            refreshInBar ? null : {
              key: "refresh",
              label: copy("Ekranı yenile", "Refresh screen"),
              icon: <RefreshCw />,
              disabled: !current() || busy || frame.isFetching,
              onPress: refreshFrame,
            },
            {
              key: "service",
              label: copy("Cihaz servisi", "Device service"),
              detail: copy("Emülatör başlatma, önizleme ve ajan erişimi.", "Starting emulators, previews and agent access."),
              icon: <Wrench />,
              opens: true,
              disabled: !current() || busy,
              onPress: () => setSheet("runtime"),
            },
          ].filter((item): item is NonNullable<typeof item> => !!item)}
        />
      )}
    </Row>
  ) : !viewOnly && !booting ? (
    <Button label={copy("Cihazı başlat", "Boot device")} tone="primary" fullWidth disabled={!current()} onPress={startBoot} />
  ) : undefined;
  return (
    <Sheet visible title={device.name} size="full" scroll={false} footer={bar} onClose={onClose}>
      <View style={{ flex: 1, paddingHorizontal: space.screen, gap: gapIcon }}>
        <Row>
          <Body muted style={[uiStyles.caption, uiStyles.grow]}>
            {deviceSystemLabel(device)}
          </Body>
          {device.booted ? touchHint.button : null}
          <StatusText
            label={device.booted ? copy("Hazır", "Ready") : booting ? copy("Başlatılıyor", "Starting") : copy("Kapalı", "Off")}
            tone={device.booted ? "success" : booting ? "live" : "default"}
          />
        </Row>
        {sheet === "runtime" ? (
          <DeviceRuntime
            projectId={opening.projectId}
            deviceId={opening.deviceId}
            onClose={() => {
              setSheet(undefined);
              refreshFrame();
            }}
          />
        ) : null}
        {sheet === "preview" ? (
          <DevicePreviewSheet
            projectId={opening.projectId}
            device={device}
            onClose={closeSheet}
          />
        ) : null}
        {sheet === "type" ? (
          <Sheet visible title={copy("Metin yaz", "Type text")} size="form" dirty={!!text} onClose={closeSheet}>
            <Body muted style={uiStyles.caption}>
              {copy(
                "Metin cihazda odaklanmış alana yazılır. Önce ekranda bir alana dokun.",
                "The text goes into the field that is focused on the device. Tap a field on the screen first.",
              )}
            </Body>
            <Field
              label={copy("Metin", "Text")}
              value={text}
              multiline
              maxLength={4096}
              onChangeText={setText}
            />
            <FormActions
              submitLabel={copy("Metni yaz", "Type text")}
              busy={action.isPending}
              disabled={!enabled || !text}
              onSubmit={() => send({ type: "type", text })}
              feedback={<>
                {!text ? <Body muted style={uiStyles.caption}>{copy("Yazılacak metni gir.", "Enter the text to type.")}</Body> : null}
                {controlReason ? <Body muted style={uiStyles.caption}>{controlReason}</Body> : null}
                <MutationState mutation={action} />
              </>}
            />
          </Sheet>
        ) : null}
        {sheet === "open" ? (
          <Sheet visible title={copy("Uygulama aç", "Open app")} size="form" onClose={closeSheet}>
            <Body muted style={uiStyles.caption}>
              {device.platform === "android"
                ? copy(
                    "Cihazda yüklü bir uygulamayı paket adıyla açar, örneğin com.android.chrome. Ayarlar için “Settings” yazabilirsin.",
                    "Opens an app installed on the device by its package name, such as com.android.chrome. Type “Settings” for system settings.",
                  )
                : copy(
                    "Simülatörde yüklü bir uygulamayı paket kimliğiyle açar, örneğin com.apple.mobilesafari.",
                    "Opens an app installed on the simulator by its bundle ID, such as com.apple.mobilesafari.",
                  )}
            </Body>
            <Field
              label={device.platform === "android" ? copy("Paket adı", "Package name") : copy("Paket kimliği", "Bundle ID")}
              value={app}
              placeholder={device.platform === "android" ? "com.example.app" : "com.example.App"}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setApp}
              onBlur={() => setAppTouched(true)}
              error={appTouched && app.trim() && !appValid
                ? copy("Noktalarla ayrılmış bir kimlik gir, örneğin com.example.app.", "Enter a dotted ID such as com.example.app.")
                : undefined}
            />
            <Row style={{ flexWrap: "wrap", gap: space.sm }}>
              {appChoices.map((choice) => (
                <ChoiceChip key={choice} label={knownAppName(choice, copy) ?? choice}
                  accessibilityLabel={knownAppName(choice, copy) ? `${knownAppName(choice, copy)}, ${choice}` : choice}
                  selected={app.trim() === choice} onPress={() => setApp(choice)} />
              ))}
            </Row>
            <FormActions
              submitLabel={copy("Uygulamayı aç", "Open app")}
              busy={action.isPending}
              disabled={!enabled || !appValid}
              onSubmit={() => send({ type: "openApp", app: app.trim() })}
              feedback={<>
                {!app.trim() ? <Body muted style={uiStyles.caption}>{copy("Bir kimlik gir veya yukarıdan seç.", "Enter an ID or pick one above.")}</Body> : null}
                {controlReason ? <Body muted style={uiStyles.caption}>{controlReason}</Body> : null}
                <MutationState mutation={action} />
              </>}
            />
          </Sheet>
        ) : null}
        {!device.booted ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.md }}>
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
            {!viewOnly && !canControl ? <StatusLine
              label={copy("Yalnızca görüntüleme. Dokunmak ve yazmak için cihaz araçlarını kur.", "View only. Set up the device tools to tap and type.")}
              action={{ label: copy("Cihaz servisi", "Device service"), onPress: () => setSheet("runtime") }} /> : null}
            <View
              style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
              onLayout={(event) => setArea(event.nativeEvent.layout)}
            >
              {current() && frameUri ? (
                <View style={{ width: fitted || "100%" }}>
                  <RemoteFrame
                    uri={frameUri}
                    label={copy("Cihaz ekranı", "Device screen")}
                    // A scaled frame still maps taps to device pixels.
                    width={frame.data?.sourceWidth}
                    height={frame.data?.sourceHeight}
                    disabled={!enabled}
                    onPress={touchable ? (point) => send({ type: "press", ...point }) : undefined}
                  />
                </View>
              ) : blocker === "service-stopped" && !viewOnly ? (
                <StateView
                  title={copy("Cihaz servisi durdu", "Device service is stopped")}
                  description={copy(
                    "Bu bilgisayar ekranı cihaz servisi üzerinden gösteriyor. Başlatınca ekran burada görünür.",
                    "This computer shows the screen through the device service. Start it and the screen appears here.",
                  )}
                  action={{ label: copy("Cihaz servisini aç", "Open device service"), onPress: () => setSheet("runtime") }}
                />
              ) : blocker === "device-off" ? (
                <StateView
                  title={copy("Cihaz kapalı", "Device is off")}
                  description={copy("Listeyi yenile; cihaz kapandıysa yeniden başlat.", "Refresh the list; if the device shut down, start it again.")}
                  action={{ label: copy("Tekrar dene", "Try again"), onPress: refreshFrame }}
                />
              ) : waiting ? (
                <View style={{ alignItems: "center", gap: space.sm }}>
                  <Loading centered immediate label={copy("Ekran yükleniyor…", "Loading the screen…")} />
                  {slow ? (
                    <Body muted style={[uiStyles.caption, { textAlign: "center" }]}>
                      {copy(
                        "Hâlâ bekleniyor. Uzak bağlantılarda ve büyük ekranlarda ilk görüntü daha uzun sürebilir.",
                        "Still waiting. Over a remote connection or with a large screen, the first image can take longer.",
                      )}
                    </Body>
                  ) : null}
                </View>
              ) : (
                <QueryState query={frame} size="region" loading="centered"
                  loadingLabel={copy("Ekran yükleniyor…", "Loading the screen…")} />
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
