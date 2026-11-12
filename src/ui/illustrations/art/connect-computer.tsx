import { Path, Rect } from "react-native-svg";
import { colors } from "../../tokens";
import { IllustrationFrame } from "../frame";

export default function ConnectComputer({ size = 120 }: { size?: number }) {
  return (
    <IllustrationFrame name="connect-computer" size={size}>
      <Rect x={46} y={32} width={50} height={36} rx={5} fill={colors.panel} />
      <Path d="M42 74h58l-3 5H45z" fill={colors.panel} />
      <Rect x={23} y={49} width={23} height={38} rx={5} fill={colors.panel} />
      <Path d="M31 80h7" stroke={colors.tertiary} />
      <Path d="M47 58h12a8 8 0 0 1 8 8v8" stroke={colors.accent} strokeDasharray="3 4" />
      <Path d="m64 71 3 3 3-3" stroke={colors.accent} />
    </IllustrationFrame>
  );
}

