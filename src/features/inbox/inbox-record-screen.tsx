import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { router, Stack, type Href } from "expo-router";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { RemoteInboxItem, RemoteInboxList, RemoteInboxQuery } from "../../../../src/features/inbox/model/remoteInbox";
import { useActiveMachine, useMachines } from "@/state/machines";
import { hostKey } from "@/state/queries";
import { Screen, Skeleton, StateView, showToast } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { errorMessage } from "@/ui/error-message";
import { RouteGuard } from "@/ui/route-guard";
import { useProjectList } from "../workspace/use-project-directory";
import { ProviderInboxDetail } from "./provider-detail";
import { useInboxRead, useProviderInboxAvailability } from "./provider-queries";
import { providerInboxAccess, providerName } from "./provider-model";
import { InboxLocalScopeContext, type InboxLocalScope } from "./inbox-local-scope";
import { matchInboxRecord, recallInboxRecord, type InboxRecordTarget } from "./inbox-record-route";
import type { InboxOrigin } from "./provider-protocol";
import { leaveTo } from "@/ui/navigation";

/** The page names the record's kind and identity: "Pull request #12", "Merge request !4", "Jira ABC-12". */
export function inboxRecordTitle(item: Pick<RemoteInboxItem, "provider" | "kind" | "number" | "identifier">, copy: ReturnType<typeof useCopy>) {
  const id = item.identifier ?? `#${item.number}`;
  if (item.kind === "pr") return `${item.provider === "gitlab" ? copy("Merge request", "Merge request") : copy("Pull request", "Pull request")} ${id}`;
  if (item.provider === "jira" || item.provider === "linear") return `${providerName(item.provider)} ${id}`;
  return `${copy("Issue", "Issue")} ${id}`;
}

/**
 * One provider record as a pushed page (issue, pull or merge request, Jira or Linear issue): the
 * same page whether it was opened from the Inbox, the Pull requests list, a Jira board or a link.
 * The route carries identity; the record itself comes from this computer's and project's list
 * cache (or the in-memory hand-off of the row that was tapped), and stays this page's record once
 * found. A cold link runs the list's own reads; `coldReads` lists them in order.
 */
export function InboxRecordPage({ target, machineId, projectId, coldReads, fallback, fallbackLabel, notFound, extra }: {
  target: InboxRecordTarget | null;
  machineId: string | undefined;
  projectId: string | null;
  coldReads: (target: InboxRecordTarget) => RemoteInboxQuery[];
  /** Where Back goes without history: the list this record belongs to. */
  fallback: { href: Href; label: string };
  fallbackLabel?: string;
  notFound: { title: string; unavailable: string; hint: string };
  /** Sections only this entry offers (the board actions of a Jira issue opened from its board). */
  extra?: (item: RemoteInboxItem, origin: InboxOrigin, access: { canWrite: boolean }) => ReactNode;
}) {
  const machine = useActiveMachine(), copy = useCopy();
  const projects = useProjectList();
  const availability = useProviderInboxAvailability();
  const scopeCurrent = machine?.id === machineId && (!projectId || projects.isProjectVisible(projectId));
  const verifiedMachine = scopeCurrent ? machine : null;
  const found = useCachedRecord(verifiedMachine?.id ?? null, projectId, target);
  // Once found, the record stays this page's record: a later list refresh that no longer lists it
  // (merged or closed elsewhere, past the list limit) must not turn the open page into an error
  // and drop its draft. A newer row for the same identity still replaces it.
  const pinned = useRef<{ key: string; item: RemoteInboxItem } | null>(null);
  const pinKey = verifiedMachine && target ? JSON.stringify([verifiedMachine.id, projectId, target]) : null;
  if (pinKey && found) pinned.current = { key: pinKey, item: found };
  const item = found ?? (pinKey && pinned.current?.key === pinKey ? pinned.current.item : null);
  const reads = target ? coldReads(target) : [];
  const coldRead = !!verifiedMachine && !!target && !item && providerInboxAccess(availability).canRead;
  const scope = projectId ? { projectId } : {};
  const firstRead = useInboxRead({ action: "list", input: { ...scope, query: reads[0] ?? { assignedToMe: false, state: "all", search: "" } } }, coldRead && !!reads[0]);
  const secondRead = useInboxRead({ action: "list", input: { ...scope, query: reads[1] ?? { assignedToMe: false, state: "all", search: "" } } },
    coldRead && !!reads[1] && firstRead.data !== undefined);
  const title = target ? inboxRecordTitle({ ...target }, copy) : copy("Kayıt", "Record");
  const leave = () => {
    if (router.canGoBack()) router.back();
    else if (verifiedMachine && useMachines.getState().activeId === verifiedMachine.id && (!projectId || projects.isProjectVisible(projectId)))
      leaveTo(fallback.href);
    else leaveTo("/");
  };
  // A state change (merge, close, draft) closes the page; its confirmation follows as a toast.
  const close = (message?: string) => {
    if (message) showToast({ message });
    leave();
  };
  // A cold start (notification, deep link) proves the project and desktop provider access first;
  // until those reads answer, an "unavailable" verdict would only flash before the record opens.
  const directoryLoading = !!machine && machine.id === machineId && !!projectId && projects.verifying === true;
  const availabilityLoading = !!verifiedMachine && !!target && !item && availability.data === undefined && !availability.error && availability.isFetching;
  const waiting = (read: typeof firstRead, wanted: boolean) => wanted && read.data === undefined && !read.error;
  if (directoryLoading || availabilityLoading || waiting(firstRead, coldRead && !!reads[0]) ||
    waiting(secondRead, coldRead && !!reads[1] && firstRead.data !== undefined)) return <>
    <Stack.Screen options={{ title }} />
    <Screen><Skeleton /></Screen>
  </>;
  // When the read itself failed or desktop provider access is off, say that instead of a generic hint.
  const missingCause = !verifiedMachine || !target ? undefined
    : firstRead.error ? errorMessage(firstRead.error, copy, undefined, { read: true })
    : secondRead.error ? errorMessage(secondRead.error, copy, undefined, { read: true })
    : availability.error ? errorMessage(availability.error, copy, undefined, { read: true })
    : availability.data?.available === false ? copy("GitHub, GitLab, Azure DevOps, Linear ve Jira erişimi bilgisayardaki oturumundan alınır. Bycoda’yı aç veya güncelle; bağlantı otomatik kontrol edilir.",
      "Provider access uses your desktop session. Open or update Bycoda on this computer; availability is checked automatically.")
    : undefined;
  const backLabel = router.canGoBack() ? copy("Geri dön", "Go back") : verifiedMachine ? fallback.label : copy("Projeler", "Projects");
  if (!verifiedMachine || !item) return <>
    <Stack.Screen options={{ title }} />
    <Screen>
      <StateView
        size="region"
        tone="warning"
        title={verifiedMachine ? notFound.title : notFound.unavailable}
        description={missingCause ?? (verifiedMachine && target ? notFound.hint : undefined)}
        action={{ label: backLabel, onPress: leave }}
      />
    </Screen>
  </>;
  const origin = { machineId: verifiedMachine.id, projectId };
  const localScope: InboxLocalScope = { projectId, setProjectId: () => {}, matches: candidate => useMachines.getState().activeId === candidate.machineId &&
    candidate.machineId === machineId && candidate.projectId === projectId && (!projectId || projects.isProjectVisible(projectId)) };
  return <InboxLocalScopeContext value={localScope}>
    <Stack.Screen options={{ title: inboxRecordTitle(item, copy) }} />
    <RouteGuard fallback={leave}>
      <ProviderInboxDetail key={pinKey} item={item} origin={origin} availability={availability} onClose={close}
        closeLabel={fallbackLabel ?? backLabel} extra={extra?.(item, origin, providerInboxAccess(availability))} />
    </RouteGuard>
  </InboxLocalScopeContext>;
}

/** The tapped row lives in the list cache of this machine and project (or the in-memory hand-off). */
export function useCachedRecord(machineId: string | null, projectId: string | null, target: InboxRecordTarget | null): RemoteInboxItem | null {
  const cache = useQueryClient();
  return useSyncExternalStore(
    // Only list reads can change the answer; detail, thread and diff updates do not rescan the lists.
    notify => cache.getQueryCache().subscribe(event => {
      const key = event.query.queryKey;
      if (key[2] === "provider-inbox" && key[3] === "list") notify();
    }),
    () => findCachedRecord(cache, machineId, projectId, target),
  );
}

function findCachedRecord(cache: QueryClient, machineId: string | null, projectId: string | null, target: InboxRecordTarget | null): RemoteInboxItem | null {
  if (!machineId || !target) return null;
  for (const [key, list] of cache.getQueriesData<RemoteInboxList>({ queryKey: hostKey(machineId, ["provider-inbox", "list"]) })) {
    // Cache key: [machine, id, "provider-inbox", "list", input]; a list without projectId is the all-projects scope.
    const input = key[4] as { projectId?: string } | undefined;
    if ((input?.projectId ?? null) !== projectId) continue;
    const found = matchInboxRecord(list?.items, target);
    if (found) return found;
  }
  return recallInboxRecord(machineId, projectId, target);
}
