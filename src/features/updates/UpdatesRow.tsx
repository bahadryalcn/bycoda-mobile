import { useState } from "react";
import * as Updates from "expo-updates";
import Download from "lucide-react-native/icons/download";

import { useCopy } from "../../ui/copy";
import { NavigationGroup, NavigationRow, Notice, RowIcon } from "../../ui/primitives";
import { updateFailureMessage, updateRow, updatesSupported, type UpdateAction, type UpdatePhase } from "./model/update-row";

/**
 * Settings → About: check for an over-the-air update, download it, then restart only when the
 * owner says so. Hidden in development builds and when the runtime has updates disabled.
 */
export function UpdatesRow() {
  const copy = useCopy();
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<UpdateAction | null>(null);
  if (!updatesSupported({ dev: __DEV__, enabled: Updates.isEnabled, web: process.env.EXPO_OS === "web" })) return null;
  const row = updateRow(phase, copy, failed);

  const run = async () => {
    const action = row.action;
    if (!action) return;
    setError(null);
    setFailed(null);
    try {
      if (action === "check") {
        setPhase("checking");
        const result = await Updates.checkForUpdateAsync();
        setPhase(result.isAvailable ? "available" : "current");
      } else if (action === "download") {
        setPhase("downloading");
        const result = await Updates.fetchUpdateAsync();
        setPhase(result.isNew ? "ready" : "current");
      } else {
        await Updates.reloadAsync();
      }
    } catch {
      // The raw expo-updates message is English-only; show localized copy for the failed step.
      setError(updateFailureMessage(action, copy));
      setFailed(action);
      setPhase("error");
    }
  };

  return (
    <>
      <NavigationGroup>
        <NavigationRow
          label={row.label}
          detail={row.detail}
          intent="command"
          icon={<RowIcon glyph={Download} />}
          busy={row.busy}
          disabled={!row.action}
          onPress={() => void run()}
        />
      </NavigationGroup>
      {error ? <Notice tone="danger" message={error} /> : null}
    </>
  );
}
