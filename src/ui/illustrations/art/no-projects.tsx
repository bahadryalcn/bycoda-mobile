import { Path } from "react-native-svg";
import { colors } from "../../tokens";
import { IllustrationFrame } from "../frame";

export default function NoProjects({ size = 120 }: { size?: number }) {
  return (
    <IllustrationFrame name="no-projects" size={size}>
      <Path d="M29 78V42a5 5 0 0 1 5-5h17l7 8h27a5 5 0 0 1 5 5v28" stroke={colors.tertiary} />
      <Path d="m28 79 7-24h59l-7 27H31a3 3 0 0 1-3-3Z" fill={colors.panel} />
      <Path d="m54 63-6 5 6 5m13-10 6 5-6 5" stroke={colors.accent} />
      <Path d="M37 32h7m-3-4v8" stroke={colors.border} strokeWidth={1.5} />
    </IllustrationFrame>
  );
}

