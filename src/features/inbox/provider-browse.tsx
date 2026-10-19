import { useMobileTheme } from "@/ui/theme";
import { FilterButton, FilterSheet } from "@/ui/filter-sheet";
import { SearchField } from "@/ui/search-field";
import { useEffect, useReducer, useState } from "react";
import { View } from "react-native";
import {
  Row,
  Button,
  Empty,
  IconButton,
  Notice,
  QueryState,
  Screen,
  Sheet,
  ToggleField, NavigationGroup,
} from "@/ui/primitives";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { colors, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { Scope } from "../management/common";
import { ProviderInboxDetail } from "./provider-detail";
import { ProviderConnections, ProviderInboxItems } from "./provider-list";
import { inboxItemKey, providerInboxView } from "./provider-model";
import type { ProviderInboxBrowseProps } from "./provider-component-types";
import { useInboxRead, useProviderInboxAvailability } from "./provider-queries";
import { inboxBrowseReducer, initialInboxBrowseState } from "./provider-state";

export { type ProviderInboxBrowseProps } from "./provider-component-types";

export function ProviderInboxBrowse({ origin, embedded = false }: ProviderInboxBrowseProps) {
  useMobileTheme();
  const copy = useCopy();
  const [filterDraft, setFilterDraft] = useState<{ assigned: boolean; all: boolean } | null>(null);
  const [browse, dispatch] = useReducer(inboxBrowseReducer, initialInboxBrowseState);
  const { assigned, all, search, committedSearch, selected, limit, notice } = browse;
  useEffect(() => {
    const timer = setTimeout(() => dispatch({ type: "commit-search", value: search.trim() }), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const availability = useProviderInboxAvailability();
  const view = providerInboxView(selected, availability);
  const providers = useInboxRead<"providers">({ action: "providers", input: {} }, view.canRead);
  const items = useInboxRead<"list">(
    {
      action: "list",
      input: {
        ...(origin.projectId ? { projectId: origin.projectId } : {}),
        query: { assignedToMe: assigned, state: all ? "all" : "open", search: committedSearch },
      },
    },
    view.canRead,
  );

  function refresh() {
    void availability.refetch();
    if (view.canRead) {
      void providers.refetch();
      void items.refetch();
    }
  }

  const empty = items.data?.items.length === 0 && Object.keys(items.data.errors).length === 0;
  return (
    <Screen title={embedded ? undefined : copy("Servis gelen kutusu", "Provider inbox")} query={items} refresh={refresh}>
      {view.kind === "detail" && <Sheet visible size="full" scroll={false} title={view.item.title} onClose={() => dispatch({ type: "close" })}>
        <ProviderInboxDetail key={inboxItemKey(view.item)} item={view.item} origin={origin} availability={availability} onClose={(message) => dispatch({ type: "close", notice: message })} />
      </Sheet>}
      <Scope allowAll />
      {notice ? <Notice tone="success" message={notice} /> : null}
      <QueryState query={availability} />
      {availability.data?.available === false ? (
        <Empty
          title={copy("Bilgisayardaki Bycoda açık olmalı", "Open Bycoda on your computer")}
          detail={copy(
            "GitHub, GitLab, Azure DevOps, Linear ve Jira erişimi bilgisayardaki oturumundan alınır. Bycoda’yı aç veya güncelle; bağlantı otomatik kontrol edilir.",
            "Provider access uses your desktop session. Open or update Bycoda on this computer; availability is checked automatically.",
          )}
        />
      ) : null}
      {availability.data?.available === true ? (
        <>
          <QueryState query={providers} loading="none" />
          {providers.data ? <ProviderConnections providers={providers.data} /> : null}
          <Row style={{ flexWrap: "nowrap" }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <SearchField
                label={copy("Ara", "Search")}
                value={search}
                onChangeText={(value) => dispatch({ type: "search", value })}
                autoCorrect={false}
                placeholder={copy("Issue veya PR ara", "Search issues or PRs")}
              />
            </View>
            <FilterButton count={Number(assigned) + Number(all)} onPress={() => setFilterDraft({ assigned, all })} />
            <IconButton
              label={copy("Yenile", "Refresh")}
              busy={items.isFetching}
              onPress={() => {
                void items.refetch();
              }}
            >
              <RefreshCw size={18} color={colors.muted} />
            </IconButton>
          </Row>
          {filterDraft ? <FilterSheet visible onClose={() => setFilterDraft(null)}
            onReset={() => setFilterDraft({ assigned: false, all: false })}
            onApply={() => {
              dispatch({ type: "filter", key: "assigned", value: filterDraft.assigned });
              dispatch({ type: "filter", key: "all", value: filterDraft.all });
              setFilterDraft(null);
            }}>
            <NavigationGroup>
              <ToggleField
              label={copy("Yalnız bana atananlar", "Assigned to me only")}
              value={filterDraft.assigned}
              onChange={(assigned) => setFilterDraft({ ...filterDraft, assigned })}
            />
              <ToggleField
              label={copy("Kapalı kayıtları da göster", "Include closed items")}
              value={filterDraft.all}
              onChange={(all) => setFilterDraft({ ...filterDraft, all })}
            />
            </NavigationGroup>
          </FilterSheet> : null}
          <QueryState
            query={items}
            empty={empty}
            emptyTitle={copy("Bu filtrede kayıt yok", "No items match these filters")}
          />
          {items.data ? (
            <ProviderInboxItems
              result={items.data}
              limit={limit}
              onOpen={(item) => dispatch({ type: "select", item })}
              onMore={() => dispatch({ type: "more" })}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
