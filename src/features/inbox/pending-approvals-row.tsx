import ShieldCheck from "lucide-react-native/icons/shield-check";
import { NavigationGroup, NavigationRow, RowIcon } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { pendingApprovalCount } from "../approvals/approvals-model";
import { useApprovals } from "../approvals/use-approvals";
import { pushOnce } from "@/ui/navigation";

/**
 * Inbox entry to the Approvals screen, so approvals are not reachable only from a push or the
 * assistant. Always present when the computer sends approvals, so answered and expired ones stay
 * reachable; the count shows only while something is pending.
 */
export function PendingApprovalsRow() {
  const copy = useCopy();
  const { approvals, supported } = useApprovals(15000);
  if (!supported) return null;
  const count = pendingApprovalCount(approvals, Date.now());
  return (
    <NavigationGroup>
      <NavigationRow
        label={copy("Onaylar", "Approvals")}
        detail={count ? copy("{p0} onay bekliyor", "{p0} waiting for approval", { p0: count }) : undefined}
        icon={<RowIcon glyph={ShieldCheck} />}
        onPress={() => pushOnce("/approvals")}
      />
    </NavigationGroup>
  );
}
