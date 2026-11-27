import { useLocalSearchParams } from "expo-router";
import { useCopy } from "@/ui/copy";
import { InboxRecordPage } from "../../inbox/inbox-record-screen";
import { defaultPrFilters, prListQuery, prRouteFallbackQuery, readPrRoute } from "../model/list";

/**
 * A GitHub pull request's deep-linkable page (notifications, the Pull requests list). It is the
 * shared record page; a cold link reads the list's own default first and, when the pull request
 * is not there (closed, merged, older), every state in its repository.
 */
export function PullRequestDetailScreen() {
  const params = useLocalSearchParams<{ id: string; repo?: string; projectPath?: string; machineId?: string; projectId?: string }>();
  const copy = useCopy();
  const projectId = params.projectId || null;
  const route = readPrRoute(params);
  const target = route ? { provider: "github" as const, kind: "pr" as const, ...route } : null;
  return <InboxRecordPage target={target} machineId={params.machineId} projectId={projectId}
    coldReads={(record) => [prListQuery(defaultPrFilters), prRouteFallbackQuery(record)]}
    fallback={{ href: { pathname: "/pull-requests", params: { machineId: params.machineId ?? "", projectId: projectId ?? "" } }, label: copy("Pull request’ler", "Pull requests") }}
    notFound={{ title: copy("Pull request açılamadı", "Could not open pull request"),
      unavailable: copy("Pull request erişimi kullanılamıyor", "Pull request access unavailable"),
      hint: copy("Pull request listesinden aç.", "Open it from the pull request list.") }} />;
}
