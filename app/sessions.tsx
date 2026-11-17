import { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActiveSessionsScreen } from "../src/features/workspace/active-sessions-screen";
import { launchFromParams, useLaunchRequest } from "../src/features/sharing/model/launch-request";

export default function SessionsRoute() {
  const {
    view,
    new: create,
    prompt,
    project,
    n,
  } = useLocalSearchParams<{
    view?: string;
    new?: string;
    prompt?: string;
    project?: string;
    n?: string;
  }>();
  // A prompt link queues its text (and project) for the new-session sheet; `n` makes a repeated
  // identical link a fresh request. The text is never sent, only placed in the new draft.
  useEffect(() => {
    const launch = launchFromParams({ prompt, project });
    if (create === "1" && launch) useLaunchRequest.getState().queue(launch);
  }, [create, prompt, project, n]);
  return (
    <ActiveSessionsScreen
      overview={view !== "active"}
      initialCreate={create === "1"}
      createRequest={create === "1" ? `${prompt ?? ""}|${project ?? ""}|${n ?? ""}` : undefined}
    />
  );
}
