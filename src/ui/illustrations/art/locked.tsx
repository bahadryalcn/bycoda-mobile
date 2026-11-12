import { Circle, Path, Rect } from "react-native-svg";
import { colors, semanticColors } from "../../tokens";
import { IllustrationFrame } from "../frame";

export default function Locked({ size = 120 }: { size?: number }) {
  return (
    <IllustrationFrame name="locked" size={size}>
      <Path d="M43 54V42a17 17 0 0 1 34 0v12" />
      <Rect x={33} y={53} width={54} height={40} rx={9} fill={colors.panel} />
      <Circle cx={60} cy={70} r={5} stroke={semanticColors.warning.text} />
      <Path d="M60 75v6" stroke={semanticColors.warning.text} />
      <Path d="M25 42h7m-3.5-3.5v7" stroke={colors.border} strokeWidth={1.5} />
    </IllustrationFrame>
  );
}

