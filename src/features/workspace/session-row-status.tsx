import { View } from "react-native";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import Check from "lucide-react-native/icons/check";
import Clock from "lucide-react-native/icons/clock-3";
import Loader from "lucide-react-native/icons/loader-circle";
import PenLine from "lucide-react-native/icons/pen-line";
import { Badge } from "@/ui/feedback";
import type { SessionRowBadgeIcon, SessionRowBadgeTone } from "./session-row-status-model";

const icons = { alert: CircleAlert, working: Loader, waiting: Clock, done: Check, draft: PenLine } as const;

/** The status mark at the end of a session row, as desktop's `SessionRowStatus`: shared `Badge` with a leading icon. */
export function SessionRowStatus({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: SessionRowBadgeTone;
  icon: SessionRowBadgeIcon;
}) {
  return (
    <View style={{ alignSelf: "flex-end", maxWidth: "100%" }}>
      <Badge label={label} tone={tone} icon={icons[icon]} />
    </View>
  );
}
