import { Circle, Path } from "react-native-svg";
import { colors } from "../../tokens";
import { IllustrationFrame } from "../frame";

export default function Permission({ size = 120 }: { size?: number }) {
  return (
    <IllustrationFrame name="permission" size={size}>
      <Path d="M60 25c-8 8-17 11-27 13v23c0 16 12 27 27 33 15-6 27-17 27-33V38c-10-2-19-5-27-13Z" fill={colors.panel} />
      <Path d="m55 77 17-13a12 12 0 1 1 7 9L62 86l-5-6-4 3-4-5Z" fill={colors.raised} stroke={colors.accent} />
      <Circle cx={85} cy={62} r={3} stroke={colors.accent} />
    </IllustrationFrame>
  );
}

