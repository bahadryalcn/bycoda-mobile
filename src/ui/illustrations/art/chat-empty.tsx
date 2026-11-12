import { Circle, Path } from "react-native-svg";
import { colors } from "../../tokens";
import { IllustrationFrame } from "../frame";

export default function ChatEmpty({ size = 120 }: { size?: number }) {
  return (
    <IllustrationFrame name="chat-empty" size={size}>
      <Path d="M37 33h42a12 12 0 0 1 12 12v22a12 12 0 0 1-12 12H53L35 92V79a12 12 0 0 1-10-12V45a12 12 0 0 1 12-12Z" fill={colors.panel} />
      <Path d="M39 49h28m-28 9h17" stroke={colors.border} strokeWidth={1.5} />
      <Circle cx={82} cy={76} r={15} fill={colors.raised} stroke={colors.accent} />
      <Path d="M82 70v12m-6-6h12" stroke={colors.accent} />
    </IllustrationFrame>
  );
}

