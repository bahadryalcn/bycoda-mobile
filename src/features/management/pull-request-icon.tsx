import Svg, { G, Path } from "react-native-svg";
import type { LucideProps } from "lucide-react-native";
import { decorativeSvgProps } from "@/ui/accessibility";

/**
 * Pull request glyph drawn like the shared duotone identity icons (`@/ui/duotone-icon`), which
 * have no pull request plane yet. Move it into that map when the icon owner adds one.
 */
export function PullRequestIcon({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: LucideProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...props} {...decorativeSvgProps}>
      {Number(size) >= 20 ? <Path d="M6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM18 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" fill={color} opacity={0.35} /> : null}
      <G fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M6 9v12M13 6h3a2 2 0 0 1 2 2v7M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM21 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </G>
    </Svg>
  );
}
