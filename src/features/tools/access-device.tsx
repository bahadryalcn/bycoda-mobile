import { useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation } from "@/state/queries";
import { assertAppAccess } from "@/state/security";
import { flushWorkspaceDrafts } from "@/features/workspace/draft-guard";
import { Body, Button, ConfirmationCard, ErrorText, MutationState, Notice, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { deviceRevokeIntent, type AccessTarget, type PairedDevice } from "./access-center-model";
export function AccessDevice({ target, device, onClose, onUpdated }: { target: AccessTarget; device: PairedDevice; onClose: () => void; onUpdated: () => void }) {
  const copy = useCopy(); const machine = useActiveMachine();
  const [opening] = useState(() => ({ target: { ...target }, device: { ...device } }));
  const [confirming, setConfirming] = useState(false); const [uncertain, setUncertain] = useState(false); const [cleanup, setCleanup] = useState(false);
  const [error, setError] = useState<unknown>(); const [localBusy, setLocalBusy] = useState(false); const occupied = useRef(false);
  const intent = deviceRevokeIntent(opening.device);
  const revoke = useHostMutation<{ revoked: boolean }>(intent.method, ["host-access"]);
  const current = () => useMachines.getState().activeId === opening.target.machineId && machine?.id === opening.target.machineId && machine.environmentId === opening.target.environmentId;
  const busy = revoke.isPending || localBusy;
  const supported = opening.device.isCurrent || machine?.capabilities?.includes("devices.revokeOther");
  const localCleanup = async () => {
    try { setLocalBusy(true); assertAppAccess(); await useMachines.getState().removeMachine(opening.target.machineId); onClose(); }
    catch (cause) { setError(cause); } finally { setLocalBusy(false); }
  };
  const run = () => {
    if (occupied.current || !current() || !supported || uncertain || cleanup) return;
    occupied.current = true; setLocalBusy(true); setError(undefined);
    void (async () => {
      assertAppAccess();
      if (opening.device.isCurrent) await flushWorkspaceDrafts();
      if (!current()) throw new Error("The selected computer changed. Reopen the device.");
      const result = await revoke.mutateAsync(intent.params);
      if (opening.device.isCurrent) {
        if (!result.revoked) throw new Error("The host did not confirm credential revocation.");
        setCleanup(true); await localCleanup();
      } else if (current()) { onUpdated(); onClose(); }
    })().catch((cause: unknown) => {
      setError(cause); if (cause && typeof cause === "object" && "uncertain" in cause && cause.uncertain === true) setUncertain(true);
    }).finally(() => { occupied.current = false; setLocalBusy(false); });
  };
  return <Sheet visible title={opening.device.name} size="compact" dismissible={!busy} onClose={onClose}>
    <Body mono>{opening.target.machineId} / {opening.device.id}</Body>
    <Body>{opening.device.isCurrent ? copy("Bu telefonun bilgisayara erişimi", "This phone's access to the computer") : copy("Başka bir eşleştirilmiş cihaz", "Another paired device")}</Body>
    {uncertain ? <Notice tone="warning" message={copy("İptalin sonucu bilinmiyor. İşlemi tekrar göndermeden bilgisayarda kontrol edin.", "The revocation outcome is unknown. Check the computer before sending the action again.")} /> : null}
    <ErrorText error={error} /><MutationState mutation={revoke} />
    {cleanup ? <Button label={copy("Telefondaki bağlantıyı kaldırmayı yeniden dene", "Retry removing the local connection")} disabled={busy} onPress={() => { void localCleanup(); }} /> : confirming ?
      <ConfirmationCard message={opening.device.isCurrent ? copy("Bu telefonun erişimini iptal et ve güvenli depodaki bağlantısını kaldır? Oturumlar bilgisayarda çalışmaya devam eder; yeniden eşleştirmen gerekir.", "Revoke this phone's access and remove its securely stored connection? Sessions keep running on the computer; pairing again will be required.") : copy("Bu cihazın bilgisayara erişimini iptal et? Bu telefonun bağlantısı korunur.", "Revoke this device's access to the computer? This phone's connection is preserved.")}
        confirmLabel={copy("Erişimi iptal et", "Revoke access")} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy} disabled={!current() || !supported || uncertain} onCancel={() => setConfirming(false)} onConfirm={run} /> :
      <Button tone="danger" label={opening.device.isCurrent ? copy("Bu telefonun erişimini iptal et", "Revoke this phone's access") : copy("Cihaz erişimini iptal et", "Revoke device access")} disabled={!current() || !supported || uncertain || busy} onPress={() => setConfirming(true)} />}
  </Sheet>;
}
