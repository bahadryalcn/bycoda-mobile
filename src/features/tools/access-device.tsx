import { useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { useHostMutation } from "@/state/queries";
import { assertAppAccess } from "@/state/security";
import { flushWorkspaceDrafts } from "@/features/workspace/draft-guard";
import { Body, FormActions, ErrorText, MutationState, Notice, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { deviceRevokeIntent, type AccessTarget, type PairedDevice } from "./access-center-model";
export function AccessDevice({ target, device, canManageOtherDevices = true, onClose, onUpdated }: { target: AccessTarget; device: PairedDevice; canManageOtherDevices?: boolean; onClose: () => void; onUpdated: () => void }) {
  const copy = useCopy(); const machine = useActiveMachine();
  const [opening] = useState(() => ({ target: { ...target }, device: { ...device }, reviewed: reviewedMachine(machine) }));
  const [confirming, setConfirming] = useState(false); const [uncertain, setUncertain] = useState(false); const [cleanup, setCleanup] = useState(false);
  const [error, setError] = useState<unknown>(); const [localBusy, setLocalBusy] = useState(false); const occupied = useRef(false);
  const intent = deviceRevokeIntent(opening.device);
  const revoke = useHostMutation<{ revoked: boolean }>(intent.method, ["host-access"]);
  const invalidated = useRef(false);
  const current = () => {
    if (opening.reviewed?.id !== opening.target.machineId || opening.reviewed.environmentId !== opening.target.environmentId || !isReviewedMachine(opening.reviewed, useMachines.getState())) invalidated.current = true;
    return !invalidated.current;
  };
  const busy = revoke.isPending || localBusy;
  const supported = opening.device.isCurrent ||
    (canManageOtherDevices && !opening.device.isLocalDesktop && machine?.capabilities?.includes("devices.revokeOther"));
  const localCleanup = async () => {
    try { setLocalBusy(true); assertAppAccess(); await useMachines.getState().removeMachine(opening.target.machineId, opening.reviewed); onClose(); }
    catch (cause) { setError(cause); } finally { setLocalBusy(false); }
  };
  const run = () => {
    if (occupied.current || !current() || !supported || uncertain || cleanup) return;
    occupied.current = true; setLocalBusy(true); setError(undefined); revoke.reset();
    void (async () => {
      assertAppAccess();
      if (opening.device.isCurrent) await flushWorkspaceDrafts();
      if (!current()) throw new Error("The selected computer changed. Reopen the device.");
      const result = await revoke.mutateAsync(intent.params);
      if (opening.device.isCurrent) {
        if (!result.revoked) throw new Error("The host did not confirm credential revocation.");
        setCleanup(true); await localCleanup();
      } else {
        if (!result.revoked) throw new Error("The host did not confirm credential revocation.");
        if (current()) { onUpdated(); onClose(); }
      }
    })().catch((cause: unknown) => {
      setError(cause); if (cause && typeof cause === "object" && "uncertain" in cause && cause.uncertain === true) setUncertain(true);
    }).finally(() => { occupied.current = false; setLocalBusy(false); });
  };
  const feedback = <><ErrorText error={error === revoke.error ? undefined : error} /><MutationState mutation={revoke} /></>;
  return <Sheet visible title={opening.device.name} size="compact" dismissible={!busy} onClose={onClose}>
    <Body>{opening.device.isCurrent ? copy("Bu telefonun bilgisayara erişimi", "This phone's access to the computer") : copy("Başka bir eşleştirilmiş cihaz", "Another paired device")}</Body>
    {!supported ? <Body muted>{copy("Bu cihazın erişimi buradan iptal edilemez.", "This device's access cannot be revoked here.")}</Body> : null}
    {uncertain ? <Notice tone="warning" message={copy("İptalin sonucu bilinmiyor. İşlemi tekrar göndermeden bilgisayarda kontrol edin.", "The revocation outcome is unknown. Check the computer before sending the action again.")} /> : null}
    {cleanup ? <FormActions submitLabel={copy("Telefondaki bağlantıyı kaldırmayı yeniden dene", "Retry removing the local connection")} busy={busy} feedback={feedback} onSubmit={() => { void localCleanup(); }} /> : confirming ? <>
      <Body>{opening.device.isCurrent ? copy("Bu telefonun erişimi iptal edilir ve kayıtlı bağlantısı silinir. Oturumlar bilgisayarda çalışmaya devam eder; yeniden eşleştirmen gerekir.", "This phone loses access and its saved connection is removed. Sessions keep running on the computer; you will need to pair again.") : copy("Bu cihaz bilgisayara erişemez hale gelir. Bu telefonun bağlantısı korunur.", "This device loses access to the computer. This phone's connection is kept.")}</Body>
      <FormActions submitLabel={copy("Erişimi iptal et", "Revoke access")} cancelLabel={copy("Vazgeç", "Cancel")} tone="danger" busy={busy} feedback={feedback} disabled={!current() || !supported || uncertain} onCancel={() => setConfirming(false)} onSubmit={run} /></> : <>
      <FormActions tone="danger" feedback={feedback} submitLabel={opening.device.isCurrent ? copy("Bu telefonun erişimini iptal et", "Revoke this phone's access") : copy("Cihaz erişimini iptal et", "Revoke device access")} disabled={!current() || !supported || uncertain || busy} onSubmit={() => setConfirming(true)} /></>}
  </Sheet>;
}
