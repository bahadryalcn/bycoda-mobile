import { useEditorRecord } from "./shared/use-editor-record";
import { Input } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { useState } from "react";

import { Body, Button, MutationState, Notice, QueryState, Screen, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import type { HostAutomation } from "@/domain/types";
import { identifier } from "./shared/format";
import { initialAgent } from "./shared/agent";
import { Scope } from "./shared/scope";

import { AutomationEditor } from "./automations/automation-editor";
import { AutomationCard } from "./automations/automation-card";
import type { AutomationEditorFlow } from "./automations/types";

export function AutomationsScreen() {
  const copy = useCopy();
  const [search, setSearch] = useState("");
  const machine = useActiveMachine();
  const projectId = useMachines((state) => state.selectedProjectId);
  const query = useHostQuery<HostAutomation[]>(
    ["automations"],
    "automations.list",
    {},
    { interval: 10000 },
  );
  const save = useHostMutation<HostAutomation>("automations.save", ["automations"]);
  const run = useHostMutation("automations.runNow", ["automations"]);
  const remove = useHostMutation("automations.delete", ["automations"]);
  const [editor, setEditor] = useState<AutomationEditorFlow>(null);
  const fetchedDraft =
    editor?.kind === "new"
      ? editor.initial
      : editor?.kind === "edit"
        ? query.data?.find((item) => item.id === editor.id)
        : undefined;
  const draft = useEditorRecord(editor?.kind === "new" ? editor.initial.id : editor?.id ?? null, fetchedDraft);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const busy = save.isPending || run.isPending || remove.isPending;
  const visible = query.data?.filter((item) => (!projectId || item.projectId === projectId) && (item.name + " " + item.prompt).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return (
    <ScreenList<HostAutomation> title={copy("Otomasyonlar", "Automations")} query={query}
      data={visible ?? []}
      keyExtractor={(item) => item.id}
      header={<>
      <Scope allowAll />
      <Input label={copy("Ara", "Search")} placeholder={copy("Ara", "Search")} value={search} onChangeText={setSearch} autoCorrect={false} />
      <Button
        label={copy("Yeni otomasyon", "New automation")}
        disabled={!projectId || !machine?.providers?.length || !!editor || busy}
        onPress={() => {
          save.reset();
          return projectId &&
          setEditor({
            kind: "new",
            initial: {
              ...initialAgent(machine?.providers),
              id: identifier(),
              name: "",
              prompt: "",
              projectId,
              enabled: true,
              scheduleKind: "daily",
              time: "09:00",
              minute: 0,
              dayOfWeek: 1,
              maxRunsPerDay: 0,
            },
          });
        }}
      />

      {!editor && <MutationState mutation={save} success={copy("Otomasyon kaydedildi.", "Automation saved.")} />}
      <MutationState mutation={run} success={copy("Çalıştırma istendi.", "Run requested.")} />
      <MutationState
        mutation={remove}
        success={copy("Otomasyon silindi.", "Automation deleted.")}
      />
      {editor?.kind === "edit" && query.isSuccess && !draft && (
        <Notice
          tone="warning"
          message={copy("Otomasyon artık bulunamadı.", "The automation is no longer available.")}
        >
          <Button label={copy("Kapat", "Close")} onPress={() => setEditor(null)} />
        </Notice>
      )}
      {draft && (
        <Sheet
          visible
          size="form"
          title={copy("Otomasyon ayrıntıları", "Automation details")}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <AutomationEditor
            key={draft.id}
            initial={draft}
            save={save}
            busy={busy}
            onClose={() => setEditor(null)}
          />
        </Sheet>
      )}
      <QueryState
        query={query}
        empty={visible?.length === 0}
        emptyTitle={copy("Henüz otomasyon yok", "No automations yet")}
      />
      {search.trim() && visible?.length === 0 ? <Button tone="quiet" label={copy("Aramayı temizle", "Clear search")} onPress={() => setSearch("")} /> : null}
      </>}
      renderItem={({ item: item }) => (
        <AutomationCard
          item={item}
          busy={busy}
          editorOpen={!!editor}
          historyId={historyId}
          onHistory={setHistoryId}
          onEdit={(id) => { save.reset(); setEditor({ kind: "edit", id }); }}
          save={save}
          run={run}
          remove={remove}
        />
      )}
    />

  );
}
