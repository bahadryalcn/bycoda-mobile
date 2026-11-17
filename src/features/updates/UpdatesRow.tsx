import { useState } from "react";
import * as Updates from "expo-updates";
import Download from "lucide-react-native/icons/download";

import { IconTile } from "../../ui/icon-tile";
import { useCopy } from "../../ui/copy";
import { NavigationGroup, NavigationRow, Notice } from "../../ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { updateRow, updatesSupported, type UpdatePhase } from "./model/update-row";

/**
 * Settings → About: check for an over-the-air update, download it, then restart only when the
 * owner says so. Hidden in development builds and when the runtime has updates disabled.
 */
export function UpdatesRow() {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  if (!updatesSupported({ dev: __DEV__, enabled: Updates.isEnabled, web: process.env.EXPO_OS === "web" })) return null;
  const row = updateRow(phase, copy);

  const fail = (cause: unknown) => {
    setError(cause instanceof Error && cause.message ? cause.message : copy("Güncelleme başarısız oldu.", "The update failed."));
    setPhase("error");
  };
  const run = async () => {
    setError(null);
    try {
      if (row.action === "check") {
        setPhase("checking");
        const result = await Updates.checkForUpdateAsync();
        setPhase(result.isAvailable ? "available" : "current");
      } else if (row.action === "download") {
        setPhase("downloading");
        const result = await Updates.fetchUpdateAsync();
        setPhase(result.isNew ? "ready" : "current");
      } else if (row.action === "restart") {
        await Updates.reloadAsync();
      }
    } catch (cause) {
      fail(cause);
    }
  };

  return (
    <>
      <NavigationGroup>
        <NavigationRow
          label={row.label}
          detail={row.detail}
          intent="command"
          icon={
            <IconTile color={colors.muted}>
              <Download size={18} strokeWidth={2} color={colors.muted} />
            </IconTile>
          }
          busy={row.busy}
          disabled={!row.action}
          onPress={() => void run()}
        />
      </NavigationGroup>
      {error ? <Notice tone="danger" message={error} /> : null}
    </>
  );
}
