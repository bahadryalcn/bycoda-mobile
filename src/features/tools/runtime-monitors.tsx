import { useRef, useState } from "react";
import { useHostMutation, useHostQuery, useHostReadActive } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { Body, Button, FormActions, ErrorText, Field, MutationState, NavigationGroup, NavigationRow, Notice, QueryState, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { monitorUrl, readMonitors, uncertainMonitorWrite, type RuntimeMonitor } from "./runtime-monitor-model";

export function RuntimeMonitors({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const copy = useCopy();
  const machineId = useMachines((state) => state.activeId);
  const active = useHostReadActive();
  const [url, setUrl] = useState("");
  const [intent, setIntent] = useState<{ url: string } | { monitor: RuntimeMonitor }>();
  const [error, setError] = useState<unknown>();
  const [reconciling, setReconciling] = useState(false);
  const flight = useRef(false);
  const query = useHostQuery<RuntimeMonitor[]>(["runtime-monitors", projectId], "runtimeLogs.monitors.list", { projectId }, {
    interval: 15_000,
    queryFn: async (client, signal) => readMonitors(await client.request("runtimeLogs.monitors.list", { projectId }, { signal }), projectId),
  });
  const start = useHostMutation<RuntimeMonitor>("runtimeLogs.monitors.start", ["runtime-monitors", projectId]);
  const stop = useHostMutation<{ stopped: true }>("runtimeLogs.monitors.stop", ["runtime-monitors", projectId]);
  const busy = start.isPending || stop.isPending || reconciling;
  const uncertain = uncertainMonitorWrite(start.error) || uncertainMonitorWrite(stop.error);
  const disabled = busy || uncertain || !active || !query.data || query.isError || query.isFetching;
  const refresh = async () => {
    if (flight.current || !active) return;
    setReconciling(true);
    try {
      const result = await query.refetch();
      if (!result.isError && useMachines.getState().activeId === machineId) { start.reset(); stop.reset(); setIntent(undefined); }
    } finally { setReconciling(false); }
  };
  const act = () => {
    if (flight.current || disabled || !intent || useMachines.getState().activeId !== machineId) return;
    if ("monitor" in intent && !query.data?.some((row) => row.id === intent.monitor.id && row.projectId === projectId && row.url === intent.monitor.url)) {
      setIntent(undefined); return;
    }
    flight.current = true;
    const request = "url" in intent ? start.mutateAsync({ projectId, url: intent.url }) : stop.mutateAsync({ projectId, id: intent.monitor.id });
    void request.then(() => {
      if (useMachines.getState().activeId !== machineId) return;
      if ("url" in intent) setUrl("");
      setIntent(undefined);
    }).catch(() => {}).finally(() => { flight.current = false; });
  };
  return <Sheet visible title={copy("Günlük izleyicileri", "Log monitors")} size="full" dismissible={!busy} onClose={onClose}>
    <Notice message={copy("Başlatma, seçili bilgisayarda bağımsız bir tarayıcı açar. İzleyici ekran kapansa da durdurulana kadar çalışır.", "Starting opens an independent browser on the selected computer. A monitor keeps running after this screen closes until stopped.")} />
    <QueryState query={query} empty={query.data?.length === 0} emptyTitle={copy("Etkin izleyici yok.", "No active monitors.")} />
    <Button tone="quiet" label={copy("Yenile", "Refresh")} busy={reconciling} disabled={busy || query.isFetching || !active} onPress={() => { void refresh(); }} />
    {uncertain ? <Notice tone="warning" message={copy("İşlemin sonucu bilinmiyor. Yeniden işlem yapmadan önce izleyici listesini yenile.", "The operation outcome is unknown. Refresh the monitor list before another action.")} /> : null}
    <NavigationGroup>{(query.data ?? []).map((monitor) => <NavigationRow key={monitor.id} label={monitor.url}
      detail={monitor.sourceId ? copy("Çalışıyor", "Running") : copy("Başlatılıyor", "Starting")}
      disabled={disabled} onPress={() => { setError(undefined); setIntent({ monitor }); }} />)}</NavigationGroup>
    <Field label={copy("Port veya HTTP(S) adresi", "Port or HTTP(S) URL")} value={url} editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={2048} onChangeText={(value) => { setUrl(value); setError(undefined); setIntent(undefined); }} />
    {!intent ? <FormActions submitLabel={copy("İzleyici başlat", "Start monitor")} disabled={disabled || !url.trim() || (query.data?.length ?? 0) >= 8} onSubmit={() => {
      try { setIntent({ url: monitorUrl(url) }); setError(undefined); } catch (error) { setError(error); }
    }} feedback={<><ErrorText error={error} /><MutationState mutation={start} /><MutationState mutation={stop} /></>} /> : null}

    {intent ? <>
      <Body mono>{"url" in intent ? intent.url : intent.monitor.url}</Body>
      <FormActions feedback={<> <Body>{"url" in intent ? copy("Bu adres için bilgisayarda günlük izleyicisi başlat?", "Start a log monitor on the computer for this URL?") : copy("Bu günlük izleyicisini durdur?", "Stop this log monitor?")}</Body> {error ? <ErrorText error={error} /> : null} <MutationState mutation={start} /><MutationState mutation={stop} /> </>}
        submitLabel={"url" in intent ? copy("Başlat", "Start") : copy("Durdur", "Stop")} cancelLabel={copy("Vazgeç", "Cancel")}
        busy={busy} disabled={disabled} onCancel={() => setIntent(undefined)} onSubmit={act} />
    </> : null}

  </Sheet>;
}
