import { useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { isReviewedMachine } from "@/state/reviewed-machine";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { Body, Button, Disclosure, FormActions, ErrorText, Field, Loading, MutationState, Notice, QueryState, Sheet, Stack, ToggleField } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { RemoteFrame } from "@/ui/remote-frame";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { useCopy } from "@/ui/copy";
import { claimPreviewIntent, clearPreviewIntent, discardInvalidPreviewIntent, isInvalidPreviewIntentError, loadPreviewIntent } from "./device-preview-intent";
import { readDevicePreview, readPreviewIntent, type DevicePreview, type PreviewIntent } from "./device-preview-model";
import type { DeviceSummary } from "./types";

/** The retained-intent read is its own recoverable operation: unread or invalid is never the same as "no pending intent". */
type IntentRead = { status: "loading" } | { status: "ready" } | { status: "error"; invalid: boolean };
const READING: IntentRead = { status: "loading" };
const READ: IntentRead = { status: "ready" };

export function DevicePreviewSheet({ projectId, device, onClose }: { projectId: string; device: DeviceSummary; onClose: () => void }) {
  const copy = useCopy(); const machine = useActiveMachine();
  const connection = useConnectionScope();
  const [openingConnection] = useState(connection);
  const [opening] = useState(() => ({ machineId: machine?.id ?? "", environmentId: machine?.environmentId ?? "", projectId, deviceId: device.id }));
  const current = () => openingConnection.isCurrent() && isReviewedMachine(openingConnection.review, useMachines.getState()) &&
    !!opening.machineId && !!opening.environmentId && machine?.id === opening.machineId && machine.environmentId === opening.environmentId &&
    useMachines.getState().activeId === opening.machineId && projectId === opening.projectId && device.id === opening.deviceId;
  const supported = current() && machine?.capabilities?.includes("devices.preview.mobile.v1");
  const [read, setRead] = useState<IntentRead>(READING); const [readAttempt, setReadAttempt] = useState(0); const loaded = read.status === "ready"; const [intent, setIntent] = useState<PreviewIntent | null>(null); const [review, setReview] = useState<PreviewIntent>();
  const [url, setUrl] = useState(""); const [expectedText, setExpectedText] = useState(""); const [install, setInstall] = useState(false);
  const [error, setError] = useState<unknown>(); const [localBusy, setLocalBusy] = useState(false); const occupied = useRef(false);
  const [acknowledged, setAcknowledged] = useState<DevicePreview>(); const [showFrame, setShowFrame] = useState(false);
  const [forget, setForget] = useState(false); const [discard, setDiscard] = useState(false);
  const start = useHostMutation<DevicePreview>("devices.preview.mobile.start", ["devices", "preview-impact"]);
  useEffect(() => {
    let mounted = true;
    setRead(READING);
    void loadPreviewIntent(opening).then((saved) => { if (mounted) { setIntent(saved); setRead(READ); } })
      .catch((cause: unknown) => { if (mounted) setRead({ status: "error", invalid: isInvalidPreviewIntentError(cause) }); });
    return () => { mounted = false; };
  }, [opening, readAttempt]);
  const status = useHostQuery<DevicePreview>(["devices", "preview-job", opening.projectId, intent?.requestId ?? "none"], "devices.preview.mobile.status", { projectId: opening.projectId, requestId: intent?.requestId }, {
    enabled: !!supported && !!intent,
    queryFn: async (client, signal) => readDevicePreview(await client.request("devices.preview.mobile.status", { projectId: opening.projectId, requestId: intent!.requestId }, { signal }), intent!),
    interval: (data) => data && ["queued", "running"].includes(data.state) ? 2000 : false,
  });
  const frame = useHostQuery<DevicePreview>(["devices", "preview-frame", opening.projectId, intent?.requestId ?? "none"], "devices.preview.mobile.status", { projectId: opening.projectId, requestId: intent?.requestId, includeFrame: true }, {
    enabled: !!supported && !!intent && showFrame,
    queryFn: async (client, signal) => readDevicePreview(await client.request("devices.preview.mobile.status", { projectId: opening.projectId, requestId: intent!.requestId, includeFrame: true }, { signal }), intent!, true),
  });
  const refresh = usePullRefresh(() => status.refetch());
  const job = supported ? status.data ?? acknowledged : undefined;
  const busy = localBusy || start.isPending;
  const run = () => {
    if (!supported || !current() || !review || intent || !loaded || busy || occupied.current) return;
    occupied.current = true; setLocalBusy(true); setError(undefined);
    void (async () => {
      await claimPreviewIntent(opening, review);
      if (!current()) { await clearPreviewIntent(opening, review.requestId); return; }
      try {
        const result = readDevicePreview(await start.mutateAsync({ projectId: opening.projectId, ...review }), review);
        if (current()) { setAcknowledged(result); setIntent(review); setReview(undefined); }
      } catch (cause) {
        // Never replay a launch/install after an unknown response. Even a host
        // restart's NOT_FOUND needs owner inspection, not a fresh request ID.
        if (current()) { setIntent(review); setReview(undefined); } throw cause;
      }
    })().catch((cause: unknown) => { if (current()) setError(cause); }).finally(() => { occupied.current = false; if (current()) setLocalBusy(false); });
  };
  const retryRead = () => { if (read.status === "error" && !occupied.current) setReadAttempt((value) => value + 1); };
  const discardInvalid = () => {
    if (occupied.current || !current() || read.status !== "error" || !read.invalid) return; occupied.current = true; setLocalBusy(true);
    void discardInvalidPreviewIntent(opening).then(() => { if (current()) { setDiscard(false); setError(undefined); setReadAttempt((value) => value + 1); } })
      .catch((cause: unknown) => { if (current()) setError(cause); }).finally(() => { occupied.current = false; if (current()) setLocalBusy(false); });
  };
  return <Sheet visible title={copy("Expo önizlemesi", "Expo preview")} size="form" dismissible={!busy} onClose={onClose}>
    <Body>{device.name}</Body>
    {!supported ? <Notice message={copy("Seçili bilgisayar değişti veya bu özelliği desteklemiyor.", "The selected computer changed or does not support this feature.")} /> : null}
    <Notice message={copy("Önizleme cihazı başlatabilir ve uygulamayı açabilir. İşletim sistemi izinleri ayrıca onaylanmalıdır.", "Preview may boot the device and open the app. Operating system permissions require separate approval.")} />
    {intent ? <>
      <Body mono>{intent.url}</Body><QueryState query={status} />
      {!job ? <Notice tone="warning" message={copy("Önizleme sonucu henüz doğrulanmadı. Aynı istek kimliğiyle yalnızca durumu okuyun; yeniden başlatmadan önce cihazı kontrol edin.", "The preview outcome is unconfirmed. Read status with the same request ID and inspect the device before starting again.")} /> : <>
        <Body>{job.state}</Body><Body>{job.verification === "expected-text" ? copy("Beklenen metin denetimi", "Expected text verification") : copy("Yalnızca başlatma denetimi", "Launch-only verification")}</Body>
        <Stack style={{ gap: space.xs }}>{job.stages.map((stage, index) => <Body key={index}>{stage.name}: {stage.state}{stage.code ? ` · ${stage.code}` : ""}{stage.message ? `\n${stage.message}` : ""}</Body>)}</Stack>
      </>}
      <Button busy={refresh.refreshing} tone="quiet" label={copy("Yenile", "Refresh")} disabled={!supported || busy || status.isFetching} onPress={() => { void refresh.onRefresh(); }} />
      {!job && status.isError ? <>
        {forget ? <><Notice tone="warning" message={copy("Bu işlem yalnızca telefondaki takibi kaldırır; bilgisayardaki işi iptal etmez. Önce cihazı ve bilgisayarı kontrol edin. Yeni önizleme ayrıca incelenip onaylanmalıdır.", "This only removes tracking from the phone; it does not cancel the host job. Inspect the device and computer first. A new preview requires separate review and confirmation.")} />
          <FormActions feedback={<> <Body>{copy("Cihazı kontrol ettikten sonra kullanılamayan takibi kaldır?", "After inspecting the device, remove unavailable tracking?")}</Body> <ErrorText error={error} /><MutationState mutation={start} /> </>}
            submitLabel={copy("Kaldır", "Remove")} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy} disabled={!supported} onCancel={() => setForget(false)} onSubmit={() => {
              if (occupied.current || !current() || !intent) return; occupied.current = true; setLocalBusy(true);
              void clearPreviewIntent(opening, intent.requestId).then(() => { if (current()) { setIntent(null); setAcknowledged(undefined); setForget(false); setError(undefined); } })
                .catch((cause: unknown) => { if (current()) setError(cause); }).finally(() => { occupied.current = false; if (current()) setLocalBusy(false); });
            }} /></> : <Button tone="quiet" label={copy("Kullanılamayan takibi kaldır", "Remove unavailable tracking")} disabled={!supported || busy} onPress={() => setForget(true)} />}
      </> : null}
      {job?.state === "ready" ? <Button tone="quiet" label={copy("Önizleme görüntüsünü göster", "Show preview screenshot")} disabled={!supported || busy || frame.isFetching} onPress={() => setShowFrame(true)} /> : null}
      {showFrame ? <QueryState query={frame} /> : null}
      {supported && showFrame && frame.data?.frame ? <RemoteFrame uri={`data:${frame.data.frame.mime};base64,${frame.data.frame.base64}`} label={copy("Cihaz ekranı", "Device screen")} disabled /> : null}
      {job && ["ready", "blocked"].includes(job.state) ? <Button label={copy("Yeni önizleme", "New preview")} disabled={!supported || busy} onPress={() => {
        if (occupied.current || !current() || !intent) return; occupied.current = true; setLocalBusy(true);
        void clearPreviewIntent(opening, intent.requestId).then(() => { if (current()) { setIntent(null); setAcknowledged(undefined); setShowFrame(false); setError(undefined); } })
          .catch((cause: unknown) => { if (current()) setError(cause); }).finally(() => { occupied.current = false; if (current()) setLocalBusy(false); });
      }} /> : null}
    </> : read.status !== "ready" ? <>
      {read.status === "loading" ? <Loading label={copy("Kontrol ediliyor…", "Checking…")} showLabel /> : <>
        <Notice tone={read.invalid ? "warning" : "danger"} onRetry={retryRead}
          message={read.invalid
            ? copy("Telefondaki kayıtlı önizleme isteği bozuk. Bilgisayarda zaten başlamış bir önizlemeye ait olabilir. Yeniden deneyin veya silmeden önce cihazı ve bilgisayarı kontrol edin.", "The saved preview request on this phone is damaged. It may belong to a preview that already started on the computer. Retry, or inspect the device and computer before discarding it.")
            : copy("Telefondaki kayıtlı önizleme isteği okunamadı. Okunana kadar yeni önizleme başlatılamaz.", "Could not read the saved preview request on this phone. No new preview can start until it is read.")} />
        {read.invalid ? discard
          ? <><Notice tone="warning" message={copy("Bu işlem yalnızca telefondaki takibi kaldırır; bilgisayardaki işi iptal etmez. Önce cihazı ve bilgisayarı kontrol edin. Yeni önizleme ayrıca incelenip onaylanmalıdır.", "This only removes tracking from the phone; it does not cancel the host job. Inspect the device and computer first. A new preview requires separate review and confirmation.")} />
            <FormActions feedback={<> <Body>{copy("Cihazı kontrol ettikten sonra bozuk kayıtlı önizleme isteğini sil?", "After inspecting the device, discard the damaged saved preview request?")}</Body> <ErrorText error={error} /> </>}
              submitLabel={copy("Kaldır", "Remove")} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy} disabled={!supported} onCancel={() => setDiscard(false)} onSubmit={discardInvalid} /></>
          : <Button tone="quiet" label={copy("Kayıtlı önizleme isteğini sil", "Discard saved preview request")} disabled={!supported || busy} onPress={() => setDiscard(true)} /> : null}
        {!discard ? <ErrorText error={error} /> : null}
      </>}
    </> : <>
      <Field label={copy("Geliştirme sunucusu adresi", "Development server URL")} value={url} onChangeText={setUrl} maxLength={2048} autoCapitalize="none" autoCorrect={false} editable={!busy && !review} />
      <Field label={copy("Beklenen metin (isteğe bağlı)", "Expected text (optional)")} value={expectedText} onChangeText={setExpectedText} maxLength={4096} editable={!busy && !review} />
      <ToggleField label={copy("Gerekirse resmi Expo Go uygulamasını kur veya güncelle", "Install or update official Expo Go if needed")} value={install} onChange={setInstall} disabled={busy || !!review} />
      {review ? <><Body mono>{review.url}</Body><FormActions feedback={<> <Body>{copy("İncelenen cihaz ve seçeneklerle önizlemeyi başlat?", "Start the preview with the reviewed device and options?")}</Body> <ErrorText error={error} /><MutationState mutation={start} /> </>}
        submitLabel={copy("Başlat", "Start")} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy} disabled={!supported || !loaded} onSubmit={run} onCancel={() => setReview(undefined)} /></>
        : <FormActions submitLabel={copy("Değişiklikleri incele", "Review changes")} disabled={!supported || !loaded || busy || !url.trim()} onSubmit={() => {
          try { setReview(readPreviewIntent({ requestId: randomUUID(), deviceId: opening.deviceId, url: url.trim(), installExpoGo: install, ...(expectedText.trim() ? { expectedText } : {}) })); setError(undefined); }
          catch (cause) { setError(cause); }
        }} feedback={<><ErrorText error={error} /><MutationState mutation={start} /></>} />}
    </>}
    {intent && !review && !forget ? <><ErrorText error={error} /><MutationState mutation={start} /></> : null}
    <Disclosure label={copy("Ayrıntılar", "Details")}>
      <Body mono>{opening.machineId} / {opening.projectId} / {opening.deviceId}</Body>
      {intent ? <Body mono>{intent.requestId}</Body> : null}
    </Disclosure>
  </Sheet>;
}
