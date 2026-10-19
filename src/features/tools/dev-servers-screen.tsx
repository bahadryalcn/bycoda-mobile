import { useRef, useState } from "react";
import { Stack } from "expo-router";
import Plus from "lucide-react-native/icons/plus";
import Server from "lucide-react-native/icons/server";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useFormDraft } from "@/state/form-draft";
import type { HostProject } from "@/domain/types";
import {
  Badge, Body, Button, ErrorText, Field, IconButton, MutationState, NavigationRow, Notice,
  QueryState, ScreenList, SearchField, Sheet,
} from "@/ui/primitives";
import { haptic } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { colors } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { useMachines } from "@/state/machines";
import { expectedPort, projectServers } from "./tool-model";
import { DevServerDetail } from "./dev-server-detail";
import type { DevServer, DevServerScan, DevServerStartResult } from "./types";

export function DevServersScreen({ project }: { project: HostProject }) {
  useMobileTheme();
  const copy = useCopy();
  const machineId = useMachines((state) => state.activeId);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<DevServer>();
  const [validationError, setValidationError] = useState("");
  const form = useFormDraft({ name: "", command: "", port: "" });
  const scan = useHostQuery<DevServerScan>(
    ["dev-servers", project.id], "devServers.list", { projectId: project.id }, { interval: 15_000 },
  );
  const start = useHostMutation<DevServerStartResult>("devServers.start", ["dev-servers", project.id]);
  const pending = useRef(false);
  const servers = projectServers(scan.data?.servers ?? [], project.id).filter((server) =>
    `${server.name} ${server.command ?? ""} ${server.endpoints.map((endpoint) => endpoint.port).join(" ")}`
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const submit = () => {
    if (pending.current || !form.values.command.trim()) return;
    let port: number | undefined;
    try { port = expectedPort(form.values.port); }
    catch {
      setValidationError(copy("1 ile 65535 arasında bir port gir.", "Enter a port between 1 and 65535."));
      return;
    }
    setValidationError("");
    pending.current = true;
    void start.mutateAsync({
      projectId: project.id,
      cwd: project.cwd,
      name: form.values.name.trim() || form.values.command.trim(),
      command: form.values.command.trim(),
      ...(port === undefined ? {} : { expectedPort: port }),
    }).then((result) => {
      if (useMachines.getState().activeId !== machineId) return;
      if (result.server) {
        haptic.success();
        setCreating(false);
        form.reset({ name: "", command: "", port: "" });
        setSelected(result.server);
      }
    }).catch(() => {}).finally(() => { pending.current = false; });
  };
  return (
    <ScreenList<DevServer>
      title={copy("Geliştirme sunucuları", "Dev servers")}
      subtitle={project.name}
      data={servers}
      keyExtractor={(server) => server.id}
      query={scan}
      actions={
        <IconButton label={copy("Sunucu başlat", "Start server")} onPress={() => { start.reset(); setCreating(true); }}>
          <Plus size={22} strokeWidth={2.2} color={colors.accent} />
        </IconButton>
      }
      header={
        <>
          <Stack.Screen options={{ title: copy("Geliştirme sunucuları", "Dev servers") }} />
          <SearchField label={copy("Sunucu ara", "Search servers")} value={search} onChangeText={setSearch} />
          <QueryState query={scan} empty={!servers.length && scan.data?.status !== "error"} emptyTitle={copy("Bu projede sunucu yok.", "No servers in this project.")} />
          {scan.data?.status === "error" ? <Notice tone="danger" message={scan.data.error ?? copy("Hata", "Error")} onRetry={() => { void scan.refetch(); }} /> : null}
          <Sheet visible={creating} title={copy("Sunucu başlat", "Start server")} dirty={form.dirty} dismissible={!start.isPending} onClose={() => setCreating(false)}>
            <Body muted>{project.name}</Body>
            <Body mono muted>{project.cwd}</Body>
            <Field label={copy("Ad", "Name")} value={form.values.name} editable={!start.isPending} onChangeText={(name) => form.setField("name", name)} />
            <Field label={copy("Komut", "Command")} value={form.values.command} editable={!start.isPending} autoCapitalize="none" autoCorrect={false} multiline mono onChangeText={(command) => form.setField("command", command)} />
            <Field label={copy("Port (isteğe bağlı)", "Port (optional)")} value={form.values.port} editable={!start.isPending} keyboardType="number-pad" onChangeText={(port) => form.setField("port", port)} />
            {validationError ? <ErrorText error={validationError} /> : null}
            {start.data?.conflict ? <Notice tone="warning" message={copy("{p0} portu zaten kullanılıyor.", "Port {p0} is already in use.", { p0: start.data.conflict.port })} /> : null}
            <MutationState mutation={start} />
            <Button label={copy("Sunucu başlat", "Start server")} tone="primary" busy={start.isPending} disabled={!form.values.command.trim()} onPress={submit} />
          </Sheet>
          {selected ? <DevServerDetail key={selected.id} projectId={project.id} server={selected} onClose={() => setSelected(undefined)} /> : null}
        </>
      }
      renderItem={({ item: server }) => (
        <NavigationRow
          label={server.name}
          detail={[server.command, ...server.endpoints.map((endpoint) => `:${endpoint.port}`)].filter(Boolean).join(" · ")}
          icon={<Server size={20} color={server.state === "running" ? colors.live : colors.muted} />}
          trailing={<Badge label={server.state === "running" ? copy("Çalışıyor", "Running") : server.state === "starting" ? copy("Başlıyor", "Starting") : server.state === "stopped" ? copy("Durduruldu", "Stopped") : server.state === "stopping" ? copy("Durduruluyor", "Stopping") : copy("Hata", "Error")} tone={server.state === "error" ? "danger" : server.state === "running" ? "active" : "default"} />}
          onPress={() => setSelected(server)}
        />
      )}
    />
  );
}
