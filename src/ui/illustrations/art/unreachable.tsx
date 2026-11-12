import { Path, Rect } from "react-native-svg";
import { colors } from "../../tokens";
import { IllustrationFrame } from "../frame";

export default function Unreachable({ size = 120 }: { size?: number }) {
  return (
    <IllustrationFrame name="unreachable" size={size}>
      <Rect x={29} y={32} width={62} height={43} rx={5} fill={colors.panel} />
      <Path d="M23 81h74l-4 6H27z" fill={colors.panel} />
      <Path d="m51 54-5 2a6 6 0 0 0 4 11l7-3m13-10 5-2a6 6 0 0 0-4-11l-7 3" />
      <Path d="m54 60 5-2m4-2 4-2" stroke={colors.accent} />
      <Path d="m57 43-2-5m10 30 2 5" stroke={colors.tertiary} strokeWidth={1.5} />
    </IllustrationFrame>
  );
}

