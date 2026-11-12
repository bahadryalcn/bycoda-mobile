import { Circle, Path } from "react-native-svg";
import { colors } from "../../tokens";
import { IllustrationFrame } from "../frame";

export default function Offline({ size = 120 }: { size?: number }) {
  return (
    <IllustrationFrame name="offline" size={size}>
      <Path d="M28 48a49 49 0 0 1 48-8m10 5 6 5M39 62a32 32 0 0 1 24-8m13 4 5 4M50 76a16 16 0 0 1 19-1" />
      <Circle cx={60} cy={88} r={2} fill={colors.tertiary} stroke="none" />
      <Path d="m31 92 58-61" stroke={colors.accent} strokeWidth={2.5} />
    </IllustrationFrame>
  );
}

