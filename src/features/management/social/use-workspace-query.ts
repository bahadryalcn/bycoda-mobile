import { useEffect, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine } from "@/state/reviewed-machine";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import type { SocialSnapshot } from "@/domain/types";
import type { SocialTab } from "../social-flow";
import { socialCollections, SocialWorkspaceCache, WorkspaceQueryError, workspaceInput, workspaceSearch } from "./workspace-query-model";
import type { SocialCollectionPage } from "./types";
import { useConnectionScope } from "./connection-scope";

export function useSocialWorkspace(tab: SocialTab, projectId: string | null) {
  const machine = useActiveMachine();
  const copy = useCopy();
  // The reviewed connection epoch and its request cache share one explicit owner;
  // neither depends on a memo surviving.
  const scope = useConnectionScope(machine, () => new SocialWorkspaceCache());
  const cache = scope.resource;
  const controlKey = JSON.stringify([scope.token, tab, projectId]);
  const initial = { key: controlKey, search: "", query: "", offset: 0 };
  const [saved, setSaved] = useState(initial);
  const controls = saved.key === controlKey ? saved : initial;
  const search = workspaceSearch(controls.search);
  const changing = search.query !== controls.query;
  useEffect(() => {
    if (search.invalid) return;
    const timer = setTimeout(() => setSaved((value) => value.key !== controlKey ? initial :
      { ...value, query: search.query, offset: changing ? 0 : value.offset }), changing ? 300 : 0);
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
            () => isReviewedMachine(scope.review, useMachines.getState()));
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
    setSearch: (value) => setSaved((old) => ({ ...(old.key === controlKey ? old : initial), search: value })),
    page: state?.pages?.[collection],
    loading: changing || search.invalid || !query.data,
    busy: changing || search.invalid || query.isFetching,
    invalidSearch: search.invalid,
    onOffset: (offset) => setSaved((old) => ({ ...(old.key === controlKey ? old : initial), offset })),
  } : undefined;
  return { query, state, page, collection, missingEnvironment };
}
