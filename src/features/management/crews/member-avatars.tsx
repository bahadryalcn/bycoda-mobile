import { View } from "react-native";
import { Badge as PanelBadge } from "panelui-native/components/badge";
import type { CrewAgent } from "@/remote/contracts/crews";
import { Badge } from "@/ui/feedback";
import { radii, space } from "@/ui/tokens";
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
  if (!agents.length) return null;
  const shown = agents.slice(0, MAX_AVATARS);
  const traits = rosterTraits(agents);
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      {accent ? <PanelBadge shape="dot" accessible={false} style={{ width: 10, height: 10, borderRadius: radii.pill, backgroundColor: accent, marginRight: space.xs }} /> : null}
      {shown.map((agent) => <MemberAvatar key={agent.id} member={agent} traits={traits.get(agent.id)} size={AVATAR_SIZE} />)}
      {agents.length > shown.length ? <Badge label={`+${agents.length - shown.length}`} /> : null}
    </View>
  );
}
