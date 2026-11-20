import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useActiveMachine, useMachines } from "@/state/machines";
import { Screen, ScreenList, Stack, SelectField, SegmentedControl, ChoiceChip, Row, QueryState, Body, StateView } from "@/ui/primitives";
import { useInfoHint } from "@/ui/info-hint";
import { useCopy } from "@/ui/copy";
import { useInboxRead, useProviderInboxAvailability } from "../../inbox/provider-queries";
import { providerInboxAccess, isInboxPrivateFailure } from "../../inbox/provider-model";
import { ProviderInboxRow, ProviderInboxFeedback } from "../../inbox/provider-list";
import { defaultPrFilters, prListItems, prListQuery, type PrFilters } from "../model/list";
import { useProjectList } from "../../workspace/use-project-directory";

export function PullRequestsScreen() {
  const copy = useCopy(), machine = useActiveMachine();
  const params = useLocalSearchParams<{ projectId?: string; machineId?: string }>();
  const projectId = params.projectId || null;
  const projects = useProjectList();
  const availability = useProviderInboxAvailability();
  const [filters, setFilters] = useState(defaultPrFilters);
  const bounds = useInfoHint(copy("Her depo için sınırlı sonuç gösterilir. Filtreler GitHub’da uygulanır.", "Results per repository are bounded. Filters are applied on GitHub."));
  const access = providerInboxAccess(availability);
  const scopeCurrent = (!params.machineId || machine?.id === params.machineId) && (!projectId || projects.isProjectVisible(projectId));
  const query = useInboxRead({ action: "list", input: { ...(projectId ? { projectId } : {}), query: prListQuery(filters) } }, access.canRead && scopeCurrent);
  const visible = !!machine && scopeCurrent && access.canRead && !isInboxPrivateFailure(query.error);
  const items = visible ? prListItems(query.data?.items ?? [], filters) : [];
  const current = () => !!machine && useMachines.getState().activeId === machine.id && scopeCurrent && (!projectId || projects.isProjectVisible(projectId));
  const refresh = () => {
    if (!current()) return;
    void availability.refetch();
    if (access.canRead) return query.refetch();
  };
  return <Screen title={copy("Pull request’ler", "Pull requests")} scroll={false}>
    <ScreenList data={items} query={query} refresh={refresh} actions={bounds.button}
      subtitle={machine && scopeCurrent ? `${machine.name} · ${projectId ? projects.data?.find(project => project.id === projectId)?.name : copy("Tüm projeler", "All projects")}` : undefined}
      keyExtractor={item => `${item.projectPath}:${item.repo}:${item.number}`}
      header={<Stack>
        {bounds.panel}
        {visible ? <>
        <SegmentedControl label={copy("Durum", "State")} value={filters.state} onChange={state => setFilters(current => ({ ...current, state: state as PrFilters["state"] }))}
          options={[{ value: "open", label: copy("Açık", "Open") }, { value: "closed", label: copy("Kapalı", "Closed") }, { value: "merged", label: copy("Birleştirildi", "Merged") }]} />
        <SelectField label={copy("Sıralama", "Sort")} value={filters.sort} onChange={sort => setFilters(current => ({ ...current, sort: sort as PrFilters["sort"] }))}
          options={[{ value: "updated", label: copy("Son güncellenen", "Recently updated") }, { value: "created", label: copy("Son oluşturulan", "Recently created") }, { value: "oldest", label: copy("En eski", "Oldest") }]} />
        <Row>
          <ChoiceChip label={copy("Benim açtıklarım", "Created by me")} selected={filters.mine} onPress={() => setFilters(current => ({ ...current, mine: !current.mine }))} />
          <ChoiceChip label={copy("İncelemem istendi", "Review requested from me")} selected={filters.reviewRequested} onPress={() => setFilters(current => ({ ...current, reviewRequested: !current.reviewRequested }))} />
        </Row>
        </> : null}
        {!machine ? <StateView illustration="connect-computer" title={copy("Bir bilgisayar seçin", "Choose a computer")} /> : !scopeCurrent ? <StateView illustration="unreachable" title={copy("Pull request erişimi kullanılamıyor", "Pull request access unavailable")} /> : <QueryState query={availability}
          // Without desktop provider access the list would otherwise render nothing at all.
          empty={availability.data?.available === false} emptyIllustration="connect-computer"
          emptyTitle={copy("Bilgisayardaki Bycoda açık olmalı", "Open Bycoda on your computer")}
          emptyDetail={copy("GitHub, GitLab, Azure DevOps, Linear ve Jira erişimi bilgisayardaki oturumundan alınır. Bycoda’yı aç veya güncelle; bağlantı otomatik kontrol edilir.",
            "Provider access uses your desktop session. Open or update Bycoda on this computer; availability is checked automatically.")} />}
        {visible ? <><QueryState query={query} empty={query.data !== undefined && items.length === 0} />
          {query.data ? <ProviderInboxFeedback result={query.data} onRetry={() => { void refresh(); }} retrying={query.isFetching} /> : null}
</> : null}
      </Stack>}
      renderItem={({ item }) => <ProviderInboxRow item={item} onOpen={() => {
        if (!visible || !machine || !current()) return;
        router.push({ pathname: "/pull-requests/[id]", params: { id: String(item.number), repo: item.repo, projectPath: item.projectPath, machineId: machine.id, projectId: projectId ?? "" } });
      }} />}
    />
  </Screen>;
}
