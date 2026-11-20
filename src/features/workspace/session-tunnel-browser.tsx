import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import ArrowRight from "lucide-react-native/icons/arrow-right";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import {
  onTunnelEvent,
  startTunnel,
  stopTunnel,
  tunnelWebViewComponent,
  type TunnelNavigationChange,
  type TunnelWebViewCommands,
} from "../../../modules/bycoda-host-socket";
import { useHostClient } from "@/state/queries";
import { useDataSaverActive } from "@/state/data-saver";
import { useCopy } from "@/ui/copy";
import { Body, Button, IconButton, Loading, Notice, Sheet, StateView } from "@/ui/primitives";
import { usePrivateContentAccess } from "@/ui/private-access";
import { useMobileTheme } from "@/ui/theme";
import { metrics, space } from "@/ui/tokens";
import type { DevServerScan } from "../tools/types";
import {
  resolveTunnelTarget,
  tunnelDisplayUrl,
  tunnelPageUrl,
  type TunnelRefusal,
} from "./session-tunnel-model";

type Live = { tunnelId: string; proxyPort: number; alias: string; port: number; url: string };
type Phase =
  | { kind: "starting" }
  | { kind: "ready"; live: Live }
  | { kind: "failed"; reason: "refused"; refusal: TunnelRefusal }
  | { kind: "failed"; reason: "error"; message?: string };

const noNavigation: TunnelNavigationChange = {
  url: "",
  title: "",
  loading: true,
  canGoBack: false,
  canGoForward: false,
};

/**
 * Phone-side preview of a project dev server: the page renders in a native WebView and its TCP
 * traffic travels through one pinned WSS per connection to the Host. The tunnel lives exactly as
 * long as this sheet (the owner remounts it per session scope); any failure keeps the Host Browser one tap away.
 */
export function SessionTunnelBrowser({
  projectId,
  href,
  onClose,
  onHostBrowser,
}: {
  projectId: string;
  /** The tapped loopback link. */
  href: string;
  onClose: () => void;
  /** Opens the same link in the Host Browser (replaces this sheet). */
  onHostBrowser: (href: string) => void;
}) {
  const copy = useCopy(), { colors } = useMobileTheme(), client = useHostClient();
  const access = usePrivateContentAccess(), dataSaver = useDataSaverActive();
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [nav, setNav] = useState(noNavigation);
  const [loadError, setLoadError] = useState<string>();
  const webView = useRef<TunnelWebViewCommands>(null);
  const WebView = tunnelWebViewComponent();
  const mounted = useRef(true);
  // Effect reason: keeps close/fallback callbacks inert after unmount and across StrictMode remounts.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Effect reason: private content must not stay on screen after the workspace is concealed.
  useEffect(() => { if (!access.allowed) onClose(); }, [access.allowed, onClose]);
  // Effect reason: the tunnel is a native resource owned by this sheet; start on open and always
  // stop on close, unmount or session change (the owner remounts this sheet per request/scope).
  useEffect(() => {
    if (!client) return;
    let cancelled = false, tunnelId: string | undefined;
    const subscription = onTunnelEvent((event) => {
      if (cancelled || event.tunnelId !== tunnelId) return;
      setPhase((current) => current.kind === "failed" ? current
        : event.type === "closed" && current.kind !== "ready" ? current
        : { kind: "failed", reason: "error", message: event.message ?? event.code });
    });
    void (async () => {
      const scan = await client.request<DevServerScan>("devServers.list", { projectId });
      if (cancelled) return;
      if (scan.status !== "ok") throw new Error(scan.error);
      const resolved = resolveTunnelTarget({ href, projectId, servers: scan.servers });
      if (!resolved.ok) { setPhase({ kind: "failed", reason: "refused", refusal: resolved.reason }); return; }
      const grant = await client.tunnelAccess();
      if (cancelled) return;
      if (!grant) throw new Error("The phone tunnel is not available.");
      const started = await startTunnel({ ...grant, target: resolved.value.target });
      tunnelId = started.tunnelId;
      if (cancelled) { void stopTunnel(started.tunnelId).catch(() => {}); return; }
      setPhase({
        kind: "ready",
        live: { ...started, port: resolved.value.target.port, url: tunnelPageUrl(started.alias, resolved.value.target.port, resolved.value.path) },
      });
    })().catch((error: unknown) => {
      if (!cancelled) setPhase({ kind: "failed", reason: "error", message: error instanceof Error ? error.message : undefined });
    });
    return () => {
      cancelled = true;
      subscription.remove();
      if (tunnelId) void stopTunnel(tunnelId).catch(() => {});
    };
  }, [client, projectId, href]);
  const live = phase.kind === "ready" ? phase.live : undefined;
  const address = live ? tunnelDisplayUrl(nav.url || live.url, live.alias, live.port) : href;
  const hostBrowser = () => { if (mounted.current) onHostBrowser(live ? address : href); };
  const failure = phase.kind === "failed" ? failureCopy(phase, copy) : undefined;
  const openExternal = (url: string) => { void Linking.openURL(url).catch(() => setLoadError(copy("Bağlantı açılamadı.", "Could not open the link."))); };
  return <Sheet visible title={copy("Telefonda önizleme", "Preview on this phone")} size="full" scroll={false} onClose={onClose}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.screen, paddingBottom: space.sm }}>
      <IconButton label={copy("Geri", "Back")} density="compact" disabled={!live || !nav.canGoBack} onPress={() => void webView.current?.goBack()}><ArrowLeft size={20} color={colors.muted} /></IconButton>
      <IconButton label={copy("İleri", "Forward")} density="compact" disabled={!live || !nav.canGoForward} onPress={() => void webView.current?.goForward()}><ArrowRight size={20} color={colors.muted} /></IconButton>
      <IconButton label={copy("Yenile", "Reload")} density="compact" disabled={!live} onPress={() => void webView.current?.reload()}><RefreshCw size={20} color={colors.muted} /></IconButton>
      <View style={{ flex: 1, minHeight: metrics.touchTarget, justifyContent: "center" }}><Body mono muted numberOfLines={1}>{address}</Body></View>
      <Button label={copy("Host Tarayıcısında aç", "Open in Host Browser")} tone="quiet" density="compact" onPress={hostBrowser} />
    </View>
    {loadError ? <Notice tone="warning" message={loadError} /> : null}
    {live && WebView ? <WebView ref={webView} style={{ flex: 1 }} proxyPort={live.proxyPort} alias={live.alias} url={live.url} dataSaver={dataSaver}
      onNavigationChange={(event) => setNav(event.nativeEvent)}
      onLoadError={(event) => setLoadError(event.nativeEvent.description || event.nativeEvent.code)}
      onExternalLink={(event) => openExternal(event.nativeEvent.url)} />
      : failure || (live && !WebView) ? <StateView illustration="error" title={failure?.title ?? copy("Telefonda önizleme bu sürümde yok.", "Phone preview is not available in this build.")}
        description={failure?.description} action={{ label: copy("Host Tarayıcısında aç", "Open in Host Browser"), onPress: hostBrowser }} />
      : <Loading label={copy("Önizleme hazırlanıyor", "Preparing preview")} />}
  </Sheet>;
}

function failureCopy(phase: Extract<Phase, { kind: "failed" }>, copy: (tr: string, en: string) => string) {
  if (phase.reason === "error")
    return { title: copy("Telefonda önizleme açılamadı.", "Could not open the preview on this phone."), description: phase.message };
  const refusals: Record<TunnelRefusal, [string, string]> = {
    invalid: ["Bu adres telefonda açılamaz.", "This address cannot be opened on the phone."],
    https: ["HTTPS adresleri telefonda açılamaz.", "HTTPS addresses cannot be opened on the phone."],
    none: ["Bu projede bu adresi sunan çalışan bir sunucu yok.", "No running server in this project serves this address."],
    ambiguous: ["Birden fazla sunucu bu adresle eşleşiyor.", "More than one server matches this address."],
    identity: ["Sunucunun süreç kimliği doğrulanamadı.", "The server's process identity could not be verified."],
  };
  return { title: copy(...refusals[phase.refusal]), description: undefined };
}
