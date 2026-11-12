import Svg, { Rect } from "react-native-svg";
import { View } from "react-native";
import { AVATAR_GRID, memberAvatarRects } from "../../../../../src/features/crews/model/memberAvatarArt";
import type { MemberAvatarTraits } from "../../../../../src/features/crews/model/memberAvatarTraits";
import type { CrewAgent } from "@/remote/contracts/crews";
import { memberTraits } from "./identity-model";

/**
 * The member's pixel portrait, the same art and traits as desktop (classic theme). Pass `traits`
 * from `rosterTraits` inside a crew so members without saved looks stay distinct.
 */
export function MemberAvatar({ member, traits, size = 28 }: {
  member: Pick<CrewAgent, "id" | "name" | "avatar"> & { source?: { id: string } };
  traits?: MemberAvatarTraits;
  size?: number;
}) {
  const rects = memberAvatarRects(traits ?? memberTraits(member));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={member.name} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${AVATAR_GRID} ${AVATAR_GRID}`} pointerEvents="none">
        {rects.map(([x, y, w, h, fill], index) => (
          <Rect key={index} x={x} y={y} width={w} height={h} fill={fill} />
        ))}
      </Svg>
    </View>
  );
}
