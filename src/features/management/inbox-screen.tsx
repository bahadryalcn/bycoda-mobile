import { ScreenList } from "@/ui/screen-list";
import type { HostAttentionInbox, MobileInboxItem } from "@/domain/types";
import { router } from "expo-router";
import { useState } from "react";
import {
  Body,
  Button,
  Card,
  SegmentedControl,
  NavigationRow,
  Heading,
  QueryState,
  Row,
  Screen,
  ScreenHeader,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { Scope } from "./shared/scope";
import { stamp } from "./shared/format";
import { Status } from "./shared/status";
import { ProviderInboxScreen } from "../inbox/provider-inbox-screen";
import { useScreenChrome } from "@/ui/layout";

export function InboxScreen() {
  const copy = useCopy();
  const chrome = useScreenChrome();
  const [mode, setMode] = useState<"attention" | "providers">("attention");
  return (
    <Screen scroll={false}>
      <ScreenHeader>
        {!chrome.nativeTitle ? <Heading>{copy("Gelen kutusu", "Inbox")}</Heading> : null}
        <SegmentedControl
          label={copy("Gelen kutusu", "Inbox")}
          value={mode}
          options={[
            { value: "attention", label: copy("Bekleyen işler", "Attention") },
            { value: "providers", label: copy("Issue ve PR", "Issues & PRs") },
          ]}
          onChange={setMode}
        />
      </ScreenHeader>
      {mode === "providers" ? <ProviderInboxScreen /> : <AttentionInboxScreen />}
    </Screen>
  );
}
function AttentionInboxScreen() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const projectId = useMachines((state) => state.selectedProjectId);
  const selectProject = useMachines((state) => state.selectProject);
  const query = useHostQuery<HostAttentionInbox>(
    ["inbox", projectId],
    "inbox.list",
    projectId ? { projectId } : {},
    { interval: 6000 },
  );
  const open = (item: MobileInboxItem) => {
    if (item.projectId) selectProject(item.projectId);
    if (item.sessionId) {
      if (machine)
        router.push({
          pathname: "/session/[id]",
          params: {
            id: item.sessionId,
            machineId: machine.id,
            ...(item.projectId ? { projectId: item.projectId } : {}),
          },
        });
    } else
      router.push(
        `/manage/${{ task: "tasks", goal: "goals", automation: "automations", social: "social", "pull-request": "tasks", session: "inbox" }[item.kind]}`,
      );
  };
  return (
    <ScreenList<MobileInboxItem>
      query={query}
      data={query.data?.items ?? []}
      keyExtractor={(item) => item.id}
      header={
        <>
          <Scope allowAll />
          <QueryState
            query={query}
            empty={query.data?.items.length === 0}
            emptyTitle={copy("Bekleyen bir iş yok", "Nothing needs your attention")}
          />
          {query.data && !query.data.externalProviderInboxAvailable && (
            <Body muted>
              {copy(
                "GitHub, GitLab, Jira, Linear ve Azure için üstteki issue ve PR kutusunu açın.",
                "Open the issues and pull requests tab above for GitHub, GitLab, Jira, Linear and Azure.",
              )}
            </Body>
          )}
        </>
      }
      renderItem={({ item }) => (
        <NavigationRow
          label={item.title}
          detail={item.detail}
          trailing={item.status ? <Status value={item.status} /> : undefined}
          onPress={() => open(item)}
        />
      )}
    />
  );
}
