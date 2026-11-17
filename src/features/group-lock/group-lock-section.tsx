import { useState } from "react";
import { View } from "react-native";
import Lock from "lucide-react-native/icons/lock";
import LockOpen from "lucide-react-native/icons/lock-open";
import EyeOff from "lucide-react-native/icons/eye-off";
import { Button, NavigationGroup, NavigationRow } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import type { HostProjectDirectory } from "@/domain/types";
import { GroupPasswordSheet, HiddenGroupsSheet } from "./group-lock-sheets";
import { useGroupLock } from "./use-group-lock";

/**
 * Locked groups (name and lock icon), groups this phone unlocked, and the hidden-groups
 * entry. Renders nothing when the Host cannot verify passwords through a desktop.
 */
export function GroupLockSection({ directory }: { directory: HostProjectDirectory | undefined }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const lock = useGroupLock(directory);
  const [unlocking, setUnlocking] = useState<{ id: string; name: string }>();
  const [hiddenStep, setHiddenStep] = useState<"password" | "list">();
  if (!lock.supported || !directory) return null;
  return (
    <View style={{ gap: space.sm, paddingBottom: space.sm }}>
      <NavigationGroup>
        {lock.locked.map((group) => (
          <NavigationRow
            key={group.id}
            label={group.name}
            intent="command"
            icon={<Lock size={18} color={colors.muted} />}
            trailing={<Button label={copy("Kilidi aç", "Unlock")} tone="quiet" density="compact" onPress={() => setUnlocking(group)} />}
            onPress={() => setUnlocking(group)}
          />
        ))}
        {lock.unlocked.map((group) => (
          <NavigationRow
            key={group.id}
            label={group.name}
            intent="command"
            icon={<LockOpen size={18} color={colors.accent} />}
            trailing={<Button label={copy("Kilitle", "Lock")} tone="quiet" density="compact" onPress={() => void lock.lock(group.id)} />}
            onPress={() => void lock.lock(group.id)}
          />
        ))}
        <NavigationRow
          label={copy("Gizli gruplar", "Hidden groups")}
          intent="navigate"
          icon={<EyeOff size={18} color={colors.muted} />}
          onPress={() => setHiddenStep(lock.hidden ? "list" : "password")}
        />
      </NavigationGroup>
      {unlocking ? (
        <GroupPasswordSheet
          key={unlocking.id}
          title={unlocking.name}
          submitLabel={copy("Kilidi aç", "Unlock")}
          onSubmit={(password) => lock.unlock(unlocking.id, password)}
          onClose={() => setUnlocking(undefined)}
        />
      ) : null}
      {hiddenStep === "password" ? (
        <GroupPasswordSheet
          title={copy("Gizli gruplar", "Hidden groups")}
          submitLabel={copy("Devam", "Continue")}
          onSubmit={lock.authorizeHidden}
          onDone={() => setHiddenStep("list")}
          onClose={() => setHiddenStep(undefined)}
        />
      ) : null}
      {hiddenStep === "list" && lock.hidden ? (
        <HiddenGroupsSheet
          view={lock}
          onSetHidden={lock.setHidden}
          onLockAll={() => lock.lock()}
          onClose={() => setHiddenStep(undefined)}
        />
      ) : null}
    </View>
  );
}
