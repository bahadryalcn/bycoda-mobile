import { useRef } from "react";
import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveMachine, useMachines } from "@/state/machines";
import { hostKey } from "@/state/queries";
import { Screen, Skeleton, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { RouteGuard } from "@/ui/route-guard";
import { useProjectList } from "../workspace/use-project-directory";
import { InboxLocalScopeContext, type InboxLocalScope } from "./inbox-local-scope";
import { InboxRecordPage, useCachedRecord } from "./inbox-record-screen";
import { readInboxRecordRoute, recallJiraSnapshot } from "./inbox-record-route";
import { JiraBoardIssueActions } from "./jira-board-issue";
import type { JiraMobileIssue } from "./jira-board-model";
import { ProviderJiraBoards } from "./jira-board-screen";
import { providerInboxAccess } from "./provider-model";
import { useProviderInboxAvailability } from "./provider-queries";
import { ProviderPrReview } from "./provider-pr-review";
import { PrReviewFileView } from "./provider-pr-review-file";
import { prReviewSessionKey, usePrReviewSession } from "./provider-pr-review-session";
import type { InboxOrigin } from "./provider-protocol";
import { goBack } from "@/ui/navigation";

type RouteParams = Record<string, string | undefined>;
const inboxHref: Href = { pathname: "/manage/[section]", params: { section: "inbox", view: "issues" } };

/** The page's own computer and project, proven against the active computer and visible projects. */
function useRouteScope(params: RouteParams) {
  const machine = useActiveMachine();
  const projects = useProjectList();
  const projectId = params.projectId || null;
  const current = (origin: InboxOrigin) => useMachines.getState().activeId === origin.machineId && origin.machineId === params.machineId &&
    origin.projectId === projectId && (!projectId || projects.isProjectVisible(projectId));
  const scope: InboxLocalScope = { projectId, setProjectId: () => {}, matches: current };
  const verified = !!machine && machine.id === params.machineId && (!projectId || projects.isProjectVisible(projectId));
  return { machine: verified ? machine : null, projectId, scope, verifying: !!projectId && projects.verifying === true };
}

function leaveTo(href: Href) {
  return () => goBack(href);
}

/**
 * Any provider record opened from the Inbox or a Jira board. A Jira issue opened from its board
 * also carries that board's status and move actions (`boardSnapshot`).
 */
export function InboxRecordScreen() {
  const params = useLocalSearchParams<RouteParams>();
  const copy = useCopy();
  const cache = useQueryClient();
  const projectId = params.projectId || null;
  const target = readInboxRecordRoute(params);
  return <InboxRecordPage target={target} machineId={params.machineId} projectId={projectId}
    // A cold link reads this provider's list for the project, every state.
    coldReads={(record) => [{ providers: [record.provider], assignedToMe: false, state: "all", search: "" }]}
    fallback={{ href: inboxHref, label: copy("Gelen kutusu", "Inbox") }}
    notFound={{ title: copy("Kayıt açılamadı", "Could not open this item"),
      unavailable: copy("Kayıt erişimi kullanılamıyor", "Record access unavailable"),
      hint: copy("Gelen kutusundan aç.", "Open it from the Inbox.") }}
    extra={(item, origin, access) => {
      const snapshot = item.provider === "jira" ? recallJiraSnapshot(origin.machineId, origin.projectId, params.boardSnapshot) : null;
      // A status change or move shows on this page and on the board under it once their reads refresh.
      const refresh = () => cache.invalidateQueries({ queryKey: hostKey(origin.machineId, ["provider-inbox"]),
        predicate: ({ queryKey }) => ["jira-board-read", "details", "thread", "list"].includes(queryKey[3] as string) });
      return snapshot ? <JiraBoardIssueActions origin={origin} snapshot={snapshot} issue={item as JiraMobileIssue}
        canWrite={access.canWrite} onChanged={() => { void refresh(); }} /> : null;
    }} />;
}

/** Files and review of a GitHub pull request, pushed from its record page. */
export function InboxReviewScreen() {
  const params = useLocalSearchParams<RouteParams>();
  const copy = useCopy();
  const cache = useQueryClient();
  const availability = useProviderInboxAvailability();
  const { machine, projectId, scope, verifying } = useRouteScope(params);
  const target = readInboxRecordRoute(params);
  const found = useCachedRecord(machine?.id ?? null, projectId, target);
  const pinned = useRef(found);
  if (found) pinned.current = found;
  const item = found ?? pinned.current;
  const title = copy("Dosyalar ve inceleme", "Files and review");
  const back = leaveTo(inboxHref);
  if (verifying) return <><Stack.Screen options={{ title }} /><Screen><Skeleton /></Screen></>;
  if (!machine || !item || item.kind !== "pr") return <>
    <Stack.Screen options={{ title }} />
    <Screen><StateView size="region" tone="warning" title={copy("İnceleme açılamadı", "Could not open the review")}
      description={copy("Pull request sayfasından aç.", "Open it from the pull request page.")}
      action={{ label: router.canGoBack() ? copy("Geri dön", "Go back") : copy("Gelen kutusu", "Inbox"), onPress: back }} /></Screen>
  </>;
  const origin = { machineId: machine.id, projectId };
  const access = providerInboxAccess(availability);
  const record = JSON.stringify(target);
  return <InboxLocalScopeContext value={scope}>
    <Stack.Screen options={{ title }} />
    <RouteGuard fallback={back}>
      <ProviderPrReview item={item} origin={origin} canRead={access.canRead} canWrite={access.canWrite}
        // The review reached the provider: the record's conversation, decision and reviewers refresh.
        onSubmitted={() => { void cache.invalidateQueries({ queryKey: hostKey(origin.machineId, ["provider-inbox"]), predicate: ({ queryKey }) => {
          const action = queryKey[3] as string;
          if (action === "list") return true;
          return ["thread", "details", "reviewers"].includes(action) && JSON.stringify((queryKey[4] as { item?: unknown } | undefined)?.item) === record;
        } }); }} />
    </RouteGuard>
  </InboxLocalScopeContext>;
}

/** One file's diff, pushed over the review it belongs to; edits go to that review's draft. */
export function InboxReviewFileScreen() {
  const params = useLocalSearchParams<RouteParams>();
  const copy = useCopy();
  const { machine, projectId } = useRouteScope(params);
  const target = readInboxRecordRoute(params);
  const key = machine && target ? prReviewSessionKey({ machineId: machine.id, projectId }, target) : "";
  const session = usePrReviewSession(key);
  const path = params.path ?? "";
  const file = session?.file(path);
  const line = Number(params.line);
  const anchor = (params.side === "LEFT" || params.side === "RIGHT") && Number.isSafeInteger(line) && line > 0 ? { side: params.side, line } as const : undefined;
  const back = leaveTo(inboxHref);
  if (!session || !file) return <>
    <Stack.Screen options={{ title: copy("Dosya", "File") }} />
    <Screen><StateView size="region" tone="warning" title={copy("Dosya açılamadı", "Could not open this file")}
      description={copy("Dosyayı incelemesinden aç.", "Open the file from its review.")}
      action={{ label: router.canGoBack() ? copy("Geri dön", "Go back") : copy("Gelen kutusu", "Inbox"), onPress: back }} /></Screen>
  </>;
  return <RouteGuard fallback={back}>
    <PrReviewFileView key={`${file.path}:${session.commitId}:${anchor ? `${anchor.side}${anchor.line}` : ""}`}
      file={file} comments={session.comments} commenting={session.commenting} initialAnchor={anchor}
      onSave={(at, body, index) => session.save(file.path, at, body, index)} onRemove={session.remove} />
  </RouteGuard>;
}

/** The project's Jira boards, pushed from the Inbox's top-row menu. */
export function JiraBoardsScreen() {
  const params = useLocalSearchParams<RouteParams>();
  const copy = useCopy();
  const availability = useProviderInboxAvailability();
  const { machine, projectId, scope } = useRouteScope(params);
  const access = providerInboxAccess(availability);
  return <InboxLocalScopeContext value={scope}>
    <Stack.Screen options={{ title: copy("Jira panoları", "Jira boards") }} />
    <ProviderJiraBoards origin={{ machineId: params.machineId ?? machine?.id ?? "", projectId }}
      canRead={!!machine && access.canRead} canWrite={!!machine && access.canWrite} />
  </InboxLocalScopeContext>;
}
