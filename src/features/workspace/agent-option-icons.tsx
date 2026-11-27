import type { ReactNode } from "react";
import Lock from "lucide-react-native/icons/lock";
import Pencil from "lucide-react-native/icons/pencil";
import Shield from "lucide-react-native/icons/shield";
import Sparkles from "lucide-react-native/icons/sparkles";
import Gauge from "lucide-react-native/icons/gauge";
import Zap from "lucide-react-native/icons/zap";
import Brain from "lucide-react-native/icons/brain";
import { SelectField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";

type Mode = "supervised" | "auto-accept-edits" | "auto" | "full-access";

/** Same glyphs as the desktop access picker; Full access is tinted as the risky choice. */
export function PermissionField({ value, disabled, onChange }: {
  value: Mode;
  disabled?: boolean;
  onChange: (mode: Mode) => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const mark = (Icon: typeof Lock, color = colors.muted) => <Icon size={18} color={color} />;
  return (
    <SelectField
      label={copy("İzinler", "Permissions")}
      value={value}
      disabled={disabled}
      options={[
        { value: "supervised" as const, label: copy("Onay iste", "Ask for approval"), icon: mark(Lock) },
        { value: "auto-accept-edits" as const, label: copy("Düzenlemeleri otomatik kabul et", "Auto-accept edits"), icon: mark(Pencil) },
        { value: "auto" as const, label: copy("Otomatik inceleme", "Automatic review"), icon: mark(Sparkles) },
        {
          value: "full-access" as const,
          label: copy("Tam erişim", "Full access"),
          icon: mark(Shield, colors.warning),
          detail: copy(
            "Ajan komutları ve düzenlemeleri onay beklemeden uygulayabilir.",
            "The agent may run commands and edits without waiting for approval.",
          ),
        },
      ]}
      onChange={onChange}
    />
  );
}

const EFFORT_IDS = new Set(["effort", "reasoning", "reasoningEffort"]);
const FAST_IDS = new Set(["fast", "serviceTier"]);

/** Gauge for reasoning, bolt for speed tiers, brain for thinking, as in the desktop model picker. */
export function SettingIcon({ id }: { id: string }): ReactNode {
  const { colors } = useMobileTheme();
  if (EFFORT_IDS.has(id)) return <Gauge size={18} color={colors.muted} />;
  if (FAST_IDS.has(id)) return <Zap size={18} color={colors.muted} />;
  if (id === "thinking") return <Brain size={18} color={colors.muted} />;
  return null;
}
