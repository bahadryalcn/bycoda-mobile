import { useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { useHostMutation } from "@/state/queries";
import { assertAppAccess } from "@/state/security";
import { flushWorkspaceDrafts } from "@/features/workspace/draft-guard";
import { Body, FormActions, ErrorText, MutationState, Notice, ScopeLine, Sheet } from "@/ui/primitives";
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
      if (!current()) throw new Error(copy("Seçili bilgisayar değişti. Cihazı yeniden açın.", "The selected computer changed. Reopen the device."));
      const result = await revoke.mutateAsync(intent.params);
      if (opening.device.isCurrent) {
        if (!result.revoked) throw new Error(copy("Bilgisayar erişimin kaldırıldığını doğrulamadı. Durumu yenileyip yeniden deneyin.", "The computer did not confirm that access was removed. Refresh and try again."));
        setCleanup(true); await localCleanup();
      } else {
        if (!result.revoked) throw new Error(copy("Bilgisayar erişimin kaldırıldığını doğrulamadı. Durumu yenileyip yeniden deneyin.", "The computer did not confirm that access was removed. Refresh and try again."));
        if (current()) { onUpdated(); onClose(); }
      }
    })().catch((cause: unknown) => {
      setError(cause); if (cause && typeof cause === "object" && "uncertain" in cause && cause.uncertain === true) setUncertain(true);
    }).finally(() => { occupied.current = false; setLocalBusy(false); });
  };
  const feedback = <><ErrorText error={error === revoke.error ? undefined : error} /><MutationState mutation={revoke} /></>;
  const explanation = opening.device.isCurrent
    ? copy("İptal edersen bu telefon bilgisayara bağlanamaz ve kayıtlı bağlantısı silinir. Oturumlar bilgisayarda çalışmaya devam eder; tekrar kullanmak için yeniden eşleştirmen gerekir.",
      "Revoking disconnects this phone from the computer and removes its saved connection. Sessions keep running on the computer; pair again to use it.")
    : opening.device.isLocalDesktop
      ? copy("Bu bilgisayarın kendi bağlantısı. Erişimi buradan iptal edilemez.", "This computer's own connection. Its access cannot be revoked here.")
      : !supported
        ? copy("Bu cihazın erişimi buradan iptal edilemez. Bilgisayardaki bycoda’dan ya da cihaz yönetme izni olan bir telefondan iptal edin.", "This device's access cannot be revoked here. Revoke it in bycoda on the computer or from a phone allowed to manage devices.")
        : copy("İptal edersen bu cihaz bilgisayara erişemez. Bu telefonun bağlantısı korunur.", "Revoking removes this device's access to the computer. This phone's connection is kept.");
  return <Sheet visible title={opening.device.name} size="compact" dismissible={!busy} onClose={onClose}>
    <ScopeLine scope={{ computer: machine?.name }} />
    <Body muted>{`${opening.device.isCurrent ? copy("Bu telefon", "This phone") : opening.device.isLocalDesktop ? copy("Bu bilgisayar", "This computer") : copy("Eşleştirilmiş cihaz", "Paired device")} · ${opening.device.id.slice(-4)}`}</Body>
    <Body>{explanation}</Body>
    {uncertain ? <Notice tone="warning" message={copy("İptalin sonucu bilinmiyor. İşlemi tekrar göndermeden bilgisayarda kontrol edin.", "The revocation outcome is unknown. Check the computer before sending the action again.")} /> : null}
    {/* A device that cannot be revoked here gets the explanation only, never a dead destructive button. */}
    {!supported ? null : cleanup ? <FormActions submitLabel={copy("Telefondaki bağlantıyı kaldırmayı yeniden dene", "Retry removing the local connection")} busy={busy} feedback={feedback} onSubmit={() => { void localCleanup(); }} /> : confirming ? <>
      <Body>{opening.device.isCurrent ? copy("Bu telefonun erişimi şimdi iptal edilsin mi?", "Revoke this phone's access now?") : copy("Bu cihazın erişimi şimdi iptal edilsin mi?", "Revoke this device's access now?")}</Body>
      <FormActions submitLabel={copy("Erişimi iptal et", "Revoke access")} cancelLabel={copy("Vazgeç", "Cancel")} tone="danger" busy={busy} feedback={feedback} disabled={!current() || uncertain} onCancel={() => setConfirming(false)} onSubmit={run} /></> : <>
      <FormActions tone="danger" feedback={feedback} submitLabel={opening.device.isCurrent ? copy("Bu telefonun erişimini iptal et", "Revoke this phone's access") : copy("Cihaz erişimini iptal et", "Revoke device access")} disabled={!current() || uncertain || busy} onSubmit={() => setConfirming(true)} /></>}
  </Sheet>;
}
