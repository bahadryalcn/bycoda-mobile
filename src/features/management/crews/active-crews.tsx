import { useState } from "react";
import { router } from "expo-router";
import type { ActiveCrewList, ActiveCrewMember } from "@/remote/contracts/crews";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { Button, NavigationGroup, NavigationRow, SectionHeader, Stack } from "@/ui/primitives";
import { activeFocus, activeKey, activePollInterval, handleLabel, sortActive, CREW_ACTIVE_CAPABILITY } from "./identity-model";
import { MemberAvatar } from "./member-avatar";

const SHOWN = 8;
const EXPANDED_LIMIT = 200;

/**
 * Read-only list of crew members working right now in the page's project. The computer lists
 * every project's members; the page shows only the project its pill names. Polls through the
 * host query, which only runs while this screen is the visible foreground route.
 */
export function ActiveCrews({ projectId }: { projectId: string }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const supported = machine?.capabilities?.includes(CREW_ACTIVE_CAPABILITY) === true;
  const [expanded, setExpanded] = useState(false);
  const query = useHostQuery<ActiveCrewList>(["crews", "active"], "crews.active.list", {
    limit: expanded ? EXPANDED_LIMIT : SHOWN,
  }, {
    enabled: supported,
    interval: (data) => activePollInterval(data?.items),
    keepPrevious: true,
  });
  const items = query.data?.items.filter((item) => item.projectId === projectId);
  if (!supported || !items?.length || !machine) return null;
  const sorted = sortActive(items);
  const rows = expanded ? sorted : sorted.slice(0, SHOWN);
  const open = (item: ActiveCrewMember) => {
    if (item.sessionId)
      router.navigate({ pathname: "/session/[id]", params: { id: item.sessionId, machineId: machine.id, projectId: item.projectId } });
  };
  const attention = (item: ActiveCrewMember) =>
    item.attention === "decision" ? copy("Karar bekliyor", "Needs a decision")
      : item.attention === "review" ? copy("İnceleme bekliyor", "Needs review")
        : item.attention === "blocked" ? copy("Engellendi", "Blocked") : undefined;
  return (
    <Stack>
      <SectionHeader title={copy("Şu an çalışanlar", "Working now")} count={sorted.length} />
      <NavigationGroup>
        {rows.map((item) => (
          <NavigationRow
            key={activeKey(item)}
            icon={<MemberAvatar member={{ id: item.memberId, name: item.memberName, avatar: item.avatar, source: item.memberSource }} />}
            label={item.memberName}
            detail={[handleLabel(item.handle), activeFocus(item)].filter(Boolean).join(" · ")}
            detailLines={2}
            metadata={[item.definitionName, attention(item)].filter(Boolean).join(" · ")}
            disabled={!item.sessionId}
            intent={item.sessionId ? "navigate" : "command"}
            onPress={() => open(item)}
          />
        ))}
      </NavigationGroup>
      {expanded || query.data?.truncated || sorted.length > SHOWN ? (
        <Button
          tone="quiet"
          label={expanded
            ? copy("Daha az göster", "Show less")
            : copy("Daha fazla göster", "Show more")}
          onPress={() => setExpanded((value) => !value)}
        />
      ) : null}
    </Stack>
  );
}
