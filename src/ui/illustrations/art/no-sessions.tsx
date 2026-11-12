import { Path } from "react-native-svg";
import { colors } from "../../tokens";
import { IllustrationFrame } from "../frame";

export default function NoSessions({ size = 120 }: { size?: number }) {
  return (
    <IllustrationFrame name="no-sessions" size={size}>
      <Path d="M64 54h20a8 8 0 0 1 8 8v13a8 8 0 0 1-8 8h-2v9L69 83H57a8 8 0 0 1-8-8v-7" stroke={colors.tertiary} />
      <Path d="M35 35h28a9 9 0 0 1 9 9v16a9 9 0 0 1-9 9H48L34 79V68a9 9 0 0 1-8-9V44a9 9 0 0 1 9-9Z" fill={colors.panel} />
      <Path d="M38 51h1m9 0h1m9 0h1" stroke={colors.tertiary} strokeWidth={2.5} />
      <Path d="m85 28 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" stroke={colors.accent} />
    </IllustrationFrame>
  );
}

