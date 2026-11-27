import { useState } from "react";
import type { HostSteward, HostStewardInput } from "@/remote/types";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { getQueryPresentation } from "@/ui/query-presentation";
import {
  Body,
  MutationState,
  StateView,
  QueryState,
  Sheet,
} from "@/ui/primitives";
import { ManagementList } from "./shared/management-list";
import { ProjectScopePill } from "../workspace/project-scope-pill";
import { useRequiredProjectScope } from "./shared/required-project-scope";
import { AgentProviderPrerequisite } from "./shared/agent-provider-prerequisite";
import { initialAgent, useAgentProviders } from "./shared/agent";
import { identifier } from "./shared/format";
import { StewardCard } from "./stewards/steward-card";
import { savedStewardId } from "./stewards/steward-feedback";
import { StewardEditor } from "./stewards/steward-editor";
import { useProjectList } from "../workspace/use-project-directory";

export function StewardsScreen() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const { projectId, setProjectId } = useRequiredProjectScope();
  const { providers, query: providerQuery } = useAgentProviders(projectId);
  const supported = machine?.capabilities?.includes("stewards") === true;
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
  const projects = useProjectList();
  // Until the project is known nothing is listed, so the page never shows another project's steward.
  const scopePending = !projectId && !projects.directoryReady;
  const listQuery = scopePending
    ? ({ ...query, data: undefined, error: null, status: "pending", isPending: true, isLoading: true,
        isSuccess: false, fetchStatus: "fetching" } as unknown as typeof query)
    : query;
  // A project has at most one steward, so the page lists it without search or filters.
  const rows = scopePending
    ? []
    : (query.data ?? []).filter((item) => !projectId || item.projectId === projectId);
  const existingSteward = projectId
    ? query.data?.find((item) => item.projectId === projectId)
    : undefined;
  const presentation = getQueryPresentation(query);
  const canCreate =
    supported &&
    presentation === "ready" &&
    query.data !== undefined &&
    !!projectId &&
    !!providers.length &&
    !busy &&
    !editor &&
    !existingSteward;
  const create = () => {
    if (!canCreate || !projectId) return;
    const { maxRunMinutes: _minutes, ...agent } = initialAgent(providers);
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
  const listState = (
    <QueryState
      size="region"
      query={listQuery}
      empty={!!query.data && !rows.length}
      emptyTitle={copy("Henüz proje sorumlusu yok", "No project stewards yet")}
      emptyDetail={copy(
        "Proje sorumlusu projeyi düzenli inceler ve yeni görevler önerir.",
        "A project steward reviews the project on a schedule and proposes new tasks.",
      )}
      emptyAction={
        canCreate
          ? { label: copy("Yeni proje sorumlusu", "New project steward"), onPress: create }
          : undefined
      }
    />
  );
  return (
    <ManagementList<HostSteward>
      title={copy("Proje sorumluları", "Project stewards")}
      scopeControl={<ProjectScopePill allowAll={false} projectId={projectId} onChange={setProjectId} />}
      query={supported ? listQuery : undefined}
      ListEmptyComponent={supported ? listState : undefined}
      data={rows}
      keyExtractor={(item) => item.id}
      header={
        <>
          {!supported ? (
            <StateView
              illustration="permission"
              title={copy("Güncelleme gerekiyor", "Update needed")}
              description={copy(
                "Bu bilgisayar proje sorumlularını desteklemiyor.",
                "This computer does not support project stewards.",
              )}
            />
          ) : (
            <>
              {!projectId && projects.directoryReady ? (
                <Body muted>
                  {copy(
                    "Proje sorumlusu oluşturmak için bir proje seçin.",
                    "Choose a project to create a steward.",
                  )}
                </Body>
              ) : !existingSteward && !providers.length ? (
                <>
                  {providerQuery.isLoading || providerQuery.error ? (
                    <QueryState query={providerQuery} loading="inline" />
                  ) : (
                    <AgentProviderPrerequisite />
                  )}
                </>
              ) : null}
              {!rows.some((item) => item.id === savedStewardId(save.variables)) ? (
                <MutationState
                  mutation={save}
                  success={copy("Proje sorumlusu kaydedildi.", "Project steward saved.")}
                />
              ) : null}
              {!rows.some((item) => item.id === run.variables?.stewardId) ? (
                <MutationState
                  mutation={run}
                  success={copy("Çalıştırma istendi.", "Run requested.")}
                />
              ) : null}
              {!rows.some((item) => item.id === remove.variables?.stewardId) ? (
                <MutationState mutation={remove} />
              ) : null}
              {rows?.length ? listState : null}
            </>
          )}
          {editor ? (
            <Sheet
              visible
              size="form"
              title={
                !("updatedAt" in editor)
                  ? copy("Yeni proje sorumlusu", "New project steward")
                  : copy("Proje sorumlusunu düzenle", "Edit project steward")
              }
              onClose={() => setEditor(null)}
            >
              <StewardEditor
                key={editor.id}
                initial={editor}
                save={save}
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
