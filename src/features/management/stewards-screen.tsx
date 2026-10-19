import { useState } from "react";
import { RecordCard } from "@/ui/record-card";
import { router } from "expo-router";
import Plus from "lucide-react-native/icons/plus";
import type { HostSteward, HostStewardInput } from "@/remote/types";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { colors } from "@/ui/tokens";
import { ActionMenu, Body, Button, ErrorText, IconButton, MutationState, Notice, QueryState, Row, SearchField, Sheet } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { Scope } from "./shared/scope";
import { initialAgent } from "./shared/agent";
import { identifier, stamp } from "./shared/format";
import { Status } from "./shared/status";
import { scheduleLabel } from "./automations/schedule-model";
import { StewardEditor } from "./stewards/steward-editor";

export function StewardsScreen() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const projectId = useMachines((state) => state.selectedProjectId);
  const supported = machine?.capabilities?.includes("stewards") === true;
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<HostStewardInput | null>(null);
  const query = useHostQuery<HostSteward[]>(["stewards"], "stewards.list", {}, { enabled: supported, interval: 10000 });
  const save = useHostMutation("stewards.save", ["stewards"]);
  const run = useHostMutation("stewards.runNow", ["stewards"]);
  const remove = useHostMutation("stewards.delete", ["stewards"]);
  const busy = save.isPending || run.isPending || remove.isPending;
  const rows = (query.data ?? []).filter((item) => (!projectId || item.projectId === projectId) &&
    `${item.focus} ${item.model} ${item.projectId}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const create = () => {
    if (!projectId || !machine?.providers?.length || busy || editor) return;
    const { maxRunMinutes: _minutes, ...agent } = initialAgent(machine.providers);
    setEditor({ ...agent, id: identifier(), projectId, enabled: true, focus: "", maxProposals: 5, maxOpen: 10,
      autoStart: false, autoMerge: false, scheduleKind: "daily", minute: 0, time: "09:00", dayOfWeek: 1 });
  };
  return <ScreenList<HostSteward> title={copy("Proje sorumluları", "Project stewards")} query={supported ? query : undefined}
    data={rows} keyExtractor={(item) => item.id}
    actions={supported ? (
      <IconButton label={copy("Yeni proje sorumlusu", "New project steward")} onPress={create}
        disabled={!projectId || !machine?.providers?.length || busy || !!editor || query.data?.some((item) => item.projectId === projectId)}>
        <Plus size={22} strokeWidth={2.2} color={colors.accent} />
      </IconButton>
    ) : undefined}
    header={<>
      <Scope allowAll />
      {!supported ? <Notice tone="info" message={copy("Bu bilgisayar proje sorumlularını desteklemiyor.", "This computer does not support project stewards.")} /> : <>
        <SearchField value={search} onChangeText={setSearch} label={copy("Ara", "Search")} />
        <MutationState mutation={save} success={copy("Proje sorumlusu kaydedildi.", "Project steward saved.")} /><MutationState mutation={run} /><MutationState mutation={remove} />
        <QueryState query={query} empty={!rows.length} emptyTitle={copy("Henüz proje sorumlusu yok", "No project stewards yet")} />
      </>}
      {editor ? <Sheet visible size="form" title={copy("Proje sorumlusu ayrıntıları", "Project steward details")} onClose={() => setEditor(null)}>
        <StewardEditor key={editor.id} initial={editor} onClose={() => setEditor(null)} />
      </Sheet> : null}
    </>}
    renderItem={({ item }) => <RecordCard
      title={item.focus || copy("Proje sorumlusu", "Project steward")}
      status={<Status value={item.run ? "running" : item.enabled ? item.lastRunStatus ?? "idle" : "paused"} />}
      metadata={scheduleLabel(item, copy) + " · " + copy("Sonraki", "Next") + ": " + stamp(item.nextRunAt)}
      footer={
      <Row>
        <Button label={copy("Şimdi çalıştır", "Run now")} tone="primary" disabled={busy || !!item.run || !!editor} onPress={() => confirmAction(
          copy("Şimdi çalıştır", "Run now"), copy("Ajan bu projeyi inceleyip görev önerileri oluşturacak.", "The agent will inspect this project and propose tasks."),
          copy("Çalıştır", "Run"), () => run.mutate({ stewardId: item.id }), copy("Vazgeç", "Cancel"))} />
        <Button label={item.enabled ? copy("Duraklat", "Pause") : copy("Etkinleştir", "Enable")} tone="quiet" disabled={busy || !!editor}
          onPress={() => save.mutate({ steward: { ...item, enabled: !item.enabled } })} />
      </Row>
      }
      details={<Body mono>{item.harness} · {item.model}</Body>}
      menu={<ActionMenu label={copy("Proje sorumlusu işlemleri", "Steward actions")} actions={[
          { key: "edit", label: copy("Düzenle", "Edit"), disabled: busy || !!editor, onPress: () => setEditor(item) },
          item.lastSessionId && machine ? { key: "session", label: copy("Son oturum", "Last session"), onPress: () => router.push({ pathname: "/session/[id]",
            params: { id: item.lastSessionId!, machineId: machine.id, projectId: item.projectId } }) } : null,
          { key: "delete", label: copy("Sil", "Delete"), destructive: true, disabled: busy || !!editor, onPress: () => confirmAction(copy("Sil", "Delete"),
            copy("Proje sorumlusu silinir ve varsa çalışması durdurulur. Önerilen görevler korunur.", "The steward will be deleted and its active run stopped. Proposed tasks are kept."),
            copy("Sil", "Delete"), () => remove.mutate({ stewardId: item.id }), copy("Vazgeç", "Cancel")) },
        ]} />}
    >
      <ErrorText error={item.lastRunError} />

    </RecordCard>} />;
}
