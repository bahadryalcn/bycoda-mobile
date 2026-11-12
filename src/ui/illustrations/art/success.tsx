import { Circle, Path } from "react-native-svg";
import { colors, semanticColors } from "../../tokens";
import { IllustrationFrame } from "../frame";

export default function Success({ size = 120 }: { size?: number }) {
  return (
    <IllustrationFrame name="success" size={size}>
      <Circle cx={60} cy={60} r={30} fill={colors.panel} />
      <Path d="m45 60 10 10 21-23" stroke={semanticColors.success.text} strokeWidth={2.5} />
      <Path d="m85 30 3-4m-55 5-3-4M60 20v-4" stroke={colors.border} strokeWidth={1.5} />
      <Path d="M51 99h18" stroke={colors.border} strokeWidth={1.5} />
    </IllustrationFrame>
  );
}

