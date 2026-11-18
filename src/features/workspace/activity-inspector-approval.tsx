import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ApprovalCommandRefused, captureApprovalCommand } from "@/domain/approval-command";
import { RemoteHostError } from "@/remote/host-error";
import { Badge, Body, Button, ErrorText, Row } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import type { Block } from "./wire";
import type { SessionCommand, SessionScope } from "./session-types";

type Props = {
  approval: NonNullable<Block["approval"]>;
  scope: SessionScope;
  runId?: string;
  disabled: boolean;
  onCommand: SessionCommand;
};
type Delivery = { status: "sending" | "accepted" | "unknown"; decision: "allow" | "deny" };
// An unresolved occurrence stays held across navigation. A receipt alone is not a provider decision.
const deliveries = new Map<string, Delivery>();

/** Transcript owner supplies the same guarded command dispatcher as every other action. */
export function ActivityApproval(props: Props) {
  const identity = JSON.stringify([props.scope.machineId, props.scope.sessionId, props.runId, props.approval.occurrenceId, props.approval.requestId]);
  return <ApprovalOwner key={identity} {...props} identity={identity} />;
}

function ApprovalOwner({ approval, scope, runId, disabled, onCommand, identity }: Props & { identity: string }) {
  const copy = useCopy();
  const [delivery, setDelivery] = useState(() => deliveries.get(identity));
  const [error, setError] = useState<unknown>(null);
  const sending = useRef(false);
  // Authoritative provider resolution releases the local navigation hold.
  useEffect(() => {
    if (approval.decided) deliveries.delete(identity);
  }, [approval.decided, identity]);
  const decide = async (decision: "allow" | "deny") => {
    if (disabled || !runId || approval.decided || deliveries.has(identity) || sending.current) return;
    const command = captureApprovalCommand(scope.sessionId, runId, approval, decision);
    const update = (status: Delivery["status"]) => {
      const next = { status, decision };
      deliveries.set(identity, next);
      setDelivery(next);
    };
    sending.current = true;
    setError(null);
    update("sending");
    try {
      await onCommand(command);
      update("accepted");
    } catch (cause) {
      setError(cause);
      if (cause instanceof ApprovalCommandRefused || cause instanceof RemoteHostError && !cause.uncertain) {
        deliveries.delete(identity);
        setDelivery(undefined);
        sending.current = false;
      } else update("unknown");
    }
  };
  if (approval.decided) return <Badge
    tone={approval.decided === "allow" ? "success" : approval.decided === "deny" ? "danger" : "warning"}
    label={approval.decided === "allow" ? copy("İzin verildi", "Allowed") : approval.decided === "cancelled" ? copy("İptal edildi", "Cancelled") : copy("Reddedildi", "Denied")} />;
  const held = disabled || !runId || !!delivery;
  return <View style={{ gap: space.sm }}>
    <Body>{copy("Bu işlem için onayın gerekiyor.", "This action needs your approval.")}</Body>
    <Row>
      <Button label={copy("İzin ver", "Allow")} density="compact" tone="success" disabled={held}
        busy={delivery?.status === "sending" && delivery.decision === "allow"} onPress={() => { void decide("allow"); }} />
      <Button label={copy("Reddet", "Deny")} density="compact" tone="danger" disabled={held}
        busy={delivery?.status === "sending" && delivery.decision === "deny"} onPress={() => { void decide("deny"); }} />
    </Row>
    {!runId ? <Body muted>{copy("Onay için oturumun güncel durumunu yükle.", "Refresh the session to approve.")}</Body> : null}
    {delivery?.status === "accepted" ? <Body muted>{copy("Karar gönderildi · doğrulama bekleniyor", "Decision sent · waiting for confirmation")}</Body> : null}
    {delivery?.status === "unknown" ? <View accessibilityRole="alert"><Badge tone="warning" label={copy("Onayın teslimi doğrulanamadı", "Approval delivery not confirmed")} /></View> : null}
    {delivery?.status === "unknown" ? <Body muted>{copy("Yeniden denemeden önce konuşmayı kontrol et.", "Check the conversation before trying again.")}</Body> : null}
    <ErrorText error={error} />
  </View>;
}
