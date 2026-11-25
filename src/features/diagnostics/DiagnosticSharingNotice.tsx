import { useEffect, useState, useSyncExternalStore } from "react";
import { Body, CodePanel, CodeText, Disclosure, FormActions, Sheet, Stack } from "../../ui/primitives";
import { useCopy } from "../../ui/copy";
import { ActionableToast } from "../../ui/provider";
import { useAccount } from "../account/ui/account-context";
import {
  diagnosticPending,
  diagnosticReceipt,
  dismissDiagnosticReceipt,
  hydrateDiagnosticReceipts,
  mountDiagnosticSharing,
  subscribeDiagnosticSharing,
} from "./diagnostic-sharing";

export function DiagnosticSharingNotice() {
  const copy = useCopy();
  const account = useAccount();
  const pending = useSyncExternalStore(subscribeDiagnosticSharing, diagnosticPending);
  const receipt = useSyncExternalStore(subscribeDiagnosticSharing, diagnosticReceipt);
  const [openId, setOpenId] = useState<number | null>(null);
  const item = pending ?? receipt;
  const opened = item && item.id === openId;
  const runtime = account.runtime;
  const status = account.status;
  useEffect(() => {
    void hydrateDiagnosticReceipts().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (status === "loading") return;
    return mountDiagnosticSharing();
  }, [runtime, status]);

  if (!item) return null;
  const close = () => {
    pending?.inspect(false);
    setOpenId(null);
  };
  const cancelLabel = copy("Gönderimi iptal et", "Cancel sending");
  const inspect = () => {
    pending?.inspect(true);
    setOpenId(item.id);
  };

  return <>
    {!opened ? (
      <ActionableToast
        tone={pending ? "info" : "success"}
        message={pending
          ? copy("Tanılama raporu hazır", "Diagnostic report ready")
          : copy("Tanılama raporu gönderildi", "Diagnostic report sent")}
        description={pending?.automatic
          ? copy("Rapor otomatik gönderilecek.", "The report will be sent automatically.")
          : undefined}
        action={{ label: copy("Raporu incele", "Review report"), onPress: inspect }}
        secondaryAction={pending
          ? { label: cancelLabel, onPress: () => pending.decide(false) }
          : { label: copy("Kapat", "Close"), onPress: dismissDiagnosticReceipt }}
      />
    ) : null}
    <Sheet visible={Boolean(opened)} title={copy("Tanılama raporu", "Diagnostic report")} onClose={close}>
      <Stack>
        <Body>{copy(
          "Hata kayıtlarını yalnızca sorunları anlamak ve Bycoda’yı iyileştirmek için kullanıyoruz. Gönderilecek içeriği inceleyebilirsin.",
          "We use error logs only to understand problems and improve Bycoda. You can inspect the report before sending it.",
        )}</Body>
        {pending?.automatic && <Body muted>{copy("Raporu incelerken otomatik gönderim bekler.", "Automatic sending pauses while you review this report.")}</Body>}
        <CodeText>{item.destination}</CodeText>
        {item.linkedToAccount ? <Body>{copy("Bycoda hesabına bağlı", "Linked to your Bycoda account")}</Body> : null}
        {!pending && receipt ? <Body>{new Date(receipt.sentAt).toLocaleString()}</Body> : null}
        <Disclosure label="diagnostics.log"><CodePanel horizontal={false}><CodeText>{item.log}</CodeText></CodePanel></Disclosure>
        <Disclosure label="report.json"><CodePanel horizontal={false}><CodeText>{item.metadata}</CodeText></CodePanel></Disclosure>
        {pending ? <FormActions
          submitLabel={copy("Bir kez gönder", "Send once")}
          onSubmit={() => { pending.decide(true); close(); }}
          cancelLabel={cancelLabel}
          onCancel={() => { pending.decide(false); close(); }}
        /> : null}
      </Stack>
    </Sheet>
  </>;
}
