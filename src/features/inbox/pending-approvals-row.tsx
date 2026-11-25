import { router } from "expo-router";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import { NavigationGroup, NavigationRow, RowIcon } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { usePendingApprovalCount } from "../approvals/use-approvals";

/**
 * Inbox entry to the Approvals screen, so approvals are not reachable only from a push or the
 * assistant. Renders nothing when the computer sends no approvals or none is pending.
 */
export function PendingApprovalsRow() {
  const copy = useCopy();
  const count = usePendingApprovalCount();
  if (!count) return null;
  return (
    <NavigationGroup>
      <NavigationRow
        label={copy("Onaylar", "Approvals")}
        detail={copy("{p0} onay bekliyor", "{p0} waiting for approval", { p0: count })}
        icon={<RowIcon glyph={ShieldCheck} />}
        onPress={() => router.push("/approvals")}
      />
    </NavigationGroup>
  );
}
