import { useEffect, useRef, useState } from "react";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import type { SocialSnapshot } from "@/domain/types";
import type { SocialTab } from "../social-flow";
import { socialCollections, SocialWorkspaceCache, WorkspaceQueryError, workspaceInput, workspaceSearch } from "./workspace-query-model";
import type { SocialCollectionPage } from "./types";
import { useConnectionScope } from "./connection-scope";

export function useSocialWorkspace(tab: SocialTab, projectId: string | null) {
  const copy = useCopy();
  // The reviewed connection epoch and its request cache share one explicit owner;
  // neither depends on a memo surviving.
  const scope = useConnectionScope(() => new SocialWorkspaceCache());
  const cache = scope.resource;
  const scopeKey = JSON.stringify([scope.token, projectId]);
  const controlKey = JSON.stringify([scopeKey, tab]);
  type Controls = { search: string; query: string; offset: number };
  const initial: Controls = { search: "", query: "", offset: 0 };
  const [saved, setSaved] = useState<{ key: string; tabs: Partial<Record<SocialTab, Controls>> }>({ key: scopeKey, tabs: {} });
  const active = useRef(controlKey);
  active.current = controlKey;
  // Retain each collection's browsing controls only within the current project/connection.
  const current = saved.key === scopeKey ? saved : { key: scopeKey, tabs: {} };
  if (current !== saved) setSaved(current);
  const controls = current.tabs[tab] ?? initial;
  const updateControls = (update: (value: Controls) => Controls) => setSaved(value => {
    if (active.current !== controlKey || !scope.isCurrent()) return value;
    const tabs = value.key === scopeKey ? value.tabs : {};
    return { key: scopeKey, tabs: { ...tabs, [tab]: update(tabs[tab] ?? initial) } };
  });
  const search = workspaceSearch(controls.search);
  const changing = search.query !== controls.query;
  useEffect(() => {
    if (search.invalid) return;
    const timer = setTimeout(() => updateControls(value =>
      ({ ...value, query: search.query, offset: changing ? 0 : value.offset })), changing ? 300 : 0);
    return () => clearTimeout(timer);
  }, [controlKey, controls.search]);
  const input = workspaceInput(tab, projectId, controls.offset, controls.query);
  const query = useHostQuery<SocialSnapshot>(["social", "workspace", scope.token, input], "social.request",
    { action: "workspace.snapshot", input }, {
      enabled: !!scope.review?.environmentId && !search.invalid && !changing,
      interval: 8000,
      queryFn: async (client, signal) => {
        try {
          return await cache.read(input, scope.review!.environmentId!,
            (requested) => client.request("social.request", { action: "workspace.snapshot", input: requested }, { signal }),
            scope.isCurrent);
        } catch (error) {
          if (!(error instanceof WorkspaceQueryError)) throw error;
          const message = error.code === "unsupported" ? copy(
            "Sosyal medya geçmişini görüntülemek için bilgisayardaki bycoda’yı güncelleyin.",
            "Update bycoda on the computer to view social history.",
          ) : error.code === "scope" ? copy(
            "Bilgisayar bağlantısı değişti. Doğru bilgisayarı seçip bu görünümü yeniden açın.",
            "The computer connection changed. Select the correct computer and reopen this view.",
          ) : copy("Bilgisayarın sayfalı yanıtı eksik veya geçersiz. Bağlantıyı kontrol edip yeniden deneyin.", "The computer's paged response is incomplete or invalid. Check the connection and retry.");
          throw new WorkspaceQueryError(error.code, message);
        }
      },
    });
  const errorKind = (query.error as { kind?: string } | null)?.kind;
  const missingEnvironment = !scope.review?.environmentId;
  const blocked = missingEnvironment || query.error instanceof WorkspaceQueryError || errorKind === "auth" || errorKind === "identity";
  const state = blocked ? undefined : query.data ?? cache.peek(input);
  const collection = socialCollections[tab];
  const page: SocialCollectionPage | undefined = collection ? {
    search: controls.search,
    setSearch: (value) => updateControls(old => ({ ...old, search: value })),
    page: state?.pages?.[collection],
    loading: changing || search.invalid || !query.data,
    busy: changing || search.invalid || query.isFetching,
    invalidSearch: search.invalid,
    onOffset: (offset) => updateControls(old => ({ ...old, offset })),
  } : undefined;
  return { query, state, page, collection, missingEnvironment };
}
