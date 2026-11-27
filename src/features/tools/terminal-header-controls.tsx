import { View } from "react-native";
import Copy from "lucide-react-native/icons/copy";
import Check from "lucide-react-native/icons/check";
import SquareTerminal from "lucide-react-native/icons/square-terminal";
import type { HostTerminal } from "../../../../src/features/host-tools/terminalTypes";
import { Button, IconButton, SelectRow, Sheet } from "@/ui/primitives";
import { ScopePill } from "@/ui/scope-pill";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, radii, space } from "@/ui/tokens";
import type { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import { terminalShellName, terminalStateLabel } from "./terminal-model";

export function TerminalStatusDot({ running }: { running: boolean }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  return <View accessible accessibilityLabel={terminalStateLabel(running, copy)}
    style={{ width: space.sm, height: space.sm, borderRadius: radii.pill,
      backgroundColor: running ? colors.success : colors.muted }} />;
}

export function TerminalCopyButton({ clipboard, disabled, label }: {
  clipboard: ReturnType<typeof useClipboardFeedback>; disabled?: boolean; label?: string;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  return <IconButton label={clipboard.copied ? copy("Kopyalandı", "Copied") : label ?? copy("Çıktıyı kopyala", "Copy output")}
    reserveTouchTarget disabled={disabled} busy={clipboard.busy} onPress={clipboard.copy}>
    {clipboard.copied ? <Check size={iconSize.action} color={colors.success} /> : <Copy size={iconSize.action} color={colors.muted} />}
  </IconButton>;
}

/** The fields the shared terminal pill and picker show; both terminal tools map their records to it. */
export type TerminalChoice = Pick<HostTerminal, "id" | "name"> & { shell?: string; state: string };

/** The selected terminal as one scope pill in the page identity row; it opens the terminal picker. */
export function TerminalPill({ terminal, expanded, onPress }: { terminal: Pick<TerminalChoice, "name" | "state">; expanded: boolean; onPress: () => void }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const running = terminal.state === "running";
  return <ScopePill icon={<SquareTerminal size={14} color={colors.muted} />} label={terminal.name} expanded={expanded}
    status={<TerminalStatusDot running={running} />}
    accessibilityLabel={copy("Terminal: {p0}. Terminal seç veya oluştur.", "Terminal: {p0}. Choose or create a terminal.", { p0: terminal.name })}
    onPress={onPress} />;
}

/** Choose one terminal of this project, or start a new one. */
export function TerminalPickerSheet({ visible, terminals, selectedId, disabled, canCreate, onSelect, onCreate, onClose }: {
  visible: boolean; terminals: readonly TerminalChoice[]; selectedId?: string;
  disabled: boolean; canCreate: boolean; onSelect: (id: string) => void; onCreate: () => void; onClose: () => void;
}) {
  const copy = useCopy();
  return <Sheet visible={visible} size="compact" title={copy("Terminaller", "Terminals")} onClose={onClose}
    footer={<Button label={copy("Terminal oluştur", "Create terminal")} tone="secondary" fullWidth disabled={!canCreate} onPress={onCreate} />}>
    {terminals.map((entry) => <SelectRow key={entry.id} label={entry.name} selected={entry.id === selectedId} disabled={disabled}
      detail={[terminalShellName(entry.shell), terminalStateLabel(entry.state === "running", copy)].filter(Boolean).join(" · ")}
      onPress={() => onSelect(entry.id)} />)}
  </Sheet>;
}
