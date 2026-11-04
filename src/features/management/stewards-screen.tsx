import { useRef, useState, type ComponentRef } from "react";
import { useLocale } from "@/i18n";
import { matchesSearch } from "./shared/search";
import Plus from "lucide-react-native/icons/plus";
import Pencil from "lucide-react-native/icons/pencil";
import type { HostSteward, HostStewardInput } from "@/remote/types";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { colors } from "@/ui/tokens";
import {
  Body,
  IconButton,
  MutationState,
  Notice,
  QueryState,
  SearchField,
  Sheet,
} from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { Scope } from "./shared/scope";
import { AgentProviderPrerequisite } from "./shared/agent-provider-prerequisite";
import { initialAgent } from "./shared/agent";
import { identifier } from "./shared/format";
import { StewardCard } from "./stewards/steward-card";
import { savedStewardId } from "./stewards/steward-feedback";
import { StewardEditor } from "./stewards/steward-editor";

export function StewardsScreen() {
  const copy = useCopy();
  const locale = useLocale();
  const machine = useActiveMachine();
  const projectId = useMachines((state) => state.selectedProjectId);
  const supported = machine?.capabilities?.includes("stewards") === true;
  const [search, setSearch] = useState("");
  const searchInput = useRef<ComponentRef<typeof SearchField>>(null);
  const clearSearch = () => { setSearch(""); searchInput.current?.focus(); };
  const [editor, setEditor] = useState<HostStewardInput | null>(null);
  const query = useHostQuery<HostSteward[]>(
    ["stewards"],
    "stewards.list",
    {},
    { enabled: supported, interval: 10000 },
  );
  const save = useHostMutation("stewards.save", ["stewards"]);
  const run = useHostMutation("stewards.runNow", ["stewards"]);
  const remove = useHostMutation("stewards.delete", ["stewards"]);
  const busy = save.isPending || run.isPending || remove.isPending;
  const scoped = (query.data ?? []).filter(item => !projectId || item.projectId === projectId);
  const rows = scoped.filter(item => matchesSearch(`${item.focus} ${item.model} ${item.projectId}`, search, locale));
  const existingSteward = projectId
    ? query.data?.find((item) => item.projectId === projectId)
    : undefined;
  const create = () => {
    if (
      !projectId ||
      !machine?.providers?.length ||
      busy ||
      editor ||
      existingSteward
    )
      return;
    const { maxRunMinutes: _minutes, ...agent } = initialAgent(
      machine.providers,
    );
    setEditor({
      ...agent,
      id: identifier(),
      projectId,
      enabled: true,
      focus: "",
      maxProposals: 5,
      maxOpen: 10,
      autoStart: false,
      autoMerge: false,
      scheduleKind: "daily",
      minute: 0,
      time: "09:00",
      dayOfWeek: 1,
    });
  };
  return (
    <ScreenList<HostSteward>
      title={copy("Proje sorumluları", "Project stewards")}
      query={supported ? query : undefined}
      data={rows}
      keyExtractor={(item) => item.id}
      context={<Scope allowAll />}
      actions={
        supported ? (
          <IconButton
            label={
              existingSteward
                ? copy("Proje sorumlusunu düzenle", "Edit project steward")
                : copy("Yeni proje sorumlusu", "New project steward")
            }
            onPress={
              existingSteward ? () => setEditor(existingSteward) : create
            }
            disabled={
              !projectId ||
              (!existingSteward && !machine?.providers?.length) ||
              busy ||
              !!editor
            }
          >
            {existingSteward ? (
              <Pencil size={22} strokeWidth={2.2} color={colors.accent} />
            ) : (
              <Plus size={22} strokeWidth={2.2} color={colors.accent} />
            )}
          </IconButton>
        ) : undefined
      }
      header={
        <>
          {!supported ? (
            <Notice
              tone="info"
              message={copy(
                "Bu bilgisayar proje sorumlularını desteklemiyor.",
                "This computer does not support project stewards.",
              )}
            />
          ) : (
            <>
              {!projectId ? (
                <Body muted>
                  {copy(
                    "Proje sorumlusu oluşturmak için bir proje seç.",
                    "Choose a project to create a steward.",
                  )}
                </Body>
              ) : !existingSteward && !machine?.providers?.length ? (
                <AgentProviderPrerequisite />
              ) : null}
              <SearchField
                ref={searchInput}
                value={search}
                onChangeText={setSearch}
                label={copy("Ara", "Search")}
              />
              {!rows.some(
                (item) => item.id === savedStewardId(save.variables),
              ) ? (
                <MutationState
                  mutation={save}
                  success={copy(
                    "Proje sorumlusu kaydedildi.",
                    "Project steward saved.",
                  )}
                />
              ) : null}
              {!rows.some((item) => item.id === run.variables?.stewardId) ? (
                <MutationState mutation={run} />
              ) : null}
              {!rows.some((item) => item.id === remove.variables?.stewardId) ? (
                <MutationState mutation={remove} />
              ) : null}
              <QueryState
                query={query}
                empty={!rows.length}
                emptyTitle={
                  search.trim() && scoped.length
                    ? copy("Eşleşen sonuç yok", "No matching results")
                    : copy(
                        "Henüz proje sorumlusu yok",
                        "No project stewards yet",
                      )
                }
                emptyAction={search.trim() && scoped.length ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch } : undefined}
              />
            </>
          )}
          {editor ? (
            <Sheet
              visible
              size="form"
              title={copy(
                "Proje sorumlusu ayrıntıları",
                "Project steward details",
              )}
              onClose={() => setEditor(null)}
            >
              <StewardEditor
                key={editor.id}
                initial={editor}
                onClose={() => setEditor(null)}
              />
            </Sheet>
          ) : null}
        </>
      }
      renderItem={({ item }) => (
        <StewardCard
          item={item}
          save={save}
          run={run}
          remove={remove}
          busy={busy}
          editorOpen={!!editor}
          onEdit={setEditor}
        />
      )}
    />
  );
}
