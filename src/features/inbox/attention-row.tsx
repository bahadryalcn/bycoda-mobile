import type { MobileInboxItem } from "@/domain/types";
import Approval from "lucide-react-native/icons/shield-check";
import Failure from "lucide-react-native/icons/triangle-alert";
import Review from "lucide-react-native/icons/eye";
import Finished from "lucide-react-native/icons/circle-check";
import Question from "lucide-react-native/icons/circle-help";
import PullRequest from "lucide-react-native/icons/git-pull-request";
import { Body, NavigationRow, Row, RowIcon, StatusText } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { Status, statusLabel } from "../management/shared/status";
import { useCopy } from "@/ui/copy";
import { attentionIcon, isUrgentAttention } from "./attention-groups";

const icons = { approval: Approval, failure: Failure, review: Review, finished: Finished, question: Question, "pull-request": PullRequest };
/** States the user must act on keep their tinted badge; progress and completion stay quiet text. */
const exceptional = new Set(["failed", "blocked", "awaiting-approval", "needs-input", "review"]);
const running = new Set(["running", "verifying", "planning", "active"]);
/** Status expresses required action; urgency never implies an unread state. */
export function AttentionRow({ item, time, onPress }: { item: MobileInboxItem; time: string; onPress: () => void }) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const urgent = isUrgentAttention(item);
  const kind = attentionIcon(item);
  return (
    <NavigationRow
      label={item.title}
      labelLines={2}
      accessibilityLabel={[item.title, item.detail, time, item.status ? statusLabel(item.status, copy) : undefined,
        urgent ? copy("İlginiz gerekiyor", "Needs your attention") : undefined].filter(Boolean).join(". ")}
      detail={item.detail || undefined}
      detailLines={2}
      emphasized={urgent}
      icon={<RowIcon glyph={icons[kind]} tone={kind === "failure" ? "danger" : undefined} />}
      supporting={
        <Row>
          {time ? <Body muted style={[uiStyles.caption, { flexShrink: 1 }]}>{time}</Body> : null}
          {item.status ? exceptional.has(item.status) ? <Status value={item.status} />
            : <StatusText label={statusLabel(item.status, copy)} tone={running.has(item.status) ? "live" : "default"} /> : null}
        </Row>
      }
      onPress={onPress}
    />
  );
}
