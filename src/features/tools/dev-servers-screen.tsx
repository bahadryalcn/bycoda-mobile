import { Server } from "@/ui/duotone-icon";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { useLocale } from "@/i18n";
import { matchesSearch } from "@/ui/search-matching";
import { Stack } from "expo-router";
import Plus from "lucide-react-native/icons/plus";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useFormDraft } from "@/state/form-draft";
import type { HostProject } from "@/domain/types";
import { Badge, Body, Disclosure, ErrorText, Field, FormActions, IconButton, MutationState, NavigationRow, Notice, QueryState, Row, RowIcon, ScreenList, SearchField, Sheet, StatusText, useCollapsibleSearch } from "@/ui/primitives";
import { haptic } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { expectedPort, projectServers } from "./tool-model";
import { DevServerDetail } from "./dev-server-detail";
import type { DevServer, DevServerScan, DevServerStartResult } from "./types";

let nextServerScope = 1;
export function DevServersScreen({ project }: { project: HostProject }) {
  const machine = useActiveMachine();
  const identity = useMemo(() => nextServerScope++, [machine?.id, machine?.endpoint, machine?.environmentId, machine?.lanKey, project.id]);
  return <DevServersScreenBody key={identity} project={project} />;
}

function DevServersScreenBody({ project }: { project: HostProject }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const machine = useActiveMachine();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const currentScope = () => mounted.current && isReviewedMachine(reviewedMachine(machine), useMachines.getState());
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };
  const serverSearch = useCollapsibleSearch(<SearchField ref={searchInput} label={copy("Sunucu ara", "Search servers")} value={search} onChangeText={setSearch} />);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<DevServer>();
  const [validationError, setValidationError] = useState("");
  const [resultError, setResultError] = useState<unknown>();
  const form = useFormDraft({ name: "", command: "", port: "" });
  const scan = useHostQuery<DevServerScan>(
    ["dev-servers", project.id], "devServers.list", { projectId: project.id }, { interval: 15_000 },
  );
  const start = useHostMutation<DevServerStartResult>("devServers.start", ["dev-servers", project.id]);
  const pending = useRef(false);
  const projectRows = projectServers(scan.data?.servers ?? [], project.id);
  const canStartFromEmptyList = scan.isSuccess && scan.data?.status !== "error" && !projectRows.length;
  const openStartForm = () => { start.reset(); setResultError(undefined); setCreating(true); };
  const servers = projectRows.filter((server) => matchesSearch(
    `${server.name} ${server.command ?? ""} ${server.endpoints.map((endpoint) => endpoint.port).join(" ")}`, search, locale,
  ));
  const submit = () => {
    if (pending.current || !form.values.command.trim() || !currentScope()) return;
    let port: number | undefined;
    try { port = expectedPort(form.values.port); }
    catch {
      setValidationError(copy("1 ile 65535 arasında bir port gir.", "Enter a port between 1 and 65535."));
      return;
    }
    setValidationError("");
    setResultError(undefined);
    pending.current = true;
    void start.mutateAsync({
      projectId: project.id,
      cwd: project.cwd,
      name: form.values.name.trim() || form.values.command.trim(),
      command: form.values.command.trim(),
      ...(port === undefined ? {} : { expectedPort: port }),
    }).then((result) => {
      if (!currentScope()) return;
      if (result.server) {
        if (!projectServers([result.server], project.id).length) {
          setResultError(new Error(copy("Sunucu bu projeye ait değil.", "This server does not belong to this project."))); return;
        }
        haptic.success();
        setCreating(false);
        form.reset({ name: "", command: "", port: "" });
        setSelected(result.server);
      }
    }).catch(() => {}).finally(() => { pending.current = false; });
  };
  return (
    <>
      <ScreenList<DevServer>
        title={copy("Geliştirme sunucuları", "Dev servers")}
        scope={{ computer: machine?.name, project: project.name }}
        data={servers}
        keyExtractor={(server) => server.id}
        query={scan}
        actions={<>
          {serverSearch.trigger}
          {!canStartFromEmptyList ? (
            <IconButton label={copy("Sunucu başlat", "Start server")} disabled={start.isPending} onPress={openStartForm}>
              <Plus size={iconSize.action} strokeWidth={2} color={colors.accent} />
            </IconButton>
          ) : null}
        </>}
        header={
          <>
            <Stack.Screen options={{ title: copy("Geliştirme sunucuları", "Dev servers") }} />
            {serverSearch.field}
            {!scan.error && scan.data?.status === "error" ? <Notice tone="danger" message={scan.data.error ?? copy("Hata", "Error")} retrying={scan.isFetching} onRetry={() => { if (!scan.isFetching) void scan.refetch(); }} /> : null}

          </>
        }
        ListEmptyComponent={
          <QueryState size="region"
              query={scan}
              empty={!servers.length && scan.data?.status !== "error"}
              noResults={{ searching: !!search.trim() && projectRows.length > 0, onClearSearch: clearSearch }}
              emptyTitle={
                search.trim() && projectRows.length
                  ? copy("Eşleşen sonuç yok", "No matching results")
                  : copy("Çalışan sunucu yok", "No servers running")
              }
              emptyDetail={search.trim() && projectRows.length ? undefined : copy(
                "Geliştirme sunucuları, uygulamanı bilgisayarında çalıştıran komutlardır (örneğin npm run dev).",
                "Dev servers are the commands that run your app on the computer, such as npm run dev.",
              )}
              emptyIllustration={search.trim() && projectRows.length ? undefined : "inbox-empty"}
              emptyAction={search.trim() && projectRows.length ? {
                label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch,
              } : { label: copy("Sunucu başlat", "Start server"), onPress: openStartForm, busy: start.isPending }}
            />
        }
        renderItem={({ item: server }) => {
          const stateLabel = server.state === "running" ? copy("Çalışıyor", "Running")
            : server.state === "starting" ? copy("Başlıyor", "Starting")
            : server.state === "stopped" ? copy("Durduruldu", "Stopped")
            : server.state === "stopping" ? copy("Durduruluyor", "Stopping") : copy("Hata", "Error");
          const ports = server.endpoints.map((endpoint) => `:${endpoint.port}`).join(" · ");
          return (
          <NavigationRow
            label={server.name}
            labelLines={2}
            detail={server.command}
            detailLines={2}
            metadata={ports || undefined}
            metadataLines={0}
            accessibilityLabel={[server.name, stateLabel, server.command, ports].filter(Boolean).join(". ")}
            icon={<RowIcon glyph={Server} />}
            supporting={server.state === "error" ? <Badge label={stateLabel} tone="danger" /> : <StatusText label={stateLabel} tone={server.state === "running" ? "success" : server.state === "starting" || server.state === "stopping" ? "live" : "default"} />}
            onPress={() => setSelected(server)}
          />
          );
        }}
      />
      <Sheet visible={creating} title={copy("Sunucu başlat", "Start server")} dirty={form.dirty} dismissible={!start.isPending} onClose={() => setCreating(false)}>
        <Body muted>{copy("{p0} projesinde, bilgisayarında çalışır.", "Runs on your computer in {p0}.", { p0: project.name })}</Body>
        <Field label={copy("Komut", "Command")} placeholder="npm run dev" value={form.values.command} editable={!start.isPending} autoCapitalize="none" autoCorrect={false} multiline mono onChangeText={(command) => form.setField("command", command)} />
        <Disclosure label={copy("Ek ayarlar", "More settings")}>
        <Body mono muted>{project.cwd}</Body>
        <Field label={copy("Ad", "Name")} placeholder={copy("İsteğe bağlı", "Optional")} value={form.values.name} editable={!start.isPending} onChangeText={(name) => form.setField("name", name)} />
        <Field
          label={copy("Port (isteğe bağlı)", "Port (optional)")}
          placeholder="3000"
          value={form.values.port}
          editable={!start.isPending}
          keyboardType="number-pad"
          error={validationError || undefined}
          onChangeText={(port) => {
            form.setField("port", port);
            setValidationError("");
          }}
        />
        </Disclosure>

        <FormActions
          submitLabel={copy("Sunucu başlat", "Start server")}
          busy={start.isPending}
          dirty={form.dirty}
          disabled={!form.values.command.trim()}
          onSubmit={submit}
          feedback={
            <>
              {start.data?.conflict ? (
                <Notice
                  tone="warning"
                  message={copy(
                    "{p0} portu zaten kullanılıyor.",
                    "Port {p0} is already in use.",
                    { p0: start.data.conflict.port },
                  )}
                />
              ) : null}
              <MutationState mutation={start} />
              <ErrorText error={resultError} />
            </>
          }
        />
      </Sheet>
      {selected ? <DevServerDetail key={selected.id} projectId={project.id} project={project} server={selected} onClose={() => setSelected(undefined)} /> : null}
    </>
  );
}
