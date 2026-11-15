import { View } from "react-native";
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
import { radii, space } from "@/ui/tokens";
import { Status, statusLabel } from "../management/shared/status";
import { useCopy } from "@/ui/copy";
import { attentionIcon, isUrgentAttention } from "./attention-groups";

const icons = { approval: Approval, failure: Failure, review: Review, finished: Finished, question: Question, "pull-request": PullRequest };
const DOT = space.sm;

/** One attention item: kind tile (the unread dot sits on the tile, so text keeps its edge), title, context, time and status. */
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
        urgent ? copy("Okunmadı", "Unread") : undefined].filter(Boolean).join(". ")}
      detail={item.detail || undefined}
      detailLines={2}
      emphasized={urgent}
      icon={
        <View>
          <IconTile color={tint}><Icon size={18} strokeWidth={2} color={tint} /></IconTile>
          {urgent ? <View accessible={false} pointerEvents="none" style={{
            position: "absolute", top: -space.xxs, end: -space.xxs, width: DOT, height: DOT, borderRadius: radii.pill,
            backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.background,
          }} /> : null}
        </View>
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
