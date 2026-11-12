import { decorativeSvgProps } from "@/ui/accessibility";
import Circle from "lucide-react-native/icons/circle";
import Clock from "lucide-react-native/icons/clock-3";
import Play from "lucide-react-native/icons/circle-play";
import Eye from "lucide-react-native/icons/eye";
import Alert from "lucide-react-native/icons/circle-alert";
import Check from "lucide-react-native/icons/circle-check";
import Cancel from "lucide-react-native/icons/circle-x";
import Pause from "lucide-react-native/icons/pause";
import Help from "lucide-react-native/icons/circle-question-mark";
import { useMobileTheme } from "@/ui/theme";

/** Meaning is announced by the task identity; long press reveals its full label. */
export function TaskStatusIcon({ value }: { value: string }) {
  const { colors } = useMobileTheme();
  const Icon = ({ todo: Circle, queued: Clock, running: Play, verifying: Eye, review: Eye,
    blocked: Alert, failed: Alert, done: Check, succeeded: Check, completed: Check,
    finished: Check, cancelled: Cancel, paused: Pause } as Record<string, typeof Circle>)[value] ?? Help;
  const color = ["blocked", "failed"].includes(value) ? colors.danger
    : ["done", "succeeded", "completed", "finished"].includes(value) ? colors.success
    : ["review", "awaiting-approval"].includes(value) ? colors.warning
    : ["running", "verifying", "planning"].includes(value) ? colors.accent : colors.muted;
  return <Icon size={18} color={color} {...decorativeSvgProps} />;
}
