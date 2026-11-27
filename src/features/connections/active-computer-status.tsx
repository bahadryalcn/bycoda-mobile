import type { ReactNode } from "react";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import ScanQrCode from "lucide-react-native/icons/scan-qr-code";
import { View } from "react-native";
import { useAsyncAction } from "@/state/actions";
import { retryHostConnection } from "@/state/host-runtime";
import { useCopy } from "@/ui/copy";
import { useMachineStatus } from "@/ui/machine-bar";
import { Body, NavigationRow, RowIcon, StatusText } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";

/** Connected is the normal state: quiet text, no dot. */
const tones = { connected: "default", checking: "info", disconnected: "danger", offline: "danger" } as const;

/**
 * The selected computer's status: one toned status ("Connected", "Offline") with the quiet
 * connection type beside it, and one reason line saying why it is not reachable. Selection itself
 * is shown by the row's check and selected state, not by another word.
 */
export function ActiveComputerStatus({ connection, route }: {
  connection: Pick<ReturnType<typeof useMachineStatus>, "phase" | "status" | "reason">;
  /** Connection type (for example Local network), shown after the status. */
  route?: ReactNode;
}) {
  const { uiStyles } = useMobileTheme();
  const { phase, status, reason } = connection;
  const tone = phase === "connected" || phase === "checking" || phase === "disconnected" || phase === "offline"
    ? tones[phase] : "warning";
  return <View style={{ gap: space.xs }}>
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.xs }}>
      <StatusText label={status} tone={tone} />
      {route ? <><Body muted accessible={false} selectable={false} style={uiStyles.statusText}>·</Body>{route}</> : null}
    </View>
    {reason ? <StatusText label={reason} dot={false} /> : null}
  </View>;
}

/**
 * Retry for the selected computer; pairing problems are fixed by pairing again, not retrying. Shared
 * by the Computers screen and the computer pill's sheet so both offer the same recovery.
 */
export function RetryConnectionRow({ onPair, onRetry }: { onPair: () => void; onRetry?: () => void }) {
  const copy = useCopy();
  const { machine, health, phase, needsPairing } = useMachineStatus();
  const retry = useAsyncAction();
  if (needsPairing) return <NavigationRow icon={<RowIcon glyph={ScanQrCode} />} label={copy("QR kodu tara", "Scan QR code")} onPress={onPair} />;
  if (phase !== "disconnected" && !retry.isPending) return null;
  return <NavigationRow intent="command"
    icon={<RowIcon glyph={RefreshCw} />}
    label={copy("Bağlantıyı yeniden dene", "Retry connection")}
    busy={retry.isPending}
    onPress={() => {
      onRetry?.();
      // Reconnect the live socket now (fresh backoff, also after exhausted re-checks), then re-read.
      if (machine) retryHostConnection(machine.id);
      void retry.run(() => health.refetch({ cancelRefetch: false }));
    }} />;
}
