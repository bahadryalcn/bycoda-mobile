import { ScreenList } from "@/ui/screen-list";
import type { HostAttentionInbox, MobileInboxItem } from "@/domain/types";
import { router } from "expo-router";
import { useState } from "react";
import { Body, Disclosure, NavigationRow, QueryState, Screen, ScreenHeader, SegmentedControl } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { getLocales } from "expo-localization";
import { resolveLocale } from "@/localization";
import { colors, radii, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { Scope } from "./shared/scope";
import { Status } from "./shared/status";
import { ProviderInboxScreen } from "../inbox/provider-inbox-screen";
import { View } from "react-native";

const attentionStatuses = ["review", "awaiting-approval", "blocked", "failed"];

/** Mail-style relative time ("5 dk", "2 sa", "dün") in the app language. */
function relativeTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  const language = useMachines.getState().language;
  const locale = language === "system" ? resolveLocale(getLocales().map((entry) => entry.languageTag)) : language;
  const seconds = Math.round((value - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return format.format(0, "minute");
}

export function InboxScreen() {
  const copy = useCopy();
  const [mode, setMode] = useState<"attention" | "providers">("attention");
  return (
    <Screen scroll={false} title={copy("Gelen kutusu", "Inbox")}>
      <ScreenHeader>
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
      {mode === "providers" ? <ProviderInboxScreen embedded /> : <AttentionInboxScreen />}
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
            <Disclosure label={copy("Yardım", "Help")}>
              <Body muted>
                {copy(
                  "GitHub, GitLab, Jira, Linear ve Azure için üstteki issue ve PR kutusunu açın.",
                  "Open the issues and pull requests tab above for GitHub, GitLab, Jira, Linear and Azure.",
                )}
              </Body>
            </Disclosure>
          )}
        </>
      }
      renderItem={({ item }) => {
        const needsAttention = !!item.status && attentionStatuses.includes(item.status);
        return (
          <NavigationRow
            label={item.title}
            detail={item.detail}
            detailLines={1}
            icon={
              <View
                accessible={false}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: radii.pill,
                  backgroundColor: needsAttention ? colors.accent : "transparent",
                  marginEnd: space.xxs,
                }}
              />
            }
            trailing={
              <View style={{ alignItems: "flex-end", gap: space.xxs }}>
                <Body muted style={uiStyles.caption}>
                  {relativeTime(item.updatedAt)}
                </Body>
                {item.status ? <Status value={item.status} /> : null}
              </View>
            }
            onPress={() => open(item)}
          />
        );
      }}
    />
  );
}
