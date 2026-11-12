import { router } from "expo-router";
import type { ActiveCrewList, ActiveCrewMember } from "@/remote/contracts/crews";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { Body, Heading, NavigationGroup, NavigationRow, Stack } from "@/ui/primitives";
import { activeFocus, activeKey, activePollInterval, handleLabel, sortActive, CREW_ACTIVE_CAPABILITY } from "./identity-model";
import { MemberAvatar } from "./member-avatar";

const SHOWN = 8;

/**
 * Read-only list of crew members working right now, across projects. Polls through the
 * host query, which only runs while this screen is the visible foreground route.
 */
export function ActiveCrews() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const supported = machine?.capabilities?.includes(CREW_ACTIVE_CAPABILITY) === true;
  const query = useHostQuery<ActiveCrewList>(["crews", "active"], "crews.active.list", { limit: 200 }, {
    enabled: supported,
    interval: (data) => activePollInterval(data?.items),
  });
  const items = query.data?.items;
  if (!supported || !items?.length || !machine) return null;
  const sorted = sortActive(items);
  const open = (item: ActiveCrewMember) => {
    if (item.sessionId)
      router.push({ pathname: "/session/[id]", params: { id: item.sessionId, machineId: machine.id, projectId: item.projectId } });
  };
  const attention = (item: ActiveCrewMember) =>
    item.attention === "decision" ? copy("Karar bekliyor", "Needs a decision")
      : item.attention === "review" ? copy("İnceleme bekliyor", "Needs review")
        : item.attention === "blocked" ? copy("Engellendi", "Blocked") : undefined;
  return (
    <Stack>
      <Heading>{copy("Şu an çalışanlar", "Working now")}</Heading>
      <NavigationGroup>
        {sorted.slice(0, SHOWN).map((item) => (
          <NavigationRow
            key={activeKey(item)}
            icon={<MemberAvatar member={{ id: item.memberId, name: item.memberName, avatar: item.avatar, source: item.memberSource }} />}
            label={item.memberName}
            detail={[handleLabel(item.handle), activeFocus(item)].filter(Boolean).join(" · ")}
            detailLines={2}
            metadata={[item.projectName, item.definitionName, attention(item)].filter(Boolean).join(" · ")}
            disabled={!item.sessionId}
            intent={item.sessionId ? "navigate" : "command"}
            onPress={() => open(item)}
          />
        ))}
      </NavigationGroup>
      {sorted.length > SHOWN ? (
        <Body muted>{copy("+{p0} üye daha", "+{p0} more", { p0: sorted.length - SHOWN })}</Body>
      ) : null}
    </Stack>
  );
}
