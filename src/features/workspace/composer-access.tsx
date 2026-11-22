import { useState } from "react";
import Lock from "lucide-react-native/icons/lock";
import Pencil from "lucide-react-native/icons/pencil";
import Shield from "lucide-react-native/icons/shield";
import Sparkles from "lucide-react-native/icons/sparkles";
import { ActionMenu } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useModelCatalog } from "@/state/model-catalog";
import { ACCESS_MODES, accessConfigureCommand, unavailableAccessModes } from "./composer-access-model";
import type { SessionCommand } from "./session-types";
import type { HostSession, RuntimeMode } from "./wire";

const ICONS: Record<RuntimeMode, typeof Lock> = {
  supervised: Lock,
  "auto-accept-edits": Pencil,
  auto: Sparkles,
  "full-access": Shield,
};

/**
 * Composer access picker, the phone counterpart of the desktop `AccessPicker`. It uses the
 * permission labels of the session settings and saves through the same Host `configure` command.
 */
export function ComposerAccessMenu({
  session,
  disabled,
  running,
  onCommand,
  onError,
}: {
  session: HostSession;
  disabled: boolean;
  running: boolean;
  onCommand: SessionCommand;
  onError: (error: unknown) => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const [pending, setPending] = useState(false);
  const current = session.session.runtimeMode;
  // Shared with the model chip's catalog query; the Host names modes this harness refuses.
  const catalog = useModelCatalog(session.projectId);
  const unavailable = unavailableAccessModes(catalog.data, session.session.harness);
  const blockedReason = running
    ? copy("Agent çalışırken kullanılamaz", "Not available while the agent is running")
    : undefined;
  const label = (mode: RuntimeMode) =>
    mode === "supervised"
      ? copy("Onay iste", "Ask for approval")
      : mode === "auto-accept-edits"
        ? copy("Düzenlemeleri otomatik kabul et", "Auto-accept edits")
        : mode === "auto"
          ? copy("Otomatik inceleme", "Automatic review")
          : copy("Tam erişim", "Full access");
  const hint = (mode: RuntimeMode) =>
    mode === "supervised"
      ? copy(
          "Komutlardan ve dosya değişikliklerinden önce sorar.",
          "Ask before commands and file changes.",
        )
      : mode === "auto-accept-edits"
        ? copy(
            "Düzenlemeleri otomatik onaylar, diğer işlemlerden önce sorar.",
            "Auto-approve edits, ask before other actions.",
          )
        : mode === "auto"
          ? copy(
              "Bir AI inceleyici işlemleri onaylayabilir veya reddedebilir.",
              "An AI reviewer can approve or deny actions.",
            )
          : copy(
              "Agent komutları ve düzenlemeleri onay beklemeden uygulayabilir.",
              "The agent may run commands and edits without waiting for approval.",
            );
  const choose = (mode: RuntimeMode) => {
    if (mode === current || pending || disabled || blockedReason || unavailable[mode]) return;
    setPending(true);
    onError(null);
    void (async () => {
      try {
        await onCommand(accessConfigureCommand(session, mode));
      } catch (cause) {
        onError(cause);
      } finally {
        setPending(false);
      }
    })();
  };
  const Icon = ICONS[current] ?? Lock;
  return (
    <ActionMenu
      label={`${copy("Erişim", "Access")}: ${label(current)}`}
      reserveTouchTarget
      busy={pending}
      trigger={
        <Icon
          size={18}
          strokeWidth={2.2}
          color={current === "full-access" ? colors.warning : colors.muted}
        />
      }
      actions={ACCESS_MODES.map((mode) => {
        const ModeIcon = ICONS[mode];
        const refused = mode !== current ? unavailable[mode] : undefined;
        return {
          key: mode,
          label: label(mode),
          detail:
            blockedReason ??
            (refused
              ? copy("Kullanılamıyor: {p0}", "Unavailable: {p0}", { p0: refused })
              : hint(mode)),
          icon: <ModeIcon />,
          selected: mode === current,
          disabled: disabled || pending || (!!blockedReason && mode !== current) || !!refused,
          onPress: () => choose(mode),
        };
      })}
    />
  );
}
