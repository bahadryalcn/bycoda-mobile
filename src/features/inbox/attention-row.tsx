import type { MobileInboxItem } from "@/domain/types";
import Approval from "lucide-react-native/icons/shield-check";
import Failure from "lucide-react-native/icons/triangle-alert";
import Review from "lucide-react-native/icons/eye";
import Finished from "lucide-react-native/icons/circle-check";
import Question from "lucide-react-native/icons/circle-help";
import PullRequest from "lucide-react-native/icons/git-pull-request";
import { Body, NavigationRow, Row } from "@/ui/primitives";
import { IconTile } from "@/ui/icon-tile";
import { useMobileTheme } from "@/ui/theme";
import { Status, statusLabel } from "../management/shared/status";
import { useCopy } from "@/ui/copy";
import { attentionIcon, isUrgentAttention } from "./attention-groups";

const icons = { approval: Approval, failure: Failure, review: Review, finished: Finished, question: Question, "pull-request": PullRequest };
/** Status expresses required action; urgency never implies an unread state. */
export function AttentionRow({ item, time, onPress }: { item: MobileInboxItem; time: string; onPress: () => void }) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const urgent = isUrgentAttention(item);
  const kind = attentionIcon(item);
  const Icon = icons[kind];
  const tint = kind === "failure" ? semanticColors.danger.text : kind === "finished" ? semanticColors.success.text
    : urgent ? semanticColors.warning.text : colors.muted;
  return (
    <NavigationRow
      label={item.title}
      labelLines={2}
      accessibilityLabel={[item.title, item.detail, time, item.status ? statusLabel(item.status, copy) : undefined,
        urgent ? copy("İlginiz gerekiyor", "Needs your attention") : undefined].filter(Boolean).join(". ")}
      detail={item.detail || undefined}
      detailLines={2}
      emphasized={urgent}
      icon={
        <IconTile color={tint}><Icon size={18} strokeWidth={2} color={tint} /></IconTile>
      }
      supporting={
        <Row>
          {time ? <Body muted style={[uiStyles.caption, { flexShrink: 1 }]}>{time}</Body> : null}
          {item.status ? <Status value={item.status} /> : null}
        </Row>
      }
      onPress={onPress}
    />
  );
}
