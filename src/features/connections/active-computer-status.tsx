import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { View } from "react-native";
import { useAsyncAction } from "@/state/actions";
import { IconTile } from "@/ui/icon-tile";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useMachineStatus } from "@/ui/machine-bar";
import { NavigationRow, StatusText } from "@/ui/primitives";
import { space } from "@/ui/tokens";

const tones = { connected: "success", checking: "info", disconnected: "danger", offline: "danger" } as const;

/**
 * The selected computer's row marker: "Selected" identifies the current computer, the status text
 * beside it says whether it is reachable, and one reason line says why not.
 */
export function ActiveComputerStatus() {
  const copy = useCopy();
  const { phase, status, reason } = useMachineStatus();
  const tone = phase === "connected" || phase === "checking" || phase === "disconnected" || phase === "offline"
    ? tones[phase] : "warning";
  return <View style={{ gap: space.xs }}>
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm }}>
      <StatusText label={copy("Seçili", "Selected")} tone="active" dot={false} />
      <StatusText label={status} tone={tone} />
    </View>
    {reason ? <StatusText label={reason} dot={false} /> : null}
  </View>;
}

/** Retry for the selected computer; pairing problems are fixed by pairing again, not retrying. */
export function RetryConnectionRow({ onPair }: { onPair: () => void }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const { health, phase, needsPairing } = useMachineStatus();
  const retry = useAsyncAction();
  if (needsPairing) return <NavigationRow label={copy("QR kodu tara", "Scan QR code")} onPress={onPair} />;
  if (phase !== "disconnected" && !retry.isPending) return null;
  return <NavigationRow intent="command"
    icon={<IconTile><RefreshCw size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
    label={copy("Bağlantıyı yeniden dene", "Retry connection")}
    busy={retry.isPending}
    onPress={() => { void retry.run(() => health.refetch({ cancelRefetch: false })); }} />;
}
