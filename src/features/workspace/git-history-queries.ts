import { useHostQuery } from "@/state/queries";
import type { GitScope } from "./git-types";
import { gitHistoryRequest, validateGitHistoryResponse, type GitHistoryRead } from "./git-history-model";

export function useGitHistoryRead<T>(scope: GitScope, read: GitHistoryRead, enabled = true) {
  return useHostQuery<T>(
    ["git-history", scope.projectId, scope.cwd, scope.root, read],
    "workspace.run",
    {},
    {
      enabled: !!scope.root && enabled,
      queryFn: async (client, signal) => validateGitHistoryResponse(read,
        await client.request<unknown>("workspace.run", gitHistoryRequest(scope, read), { signal })) as T,
    },
  );
}
