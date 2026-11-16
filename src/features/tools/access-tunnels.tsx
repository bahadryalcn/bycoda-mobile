import { useEffect, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { useHostMutation } from "@/state/queries";
import { Body, FormActions, ErrorText, Field, MutationState, Notice, SelectField, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { localTunnelUrl, type AccessTarget, type HostAccessReport } from "./access-center-model";
import { claimTunnelIntent, clearTunnelIntent, reconcileTunnelIntent } from "./access-tunnel-intent";
import { tunnelPresentation } from "./tunnel-presentation";
type Overview = NonNullable<HostAccessReport["tunnels"]>;
export type AccessTunnel = Overview["tunnels"][number];
export function AccessTunnels({ target, overview, tunnel, onClose, onUpdated }: { target: AccessTarget; overview: Overview; tunnel?: AccessTunnel; onClose: () => void; onUpdated: () => void }) {
  const copy = useCopy(); const machine = useActiveMachine();
  const [opening] = useState(() => ({ target: { ...target }, reviewed: reviewedMachine(machine), tunnel: tunnel ? { ...tunnel } : undefined }));
  const [provider, setProvider] = useState<"cloudflare" | "ngrok">("cloudflare"); const [kind, setKind] = useState<"host" | "dev-server">("host");
  const [localUrl, setLocalUrl] = useState("http://127.0.0.1:3000"); const [review, setReview] = useState<Record<string, unknown>>();
  const [error, setError] = useState<unknown>(); const [uncertain, setUncertain] = useState(false); const occupied = useRef(false);
  const [intentReady, setIntentReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    void reconcileTunnelIntent(opening.target, overview).then((pending) => { if (mounted) { setUncertain(pending); setIntentReady(true); } })
      .catch((cause: unknown) => { if (mounted) { setError(cause); setUncertain(true); } });
    return () => { mounted = false; };
  }, [opening, overview]);
  const method = opening.tunnel ? "tunnels.stop" : "tunnels.start"; const write = useHostMutation(method, ["host-access"]);
  const invalidated = useRef(false);
  const current = () => {
    if (opening.reviewed?.id !== opening.target.machineId || opening.reviewed.environmentId !== opening.target.environmentId || !isReviewedMachine(opening.reviewed, useMachines.getState())) invalidated.current = true;
    return !invalidated.current;
  };
  const supported = machine?.capabilities?.includes("tunnels.manage"); const busy = write.isPending;
  const providerState = overview.providers.find((entry) => entry.provider === provider);
  const canStart = !!providerState?.installed && ["saved", "not-required"].includes(providerState.credential);
  const hostImpact = (opening.tunnel?.target ?? kind) === "host";
  const submit = () => {
    if (!review || occupied.current || !current() || !supported || uncertain || !intentReady) return;
    occupied.current = true;
    void (async () => {
      if (!(await claimTunnelIntent(opening.target, review))) { setUncertain(true); return; }
      if (!current()) { await clearTunnelIntent(opening.target); return; }
      try { await write.mutateAsync(review); }
      catch (cause) {
        if (cause && typeof cause === "object" && "uncertain" in cause && cause.uncertain === true) { setUncertain(true); throw cause; }
        await clearTunnelIntent(opening.target); throw cause;
      }
      // Failure to durably retire a confirmed operation must also fail closed.
      setUncertain(true); await clearTunnelIntent(opening.target); setUncertain(false);
      if (current()) { onUpdated(); onClose(); }
    })().catch((cause: unknown) => {
      setError(cause);
    }).finally(() => { occupied.current = false; });
  };
  return <Sheet visible title={opening.tunnel ? copy("Tüneli incele", "Review tunnel") : copy("Tünel başlat", "Start tunnel")} size="form" dismissible={!busy} dirty={!opening.tunnel && (provider !== "cloudflare" || kind !== "host" || localUrl !== "http://127.0.0.1:3000")} onClose={onClose}>
    <Body muted>{machine?.name}</Body>
    {opening.tunnel ? <><Body>{opening.tunnel.provider} · {opening.tunnel.target} · {copy(tunnelPresentation(opening.tunnel.state).label[0], tunnelPresentation(opening.tunnel.state).label[1])}</Body><Body mono>{opening.tunnel.localUrl}</Body>{opening.tunnel.publicUrl ? <Body mono>{opening.tunnel.publicUrl}</Body> : null}</> : <>
      <SelectField label={copy("Tünel sağlayıcısı", "Tunnel provider")} value={provider} options={[{ value: "cloudflare", label: "Cloudflare" }, { value: "ngrok", label: "ngrok" }]} disabled={busy || !!review || uncertain} onChange={setProvider} />
      <SelectField label={copy("Hedef", "Target")} value={kind} options={[{ value: "host", label: copy("Bilgisayar erişimi", "Host access") }, { value: "dev-server", label: copy("Geliştirme sunucusu", "Dev server") }]} disabled={busy || !!review || uncertain} onChange={setKind} />
      {kind === "dev-server" ? <Field label={copy("Bilgisayardaki yerel adres", "Local address on the computer")} value={localUrl} onChangeText={setLocalUrl} autoCapitalize="none" autoCorrect={false} editable={!busy && !review && !uncertain} /> : null}
      {!canStart ? <Notice message={copy("Sağlayıcıyı ve kimlik bilgisini bilgisayarda kur.", "Set up the provider and its credential on the computer.")} /> : null}
    </>}
    {hostImpact ? <Notice tone="warning" message={opening.tunnel ? copy("Bu tünel üzerinden bağlıysan durdurmak bağlantını keser. Yeniden bağlanmak için başka bir erişim yolu gerekir.", "Stopping this tunnel disconnects you if you are connected through it. Another access route is required to reconnect.") : copy("Bu işlem bilgisayara dış erişim adresi oluşturur. Eşleştirilmiş cihaz kimlik doğrulaması yine gereklidir.", "This creates an external address for the computer. Paired-device authentication is still required.")} /> : null}
    <Body muted>{copy("Genel adresin erişilebilirliği doğrulanmadı.", "Public address reachability is unverified.")}</Body>
    {uncertain ? <Notice tone="warning" message={copy("Tünel işleminin sonucu bilinmiyor. Tekrar göndermeden bilgisayardaki durumu kontrol edin.", "The tunnel operation outcome is unknown. Check the computer state before sending again.")} /> : null}

    {review ? <>{opening.tunnel ? null : <Body>{`${String(review.provider)} · ${review.target === "host" ? copy("Bilgisayar erişimi", "Host access") : copy("Geliştirme sunucusu", "Dev server")}`}</Body>}
      {review.localUrl ? <Body mono>{String(review.localUrl)}</Body> : null}
      <Body>{opening.tunnel ? copy("Bu tünel durdurulsun mu?", "Stop this tunnel?") : copy("Bu tünel başlatılsın mı?", "Start this tunnel?")}</Body>
      <FormActions feedback={<><ErrorText error={error === write.error ? undefined : error} /><MutationState mutation={write} /></>}
      submitLabel={opening.tunnel ? copy("Durdur", "Stop") : copy("Başlat", "Start")} tone={opening.tunnel ? "danger" : "primary"} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy} disabled={!current() || !supported || uncertain} onSubmit={submit} onCancel={() => setReview(undefined)} /></> :
      <FormActions submitLabel={copy("Değişiklikleri incele", "Review changes")} disabled={!intentReady || !current() || !supported || busy || uncertain || (opening.tunnel ? !opening.tunnel.canStop : !canStart)} onSubmit={() => {
        try { setReview(opening.tunnel ? { id: opening.tunnel.id } : { provider, target: kind, ...(kind === "dev-server" ? { localUrl: localTunnelUrl(localUrl) } : {}) }); setError(undefined); }
        catch (cause) { setError(cause); }
      }} feedback={<><ErrorText error={error === write.error ? undefined : error} /><MutationState mutation={write} /></>} />}
  </Sheet>;
}
