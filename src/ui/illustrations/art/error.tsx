import { Circle, Path } from "react-native-svg";
import { colors, semanticColors } from "../../tokens";
import { IllustrationFrame } from "../frame";

export default function Error({ size = 120 }: { size?: number }) {
  return (
    <IllustrationFrame name="error" size={size}>
      <Path d="M53 33a8 8 0 0 1 14 0l28 48a7 7 0 0 1-6 10H31a7 7 0 0 1-6-10Z" fill={colors.panel} />
      <Path d="M60 49v18" stroke={semanticColors.danger.text} strokeWidth={2.5} />
      <Circle cx={60} cy={78} r={1.5} fill={semanticColors.danger.text} stroke="none" />
      <Path d="M30 30h7m-3.5-3.5v7" stroke={colors.border} strokeWidth={1.5} />
    </IllustrationFrame>
  );
}

