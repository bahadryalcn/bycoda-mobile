import { Circle, Path } from "react-native-svg";
import { colors } from "../../tokens";
import { IllustrationFrame } from "../frame";

export default function SearchEmpty({ size = 120 }: { size?: number }) {
  return (
    <IllustrationFrame name="search-empty" size={size}>
      <Circle cx={53} cy={53} r={23} fill={colors.panel} />
      <Path d="M37 51a16 16 0 0 1 14-14" stroke={colors.border} strokeWidth={1.5} />
      <Path d="m69 70 19 19a4 4 0 0 0 6-6L75 64" />
      <Path d="M84 42h11m-11 9h7" stroke={colors.accent} />
      <Path d="M29 86h13" stroke={colors.border} strokeWidth={1.5} />
    </IllustrationFrame>
  );
}

