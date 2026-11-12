import { View } from "react-native";
import type { CrewAgent } from "@/remote/contracts/crews";
import { Body } from "@/ui/primitives";
import { radii, space } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { rosterTraits } from "./identity-model";
import { MemberAvatar } from "./member-avatar";

const AVATAR_SIZE = 28;
const MAX_AVATARS = 6;

/** Compact portraits for a crew's members, led by the crew's accent dot; names stay in the card details. */
export function MemberAvatars({ agents, accent }: {
  agents: readonly (Pick<CrewAgent, "id" | "name" | "avatar"> & { source?: { id: string } })[];
  /** The crew look's color from the Host; omitted keeps the default. */
  accent?: string;
}) {
  const { uiStyles } = useMobileTheme();
  if (!agents.length) return null;
  const shown = agents.slice(0, MAX_AVATARS);
  const traits = rosterTraits(agents);
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      {accent ? <View style={{ width: 10, height: 10, borderRadius: radii.pill, backgroundColor: accent, marginRight: space.xs }} /> : null}
      {shown.map((agent) => <MemberAvatar key={agent.id} member={agent} traits={traits.get(agent.id)} size={AVATAR_SIZE} />)}
      {agents.length > shown.length ? <Body muted style={uiStyles.caption}>+{agents.length - shown.length}</Body> : null}
    </View>
  );
}
