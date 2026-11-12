import { useEffect, useState } from "react";
import { View } from "react-native";
import { useCopy } from "@/ui/copy";
import { Badge, Body, Button, Card, Heading, Notice, Row } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { ApprovalDetails } from "./approval-details";
import { approvalOpen, remainingTime, type ApprovalView } from "./approvals-model";
import { approvalSignatureMatches } from "./approvals-signature";

/** What this phone knows about its own answer for one approval. */
export type LocalDecision = "sending" | "sent" | "uncertain" | "rejected";

export function ApprovalCard({
  approval,
  now,
  local,
  sentApproved,
  canDecide,
  onDecide,
  onCheck,
  checking,
}: {
  approval: ApprovalView;
  now: number;
  local?: LocalDecision;
  sentApproved?: boolean;
  canDecide: boolean;
  onDecide(approval: ApprovalView, approved: boolean): void;
  onCheck(): void;
  checking: boolean;
}) {
  const copy = useCopy();
  const [verified, setVerified] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    void approvalSignatureMatches(approval).then((ok) => current && setVerified(ok));
    return () => {
      current = false;
    };
  }, [approval]);
  const open = approvalOpen(approval, now);
  const left = remainingTime(approval.deadline, now);
  const expired = approval.status === "expired" || (approval.status === "pending" && !open);
  const status =
    approval.status === "approved"
      ? ([copy("Onaylandı", "Approved"), "success"] as const)
      : approval.status === "denied"
        ? ([copy("Reddedildi", "Denied"), "danger"] as const)
        : expired
          ? ([copy("Süresi doldu", "Expired"), "warning"] as const)
          : ([copy("Bekliyor", "Waiting"), "active"] as const);
  const decidedBy =
    approval.decidedBy === "desktop"
      ? copy("Bilgisayarda yanıtlandı.", "Answered on the computer.")
      : approval.decidedBy === "phone"
        ? copy("Telefondan yanıtlandı.", "Answered from this phone.")
        : null;
  const busy = local === "sending";
  const actionable = open && approval.remote && canDecide && local !== "sent" && local !== "sending";
  return (
    <Card variant="surface">
      <View style={{ gap: space.sm }}>
        <Row>
          <Badge label={status[0]} tone={status[1]} />
          {open && left ? <Badge label={copy("{p0} kaldı", "{p0} left", { p0: left })} /> : null}
        </Row>
        <Heading>{approval.title}</Heading>
        <Body>{approval.message}</Body>
        {approval.details ? <ApprovalDetails details={approval.details} /> : null}
        {expired ? (
          <Notice
            tone="warning"
            message={approval.notice ?? copy("Süre doldu; işlem yapılmadı.", "Time ran out; nothing was done.")}
          />
        ) : null}
        {!expired && approval.status !== "pending" && decidedBy ? <Body muted>{decidedBy}</Body> : null}
        {open && !approval.remote ? (
          <Notice
            message={copy(
              "Bilgisayarda onayla. Bu istek telefondan yanıtlanamaz.",
              "Approve on the computer. This request cannot be answered from a phone.",
            )}
          />
        ) : null}
        {open && approval.remote && verified === false ? (
          <Notice
            tone="warning"
            message={copy(
              "Bu istek doğrulanamadı; buradan yanıtlanamaz. Bilgisayarda onayla.",
              "This request could not be verified, so it cannot be answered here. Approve on the computer.",
            )}
          />
        ) : null}
        {open && local === "sent" ? (
          <Notice
            tone="success"
            message={
              sentApproved
                ? copy("Onayın bilgisayara gönderildi.", "Your approval was sent to your computer.")
                : copy("Reddin bilgisayara gönderildi.", "Your denial was sent to your computer.")
            }
          />
        ) : null}
        {open && local === "rejected" ? (
          <Notice
            tone="danger"
            message={copy(
              "Bilgisayar bu yanıtı kabul etmedi. Listeyi yenile.",
              "The computer did not accept this answer. Refresh the list.",
            )}
          />
        ) : null}
        {open && local === "uncertain" ? (
          <Notice
            tone="warning"
            message={copy(
              "Yanıtın ulaşıp ulaşmadığı bilinmiyor. Otomatik olarak yeniden gönderilmeyecek.",
              "It is unknown whether your answer arrived. It will not be resent automatically.",
            )}
            action={{ label: copy("Durumu kontrol et", "Check status"), onPress: onCheck }}
          />
        ) : null}
        {actionable && verified && local !== "uncertain" ? (
          <View style={{ gap: space.xs }}>
            <Button
              label={approval.confirmLabel || copy("Onayla", "Approve")}
              tone="primary"
              fullWidth
              busy={busy}
              disabled={busy || checking}
              onPress={() => onDecide(approval, true)}
            />
            <Button
              label={copy("Reddet", "Deny")}
              fullWidth
              disabled={busy || checking}
              onPress={() => onDecide(approval, false)}
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
}
