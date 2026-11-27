import { useEffect, useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActiveSessionsScreen } from "../src/features/workspace/active-sessions-screen";
import { openNewChat } from "../src/features/workspace/new-chat-navigation";
import { launchFromParams, useLaunchRequest } from "../src/features/sharing/model/launch-request";

export default function SessionsRoute() {
  const {
    new: create,
    prompt,
    project,
    n,
  } = useLocalSearchParams<{
    new?: string;
    prompt?: string;
    project?: string;
    n?: string;
  }>();
  // `new=1` opens the empty new session; a prompt link's text (and project) seeds its draft and is
  // never sent. Only a system share waiting in the launch queue keeps the new-session sheet, which
  // previews the shared files that go into the new session's draft. `n` makes a repeated identical
  // link a fresh request. Decided once per request, before the sheet can take the queued share.
  const share = useMemo(
    () => create === "1" && !launchFromParams({ prompt, project }) && !!useLaunchRequest.getState().request,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `n` marks a new request with the same params.
    [create, prompt, project, n],
  );
  useEffect(() => {
    if (create !== "1" || share) return;
    const launch = launchFromParams({ prompt, project });
    openNewChat(launch ? { prompt: launch.text, ...(launch.project ? { project: launch.project } : {}) } : {});
  }, [create, prompt, project, n, share]);
  return (
    <ActiveSessionsScreen
      initialCreate={share}
      createRequest={share ? `${prompt ?? ""}|${project ?? ""}|${n ?? ""}` : undefined}
    />
  );
}
