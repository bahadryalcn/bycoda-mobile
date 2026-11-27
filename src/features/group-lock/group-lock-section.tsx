import { use, useState } from "react";
import { View } from "react-native";
import Lock from "lucide-react-native/icons/lock";
import LockOpen from "lucide-react-native/icons/lock-open";
import EyeOff from "lucide-react-native/icons/eye-off";
import { Button, NavigationGroup, NavigationRow } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { SheetGuardContext } from "@/ui/sheet-guard-context";
import type { HostProjectDirectory } from "@/domain/types";
import { GroupPasswordSheet, HiddenGroupsSheet } from "./group-lock-sheets";
import { useGroupLock } from "./use-group-lock";

/**
 * Locked groups (name and lock icon) and groups this phone unlocked, above the project list.
 * Renders nothing when there are none or the Host cannot verify passwords through a desktop.
 * Hidden groups are not a list row: they open from the Projects "Sort and view" sheet.
 */
export function GroupLockSection({ directory }: { directory: HostProjectDirectory | undefined }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const lock = useGroupLock(directory);
  const [unlocking, setUnlocking] = useState<{ id: string; name: string }>();
  if (!lock.supported || !directory || !lock.locked.length && !lock.unlocked.length) return null;
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
    </View>
  );
}

/** Whether this computer offers hidden groups, and how many are hidden once the list is open. */
export function useHiddenGroupsEntry(directory: HostProjectDirectory | undefined) {
  const lock = useGroupLock(directory);
  return { supported: lock.supported && !!directory, count: lock.hidden?.length };
}

/**
 * The "Hidden groups" entry inside a view-options sheet: it closes that sheet first, then the
 * page opens `HiddenGroupsFlow`, so two sheets never stack. The count shows once it is known.
 */
export function HiddenGroupsRow({ count, onOpen }: { count?: number; onOpen: () => void }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const sheet = use(SheetGuardContext);
  return (
    <NavigationRow
      label={copy("Gizli gruplar", "Hidden groups")}
      intent="navigate"
      icon={<EyeOff size={18} color={colors.muted} />}
      detail={count ? String(count) : undefined}
      onPress={() => (sheet ? sheet.requestCloseThen(onOpen) : onOpen())}
    />
  );
}

/** The hidden-groups password and list sheets, opened from `HiddenGroupsRow`. */
export function HiddenGroupsFlow({ directory, open, onClose }: {
  directory: HostProjectDirectory | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const copy = useCopy();
  const lock = useGroupLock(directory);
  const [authorized, setAuthorized] = useState(false);
  if (!open || !lock.supported || !directory) return null;
  const close = () => { setAuthorized(false); onClose(); };
  // The password opens the hidden list; once the Host returns it, the list sheet takes over.
  if (!lock.hidden) return authorized ? null : (
    <GroupPasswordSheet
      title={copy("Gizli gruplar", "Hidden groups")}
      submitLabel={copy("Devam", "Continue")}
      onSubmit={lock.authorizeHidden}
      onDone={() => setAuthorized(true)}
      onClose={close}
    />
  );
  return <HiddenGroupsSheet view={lock} onSetHidden={lock.setHidden} onLockAll={() => lock.lock()} onClose={close} />;
}
