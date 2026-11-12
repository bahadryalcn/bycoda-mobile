import { Circle, Path } from "react-native-svg";
import { colors } from "../../tokens";
import { IllustrationFrame } from "../frame";

export default function InboxEmpty({ size = 120 }: { size?: number }) {
  return (
    <IllustrationFrame name="inbox-empty" size={size}>
      <Path d="m29 64 9-23h44l9 23" stroke={colors.tertiary} />
      <Path d="M29 64h19l5 8h14l5-8h19v19a5 5 0 0 1-5 5H34a5 5 0 0 1-5-5Z" fill={colors.panel} />
      <Circle cx={60} cy={45} r={16} fill={colors.raised} stroke={colors.border} />
      <Path d="m53 45 5 5 9-10" stroke={colors.accent} />
      <Path d="M60 21v-4m-22 9-3-3m47 3 3-3" stroke={colors.border} strokeWidth={1.5} />
    </IllustrationFrame>
  );
}

