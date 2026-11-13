import { View } from "react-native";
import type { CrewAgent, SavedCrewAgent } from "@/remote/contracts/crews";
import { useCopy } from "@/ui/copy";
import { Badge, Body } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { handleLabel, linkState, rosterTraits } from "./identity-model";
import { MemberAvatar } from "./member-avatar";

/** Readable member identity with portrait, role and the Library/Customized link when known. */
export function MemberLines({ agents, roleLabel, library }: {
  agents: readonly CrewAgent[];
  roleLabel?: (role: CrewAgent["role"]) => string;
  library?: readonly SavedCrewAgent[];
}) {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  const traits = rosterTraits(agents);
  return (
    <View style={{ gap: space.sm }}>
      {agents.map((agent) => {
        const link = library ? linkState(agent, library) : undefined;
        const secondary = [handleLabel(agent.handle), roleLabel?.(agent.role)].filter(Boolean).join(" · ");
        return (
          <View key={agent.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
            <MemberAvatar member={agent} traits={traits.get(agent.id)} />
            <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
              <Body>{agent.name}</Body>
              {secondary ? <Body muted style={uiStyles.caption}>{secondary}</Body> : null}
              {link ? <View style={{ alignSelf: "flex-start", maxWidth: "100%" }}><Badge label={link === "linked" ? copy("Kütüphane", "Library") : copy("Özelleştirildi", "Customized")} /></View> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
