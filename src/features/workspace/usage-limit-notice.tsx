import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import type { UsageLimit } from "../../../../src/features/sessions/model/session";
import { shortTime } from "@/features/tools/usage-limits-model";
import { useLocale } from "@/i18n";
import { Body, Button } from "@/ui/primitives";
import { StatusLine } from "@/ui/feedback";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import {
  usageLimitActions,
  usageLimitPhase,
  usageLimitResetDelay,
  type UsageLimitAction,
} from "./usage-limit-model";

export type UsageLimitNoticeProps = {
  limit: UsageLimit;
  /** Who hit the limit, e.g. "Claude · Work". */
  target: string;
  /** No session control right now (blocked, running, another computer). */
  disabled: boolean;
  /** The action whose command is in flight; every action waits for it. */
  pending?: UsageLimitAction;
  onAction: (action: UsageLimitAction) => void;
};

/**
 * Desktop's UsageLimitNotice in the chat's failure presentation: one warning status line, who hit the
 * limit and when it resets, then one primary action and quiet secondary ones that wrap below at large
 * text. The raw provider text stays behind the failure card's Details.
 */
export function UsageLimitNotice({
  limit,
  target,
  disabled,
  pending,
  onAction,
  details,
}: UsageLimitNoticeProps & { details?: ReactNode }) {
  const copy = useCopy();
  const locale = useLocale();
  const { uiStyles } = useMobileTheme();
  const [now, setNow] = useState(() => Date.now());
  // The phase flips from "resets at" to "resume" at the reset itself, not on the next render.
  useEffect(() => {
    const delay = usageLimitResetDelay(limit, Date.now());
    if (delay === undefined) return;
    const timer = setTimeout(() => setNow(Date.now()), delay + 50);
    return () => clearTimeout(timer);
  }, [limit]);
  const phase = usageLimitPhase(limit, Math.max(now, Date.now()));
  const at = limit.resetsAt != null ? shortTime(limit.resetsAt, now, locale) : "";
  const detail =
    phase === "ready"
      ? copy("{p0} sınırına ulaştı", "{p0} reached its limit", { p0: target })
      : phase === "armed"
        ? copy("{p0} · {p1} saatinde kendiliğinden devam eder", "{p0} · resumes on its own at {p1}", { p0: target, p1: at })
        : phase === "waiting"
          ? `${target} · ${copy("Sıfırlanma: {p0}", "Resets at {p0}", { p0: at })}`
          : phase === "reset"
            ? `${target} · ${copy("Sınır sıfırlandı", "The limit has reset")}`
            : `${target} · ${copy("Sıfırlanma zamanı bilinmiyor", "Reset time unknown")}`;
  const label = (action: UsageLimitAction) =>
    action === "resume"
      ? phase === "ready"
        ? copy("Devam et", "Continue")
        : phase === "unknown"
          ? copy("Tekrar dene", "Try again")
          : copy("Sürdür", "Resume")
      : action === "arm"
        ? copy("Sıfırlanınca devam et", "Resume at reset")
        : action === "disarm"
          ? copy("Otomatik devam etmeyi iptal et", "Cancel automatic resume")
          : action === "switch"
            ? copy("Hesap veya model değiştir", "Switch account or model")
            : copy("Kapat", "Dismiss");
  const spoken = (action: UsageLimitAction) =>
    action === "disarm"
      ? copy("Otomatik devam etmeyi iptal et", "Cancel automatic resume")
      : action === "dismiss"
        ? copy("Kullanım sınırı bildirimini kapat", "Dismiss usage limit notice")
        : undefined;
  const { primary, secondary } = usageLimitActions(phase);
  const button = (action: UsageLimitAction, tone: "primary" | "quiet") => (
    <Button
      key={action}
      label={label(action)}
      accessibilityLabel={spoken(action)}
      tone={tone}
      density="compact"
      reserveTouchTarget
      busy={pending === action}
      disabled={disabled || (!!pending && pending !== action)}
      onPress={() => onAction(action)}
    />
  );
  return (
    <View style={{ gap: space.xs }}>
      <StatusLine
        tone={phase === "ready" ? "info" : "warning"}
        label={phase === "ready" ? copy("Devam etmeye hazır", "Ready to continue") : copy("Kullanım sınırına ulaşıldı", "Usage limit reached")}
      />
      <Body style={uiStyles.caption}>{detail}</Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
        {primary ? button(primary, "primary") : null}
        {secondary.map((action) => button(action, "quiet"))}
      </View>
      {details}
    </View>
  );
}
