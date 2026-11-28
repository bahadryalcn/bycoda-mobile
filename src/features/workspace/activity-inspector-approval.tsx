import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { ApprovalCommandRefused, canAllowForSession, captureApprovalCommand } from "@/domain/approval-command";
import { RemoteHostError } from "@/remote/host-error";
import { hostKey } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { Badge, StatusText, Body, Button, ErrorText } from "@/ui/primitives";
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
type Delivery = { status: "sending" | "accepted" | "unknown"; decision: "allow" | "deny"; forSession?: true };
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
  const cache = useQueryClient();
  const machine = useActiveMachine();
  // Desktop offers this only for a Host-scoped request on a Host with session grants.
  const sessionGrant = machine?.id === scope.machineId && canAllowForSession(machine.capabilities, approval);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  /** Reads the session again. A still-open approval may then be answered by hand; nothing is resent. */
  const checkStatus = async () => {
    if (checkingRef.current) return;
    const key = hostKey(scope.machineId, ["session", scope.sessionId]);
    const readBefore = cache.getQueryState(key)?.dataUpdatedAt ?? 0;
    checkingRef.current = true;
    setChecking(true);
    try {
      await cache.refetchQueries({ queryKey: key, exact: true }, { throwOnError: true });
      // Without a newer session read there is no evidence, so the hold stays.
      const refreshed = (cache.getQueryState(key)?.dataUpdatedAt ?? 0) > readBefore;
      if (refreshed && deliveries.get(identity)?.status === "unknown") {
        deliveries.delete(identity);
        sending.current = false;
        setDelivery(undefined);
        setError(null);
      }
    } catch (cause) {
      setError(cause);
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };
  // Authoritative provider resolution releases the local navigation hold.
  useEffect(() => {
    if (approval.decided) deliveries.delete(identity);
  }, [approval.decided, identity]);
  const decide = async (decision: "allow" | "deny", forSession?: true) => {
    if (disabled || !runId || approval.decided || deliveries.has(identity) || sending.current) return;
    if (forSession && !sessionGrant) return;
    const command = captureApprovalCommand(scope.sessionId, runId, approval, decision, forSession);
    const update = (status: Delivery["status"]) => {
      const next: Delivery = { status, decision, ...(forSession ? { forSession } : {}) };
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
  if (approval.decided) return <StatusText
    tone={approval.decided === "allow" ? "success" : approval.decided === "deny" ? "danger" : "warning"}
    label={approval.decided === "allow" ? copy("İzin verildi", "Allowed") : approval.decided === "cancelled" ? copy("İptal edildi", "Cancelled") : copy("Reddedildi", "Denied")} />;
  const held = disabled || !runId || !!delivery;
  return <View style={{ gap: space.sm }}>
    <Body>{copy("Bu işlem için onayın gerekiyor.", "This action needs your approval.")}</Body>
    <View style={{ gap: space.sm }}>
      <Button label={copy("İzin ver", "Allow")} tone="primary" fullWidth reserveTouchTarget disabled={held}
        busy={delivery?.status === "sending" && delivery.decision === "allow" && !delivery.forSession} onPress={() => { void decide("allow"); }} />
      {sessionGrant ? <Button label={copy("Bu oturumda izin ver", "Allow for this session")}
        accessibilityLabel={copy("Bu oturumda çalışma alanında dosya adı aramaya izin ver", "Allow workspace filename search for this session")}
        fullWidth reserveTouchTarget disabled={held}
        busy={delivery?.status === "sending" && !!delivery.forSession} onPress={() => { void decide("allow", true); }} /> : null}
      <Button label={copy("Reddet", "Deny")} tone="quiet" fullWidth reserveTouchTarget disabled={held}
        busy={delivery?.status === "sending" && delivery.decision === "deny"} onPress={() => { void decide("deny"); }} />
    </View>
    {!runId ? <Body muted>{copy("Onay için oturumun güncel durumunu yükle.", "Refresh the session to approve.")}</Body> : null}
    {delivery?.status === "accepted" ? <Body muted>{copy("Karar gönderildi · doğrulama bekleniyor", "Decision sent · waiting for confirmation")}</Body> : null}
    {delivery?.status === "unknown" ? <View accessibilityRole="alert"><Badge tone="warning" label={copy("Onayın teslimi doğrulanamadı", "Approval delivery not confirmed")} /></View> : null}
    {delivery?.status === "unknown" ? <Body muted>{copy("Yeniden denemeden önce oturumu kontrol et.", "Check the session before trying again.")}</Body> : null}
    {!runId || delivery?.status === "unknown" ? <Button label={copy("Durumu kontrol et", "Check status")} fullWidth reserveTouchTarget
      busy={checking} disabled={checking} onPress={() => { void checkStatus(); }} /> : null}
    <ErrorText error={error} />
  </View>;
}
