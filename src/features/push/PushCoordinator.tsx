import { useEffect } from "react";
import { usePushPreferences } from "./push-model";
import { usePushRegistration, usePushResponses } from "./use-push";

function ActivePushCoordinator() {
  const hydrate = usePushPreferences((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  usePushRegistration();
  usePushResponses();
  return null;
}

/** Mounted once in the app lifecycle. Remote pushes are native only. */
export function PushCoordinator() {
  if (process.env.EXPO_OS === "web") return null;
  return <ActivePushCoordinator />;
}
