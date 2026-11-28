import { View } from "react-native";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import Check from "lucide-react-native/icons/check";
import Clock from "lucide-react-native/icons/clock-3";
import Loader from "lucide-react-native/icons/loader-circle";
import PenLine from "lucide-react-native/icons/pen-line";
import { Badge, StatusText } from "@/ui/feedback";
import type { SessionRowBadgeIcon, SessionRowBadgeTone } from "./session-row-status-model";

const icons = { alert: CircleAlert, working: Loader, waiting: Clock, done: Check, draft: PenLine } as const;

/**
 * The status mark at the end of a session row. Working is the live label with the shared working
 * sweep (desktop's WorkingIndicator), so a run reads as moving rather than as one more grey word;
 * done carries its tone dot and waiting is muted `StatusText`. Only states the owner must act on or
 * notice (failed, needs input, interrupted, draft) are a tinted `Badge` with its leading icon.
 */
export function SessionRowStatus({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: SessionRowBadgeTone;
  icon: SessionRowBadgeIcon;
}) {
  const quiet = icon === "working" ? "live" as const : icon === "done" ? "success" as const : icon === "waiting" ? "default" as const : undefined;
  return (
    <View style={{ alignSelf: "flex-end", maxWidth: "100%" }}>
      {quiet ? <StatusText label={label} tone={quiet} /> : <Badge label={label} tone={tone} icon={icons[icon]} />}
    </View>
  );
}
