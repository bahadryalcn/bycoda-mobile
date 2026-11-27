import Lock from "lucide-react-native/icons/lock";
import Pencil from "lucide-react-native/icons/pencil";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import Sparkles from "lucide-react-native/icons/sparkles";
import { SelectField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { ACCESS_MODES } from "./composer-access-model";
import type { RuntimeMode } from "./wire";

const ICONS: Record<RuntimeMode, typeof Lock> = {
  supervised: Lock,
  "auto-accept-edits": Pencil,
  auto: Sparkles,
  "full-access": ShieldAlert,
};

/** Localized access labels shared by the field and the composer chip's spoken label. */
export function accessModeLabel(mode: RuntimeMode, copy: ReturnType<typeof useCopy>): string {
  return mode === "supervised"
    ? copy("Onay iste", "Ask for approval")
    : mode === "auto-accept-edits"
      ? copy("Düzenlemeleri otomatik kabul et", "Auto-accept edits")
      : mode === "auto"
        ? copy("Otomatik inceleme", "Automatic review")
        : copy("Tam erişim", "Full access");
}

/**
 * Access (runtime permission mode) inside the model sheet, the phone counterpart of the desktop
 * `AccessPicker`. Choosing a mode only changes the sheet's draft; the sheet's Save sends it with the
 * same Host `configure` command as the model.
 */
export function ComposerAccessField({
  value,
  saved,
  unavailable,
  disabled,
  onChange,
}: {
  value: RuntimeMode;
  /** The session's current mode stays selectable even when the Host now refuses it. */
  saved: RuntimeMode;
  /** Modes this harness refuses on the Host, with the Host's reason. */
  unavailable: Partial<Record<RuntimeMode, string>>;
  disabled: boolean;
  onChange: (mode: RuntimeMode) => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const hint = (mode: RuntimeMode) =>
    mode === "supervised"
      ? copy("Komutlardan ve dosya değişikliklerinden önce sorar.", "Ask before commands and file changes.")
      : mode === "auto-accept-edits"
        ? copy("Düzenlemeleri otomatik onaylar, diğer işlemlerden önce sorar.", "Auto-approve edits, ask before other actions.")
        : mode === "auto"
          ? copy("Bir AI inceleyici işlemleri onaylayabilir veya reddedebilir.", "An AI reviewer can approve or deny actions.")
          : copy(
              "Ajan komutları ve düzenlemeleri onay beklemeden uygulayabilir.",
              "The agent may run commands and edits without waiting for approval.",
            );
  return (
    <SelectField
      label={copy("Erişim", "Access")}
      value={value}
      disabled={disabled}
      options={ACCESS_MODES.map((mode) => {
        const Icon = ICONS[mode];
        const refused = mode !== saved ? unavailable[mode] : undefined;
        return {
          value: mode,
          label: accessModeLabel(mode, copy),
          detail: refused ? copy("Kullanılamıyor: {p0}", "Unavailable: {p0}", { p0: refused }) : hint(mode),
          icon: <Icon size={18} color={mode === "full-access" ? colors.warning : colors.muted} />,
          disabled: !!refused,
        };
      })}
      onChange={onChange}
    />
  );
}
