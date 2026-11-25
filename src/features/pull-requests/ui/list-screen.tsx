import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useActiveMachine, useMachines } from "@/state/machines";
import { View } from "react-native";
import { Screen, ScreenList, Stack, SegmentedControl, ToggleField, NavigationGroup, QueryState, Body, StateView } from "@/ui/primitives";
import { AppliedFilters, FilterButton, FilterSheet } from "@/ui/filter-sheet";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useInboxRead, useProviderInboxAvailability } from "../../inbox/provider-queries";
import { providerInboxAccess, isInboxPrivateFailure } from "../../inbox/provider-model";
import { ProviderInboxRow, ProviderInboxFeedback } from "../../inbox/provider-list";
import { defaultPrFilters, prListItems, prListQuery, type PrFilters } from "../model/list";
import { useProjectList } from "../../workspace/use-project-directory";
import { NoComputerGate } from "@/ui/no-computer";

export function PullRequestsScreen() {
  const copy = useCopy(), machine = useActiveMachine();
  const params = useLocalSearchParams<{ projectId?: string; machineId?: string }>();
  const projectId = params.projectId || null;
  const projects = useProjectList();
  const availability = useProviderInboxAvailability();
  const [filters, setFilters] = useState(defaultPrFilters);
  const { uiStyles } = useMobileTheme();
  const [draft, setDraft] = useState<PrFilters | null>(null);
  const sortOrder = ["updated", "created", "oldest"] as const satisfies readonly PrFilters["sort"][];
  const sortLabels: Record<PrFilters["sort"], string> = {
    updated: copy("Güncellenen", "Updated"), created: copy("Oluşturulan", "Created"), oldest: copy("En eski", "Oldest"),
  };
  const access = providerInboxAccess(availability);
  const scopeCurrent = (!params.machineId || machine?.id === params.machineId) && (!projectId || projects.isProjectVisible(projectId));
  const readAllowed = !!machine && scopeCurrent && access.canRead;
  const query = useInboxRead({ action: "list", input: { ...(projectId ? { projectId } : {}), query: prListQuery(filters) } }, readAllowed);
  const privateFailure = isInboxPrivateFailure(query.error);
  const visible = readAllowed && !privateFailure;
  const items = visible ? prListItems(query.data?.items ?? [], filters) : [];
  const current = () => !!machine && useMachines.getState().activeId === machine.id && scopeCurrent && (!projectId || projects.isProjectVisible(projectId));
  const refresh = () => {
    if (!current()) return;
    void availability.refetch();
    if (access.canRead) return query.refetch();
  };
  return <Screen title={copy("Pull request’ler", "Pull requests")} scroll={false}>
    <ScreenList data={items} query={query} refresh={refresh}
      scope={machine && scopeCurrent ? { computer: machine.name,
        project: projectId ? projects.data?.find(project => project.id === projectId)?.name : copy("Tüm projeler", "All projects") } : undefined}
      keyExtractor={item => `${item.projectPath}:${item.repo}:${item.number}`}
      header={<Stack>
        {visible ? <>
        <SegmentedControl label={copy("Durum", "State")} hideLabel value={filters.state} onChange={state => setFilters(current => ({ ...current, state: state as PrFilters["state"] }))}
          options={[{ value: "open", label: copy("Açık", "Open") }, { value: "closed", label: copy("Kapalı", "Closed") }, { value: "merged", label: copy("Birleştirildi", "Merged") }]} />
        {/* Sort and the two author filters live in one sheet, like every other filtered list. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppliedFilters result={query.data && !query.isFetching && items.length > 0 ? copy("{p0} pull request", "{p0} pull requests", { p0: String(items.length) }) : undefined}
              filters={[filters.mine && copy("Benim açtıklarım", "Created by me"), filters.reviewRequested && copy("İncelemem istendi", "Review requested from me"),
                filters.sort !== defaultPrFilters.sort && `${copy("Sıra", "Sort")}: ${sortLabels[filters.sort]}`]} />
          </View>
          <FilterButton count={Number(filters.mine) + Number(filters.reviewRequested) + Number(filters.sort !== defaultPrFilters.sort)} onPress={() => setDraft(filters)} />
        </View>
        </> : null}
        {!machine ? <NoComputerGate /> : !scopeCurrent ? <StateView tone="warning" title={copy("Pull request erişimi kullanılamıyor", "Pull request access unavailable")} /> : <QueryState query={availability}
          // Without desktop provider access the list would otherwise render nothing at all.
          empty={availability.data?.available === false} emptyIllustration="connect-computer"
          emptyTitle={copy("Bilgisayardaki Bycoda açık olmalı", "Open Bycoda on your computer")}
          emptyDetail={copy("GitHub, GitLab, Azure DevOps, Linear ve Jira erişimi bilgisayardaki oturumundan alınır. Bycoda’yı aç veya güncelle; bağlantı otomatik kontrol edilir.",
            "Provider access uses your desktop session. Open or update Bycoda on this computer; availability is checked automatically.")}
          emptyAction={{ label: copy("Yeniden dene", "Retry"), busy: availability.isFetching, onPress: () => { void refresh(); } }} />}
        {readAllowed ? <QueryState query={privateFailure ? { ...query, data: undefined, refetch: refresh } : query}
          empty={visible && query.data !== undefined && items.length === 0} size="region" emptyIllustration="inbox-empty"
          emptyTitle={filters.mine || filters.reviewRequested ? copy("Bu filtrede pull request yok", "No pull requests match these filters")
            : filters.state === "open" ? copy("Açık pull request yok", "No open pull requests")
            : filters.state === "closed" ? copy("Kapalı pull request yok", "No closed pull requests")
            : copy("Birleştirilmiş pull request yok", "No merged pull requests")} /> : null}
        {visible && query.data ? <ProviderInboxFeedback result={query.data} onRetry={() => { void refresh(); }} retrying={query.isFetching} /> : null}
      </Stack>}
      renderItem={({ item }) => <ProviderInboxRow item={item} onOpen={() => {
        if (!visible || !machine || !current()) return;
        router.push({ pathname: "/pull-requests/[id]", params: { id: String(item.number), repo: item.repo, projectPath: item.projectPath, machineId: machine.id, projectId: projectId ?? "" } });
      }} />}
    />
    {draft && visible ? <FilterSheet visible onClose={() => setDraft(null)}
      onReset={() => setDraft({ ...draft, mine: false, reviewRequested: false, sort: defaultPrFilters.sort })}
      onApply={() => { setFilters(current => ({ ...current, mine: draft.mine, reviewRequested: draft.reviewRequested, sort: draft.sort })); setDraft(null); }}>
      <Stack>
        <SegmentedControl label={copy("Sıralama", "Sort")} value={draft.sort} onChange={sort => setDraft({ ...draft, sort: sort as PrFilters["sort"] })}
          options={sortOrder.map(value => ({ value, label: sortLabels[value] }))} />
        <NavigationGroup>
          <ToggleField label={copy("Benim açtıklarım", "Created by me")} value={draft.mine} onChange={mine => setDraft({ ...draft, mine })} />
          <ToggleField label={copy("İncelemem istendi", "Review requested from me")} value={draft.reviewRequested} onChange={reviewRequested => setDraft({ ...draft, reviewRequested })} />
        </NavigationGroup>
        <Body muted style={uiStyles.caption}>{copy("Her depo için sınırlı sonuç gösterilir. Filtreler GitHub’da uygulanır.", "Results per repository are bounded. Filters are applied on GitHub.")}</Body>
      </Stack>
    </FilterSheet> : null}
  </Screen>;
}
