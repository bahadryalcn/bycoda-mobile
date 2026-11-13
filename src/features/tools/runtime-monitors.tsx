import { useRef, useState } from "react";
import { useHostMutation, useHostQuery, useHostReadActive } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import {
  Badge,
  Body,
  Disclosure,
  IconButton,
  Row,
  FormActions,
  Field,
  MutationState,
  NavigationGroup,
  NavigationRow,
  Notice,
  QueryState,
  Sheet,
  StateView,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import {
  monitorUrl,
  readMonitors,
  uncertainMonitorWrite,
  type RuntimeMonitor,
} from "./runtime-monitor-model";

export function RuntimeMonitors({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName?: string;
  onClose: () => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const machine = useActiveMachine();
  const [opening] = useState(() => ({
    projectId,
    projectName,
    machineName: machine?.name,
    reviewed: reviewedMachine(machine),
  }));
  const latestProject = useRef(projectId);
  latestProject.current = projectId;
  const invalidated = useRef(false);
  const current = () => {
    if (
      latestProject.current !== opening.projectId ||
      !isReviewedMachine(opening.reviewed, useMachines.getState())
    )
      invalidated.current = true;
    return !invalidated.current;
  };
  const validScope = current();
  const active = useHostReadActive();
  const [url, setUrl] = useState("");
  const [intent, setIntent] = useState<{ url: string } | { monitor: RuntimeMonitor }>();
  const [error, setError] = useState<string>();
  const [reconciling, setReconciling] = useState(false);
  const flight = useRef(false);
  const query = useHostQuery<RuntimeMonitor[]>(
    ["runtime-monitors", opening.projectId],
    "runtimeLogs.monitors.list",
    { projectId: opening.projectId },
    {
      enabled: validScope && active,
      interval: 15_000,
      queryFn: async (client, signal) =>
        readMonitors(
          await client.request(
            "runtimeLogs.monitors.list",
            { projectId: opening.projectId },
            { signal },
          ),
          opening.projectId,
        ),
    },
  );
  const start = useHostMutation<RuntimeMonitor>("runtimeLogs.monitors.start", [
    "runtime-monitors",
    opening.projectId,
  ]);
  const stop = useHostMutation<{ stopped: true }>("runtimeLogs.monitors.stop", [
    "runtime-monitors",
    opening.projectId,
  ]);
  const busy = start.isPending || stop.isPending || reconciling;
  const uncertain = uncertainMonitorWrite(start.error) || uncertainMonitorWrite(stop.error);
  const disabled =
    busy || uncertain || !active || !validScope || !query.data || query.isError || query.isFetching;
  const refresh = async () => {
    if (flight.current || !active || !current()) return;
    flight.current = true;
    setReconciling(true);
    try {
      const result = await query.refetch();
      if (!result.isError && current()) {
        start.reset();
        stop.reset();
        setIntent(undefined);
      }
    } finally {
      flight.current = false;
      setReconciling(false);
    }
  };
  const act = () => {
    if (flight.current || disabled || !intent || !current()) return;
    if (
      "monitor" in intent &&
      !query.data?.some(
        (row) =>
          row.id === intent.monitor.id &&
          row.projectId === opening.projectId &&
          row.url === intent.monitor.url,
      )
    ) {
      setIntent(undefined);
      return;
    }
    flight.current = true;
    const submittedUrl = url;
    const request =
      "url" in intent
        ? start.mutateAsync({ projectId: opening.projectId, url: intent.url })
        : stop.mutateAsync({ projectId: opening.projectId, id: intent.monitor.id });
    void request
      .then(() => {
        if (!current()) return;
        if ("url" in intent) setUrl((value) => (value === submittedUrl ? "" : value));
        setIntent(undefined);
      })
      .catch(() => {})
      .finally(() => {
        flight.current = false;
      });
  };
  const consequence = copy(
    "Başlatma, seçili bilgisayarda bağımsız bir tarayıcı açar. İzleyici ekran kapansa da durdurulana kadar çalışır.",
    "Starting opens an independent browser on the selected computer. A monitor keeps running after this screen closes until stopped.",
  );
  return (
    <Sheet
      visible
      title={copy("Günlük izleyicileri", "Log monitors")}
      size={(query.data?.length ?? 0) > 2 ? "form" : "compact"}
      dirty={!!url.trim()}
      dismissible={!busy}
      onClose={onClose}
    >
      <Body muted>
        {[opening.machineName, opening.projectName ?? opening.projectId]
          .filter(Boolean)
          .join(" · ")}
      </Body>
      {!validScope ? (
        <StateView
          illustration="error"
          tone="danger"
          title={copy("Bir şeyler ters gitti", "Something went wrong")}
          description={copy(
            "Bağlantı veya proje değişti. Devam etmek için bu ekranı yeniden açın.",
            "The connection or project changed. Reopen this view to continue.",
          )}
        />
      ) : (
        <QueryState
          query={query}
          empty={query.data?.length === 0}
          emptyTitle={copy("Etkin izleyici yok.", "No active monitors.")}
          emptyDetail={copy(
            "Bir port veya HTTP(S) adresi girerek bilgisayardaki sunucunun günlüklerini izle.",
            "Enter a port or HTTP(S) URL to follow the computer's server logs.",
          )}
        />
      )}
      <Row>
        <Body muted style={{ flex: 1, minWidth: 0 }}>
          {copy("Etkin izleyiciler", "Active monitors")}
        </Body>
        <IconButton
          label={copy("Yenile", "Refresh")}
          busy={reconciling}
          disabled={busy || query.isFetching || !active || !validScope}
          onPress={() => {
            void refresh();
          }}
        >
          <RefreshCw size={22} strokeWidth={2} color={colors.accent} />
        </IconButton>
      </Row>
      {query.data ? (
        <Body muted>
          {copy("Etkin izleyiciler: {p0} / 8", "Active monitors: {p0} / 8", {
            p0: query.data.length,
          })}
        </Body>
      ) : null}
      {query.data && query.data.length >= 8 ? (
        <Notice
          message={copy(
            "8 izleyici sınırına ulaşıldı. Yeni bir izleyici başlatmak için listeden birini durdur.",
            "The 8-monitor limit is reached. Stop one from the list to start another.",
          )}
        />
      ) : null}
      {uncertain ? (
        <Notice
          tone="warning"
          message={copy(
            "İşlemin sonucu bilinmiyor. Yeniden işlem yapmadan önce izleyici listesini yenile.",
            "The operation outcome is unknown. Refresh the monitor list before another action.",
          )}
        />
      ) : null}
      <NavigationGroup>
        {(validScope ? (query.data ?? []) : []).map((monitor) => (
          <NavigationRow
            key={monitor.id}
            label={monitor.url}
            supporting={
              <Row>
                <Badge
                  label={
                    monitor.sourceId
                      ? copy("Çalışıyor", "Running")
                      : copy("Başlatılıyor", "Starting")
                  }
                  tone={monitor.sourceId ? "active" : "default"}
                />
              </Row>
            }
            disabled={disabled}
            onPress={() => {
              setError(undefined);
              setIntent({ monitor });
            }}
          />
        ))}
      </NavigationGroup>
      <Field
        label={copy("Port veya HTTP(S) adresi", "Port or HTTP(S) URL")}
        value={url}
        error={error}
        editable={!busy && validScope}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={2048}
        onChangeText={(value) => {
          setUrl(value);
          setError(undefined);
          setIntent(undefined);
        }}
      />
      {!intent ? (
        <Disclosure label={copy("Ayrıntılar", "Details")}>
          <Body muted>{consequence}</Body>
        </Disclosure>
      ) : null}
      {!intent ? (
        <FormActions
          submitLabel={copy("İzleyici başlat", "Start monitor")}
          disabled={disabled || !url.trim() || (query.data?.length ?? 0) >= 8}
          onSubmit={() => {
            try {
              setIntent({ url: monitorUrl(url) });
              setError(undefined);
            } catch {
              setError(
                copy(
                  "1–65535 arasında bir port veya kimlik bilgisi içermeyen bir HTTP(S) adresi gir.",
                  "Enter a port (1–65535) or an HTTP(S) URL without credentials.",
                ),
              );
            }
          }}
          feedback={
            <>
              <MutationState mutation={start} />
              <MutationState mutation={stop} />
            </>
          }
        />
      ) : null}

      {intent ? (
        <>
          <Body mono>{"url" in intent ? intent.url : intent.monitor.url}</Body>
          {"url" in intent ? <Notice message={consequence} /> : null}
          <Body>
            {"url" in intent
              ? copy(
                  "Bu adres için bilgisayarda günlük izleyicisi başlat?",
                  "Start a log monitor on the computer for this URL?",
                )
              : copy("Bu günlük izleyicisini durdur?", "Stop this log monitor?")}
          </Body>
          <FormActions
            feedback={
              <>
                <MutationState mutation={start} />
                <MutationState mutation={stop} />
              </>
            }
            submitLabel={"url" in intent ? copy("Başlat", "Start") : copy("Durdur", "Stop")}
            cancelLabel={copy("Vazgeç", "Cancel")}
            busy={busy}
            disabled={disabled}
            onCancel={() => setIntent(undefined)}
            onSubmit={act}
          />
        </>
      ) : null}
    </Sheet>
  );
}
