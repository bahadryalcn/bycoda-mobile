import { Input } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { useProjectList } from "../workspace/use-project-directory";
import { useReducer, useState } from "react";

import {
  Button,
  Card,
  MutationState,
  Notice,
  Heading,
  QueryState,
  Screen,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import type { HostGoal } from "@/domain/types";
import { Scope } from "./shared/scope";

import { goalFlowReducer } from "./goals/flow";
import { GoalEditor } from "./goals/goal-editor";
import { ReplanEditor } from "./goals/replan-editor";
import { GoalCard } from "./goals/goal-card";

export function GoalsScreen() {
  const copy = useCopy();
  const [search, setSearch] = useState("");
  const machine = useActiveMachine();
  const projectId = useMachines((state) => state.selectedProjectId);
  const query = useHostQuery<HostGoal[]>(["goals"], "goals.list", {}, { interval: 5000 });
  const projects = useProjectList();
  const create = useHostMutation<HostGoal>("goals.create", ["goals"]);
  const approve = useHostMutation<HostGoal>("goals.approve", ["goals"]);
  const cancel = useHostMutation<HostGoal>("goals.cancel", ["goals"]);
  const remove = useHostMutation("goals.delete", ["goals"]);
  const replan = useHostMutation<HostGoal>("goals.replan", ["goals"]);
  const [flow, dispatch] = useReducer(goalFlowReducer, { kind: "closed" });
  const close = () => dispatch({ type: "close" });
  const busy =
    create.isPending ||
    approve.isPending ||
    cancel.isPending ||
    remove.isPending ||
    replan.isPending;
  const visible = query.data?.filter((goal) => (!projectId || goal.projectIds.includes(projectId)) && (goal.title + " " + goal.prompt).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const replanGoal =
    flow.kind === "replan" ? query.data?.find((goal) => goal.id === flow.goalId) : undefined;
  return (
    <ScreenList<HostGoal> title={copy("Hedefler", "Goals")} query={query}
      data={visible ?? []}
      keyExtractor={(item) => item.id}
      header={<>
      <Scope allowAll />
      <Input label={copy("Ara", "Search")} placeholder={copy("Ara", "Search")} value={search} onChangeText={setSearch} autoCorrect={false} />
      <Button
        label={copy("Yeni hedef", "New goal")}
        disabled={!projectId || !machine?.providers?.length || flow.kind !== "closed" || busy}
        onPress={() => { create.reset(); if (projectId) dispatch({ type: "new", projectId }); }}
      />
      <MutationState
        mutation={create}
        success={copy("Hedef planlaması istendi.", "Goal planning requested.")}
      />
      <MutationState mutation={approve} />
      <MutationState mutation={cancel} />
      <MutationState mutation={remove} />
      {flow.kind === "closed" && <MutationState mutation={replan} />}
      {flow.kind === "new" && (
        <Sheet
          visible
          size="form"
          title={copy("Yeni hedef", "New goal")}
          onClose={() => {
            if (!busy) close();
          }}
        >
          <GoalEditor
            key={flow.projectId}
            projectId={flow.projectId}
            projects={projects.data ?? []}
            create={create}
            busy={busy}
            onClose={close}
          />
        </Sheet>
      )}
      {replanGoal && (
        <Sheet
          visible
          size="form"
          title={copy("Planı değiştir", "Revise plan")}
          onClose={() => {
            if (!busy) close();
          }}
        >
          <Heading>{replanGoal.title}</Heading>
          <ReplanEditor
            key={replanGoal.id}
            goalId={replanGoal.id}
            replan={replan}
            busy={busy}
            onClose={close}
          />
        </Sheet>
      )}
      {flow.kind === "replan" && query.isSuccess && !replanGoal && (
        <Notice
          tone="warning"
          message={copy("Hedef artık bulunamadı.", "The goal is no longer available.")}
        >
          <Button label={copy("Kapat", "Close")} onPress={close} />
        </Notice>
      )}
      <QueryState
        query={query}
        empty={visible?.length === 0}
        emptyTitle={copy("Henüz hedef yok", "No goals yet")}
      />
      {search.trim() && visible?.length === 0 ? <Button tone="quiet" label={copy("Aramayı temizle", "Clear search")} onPress={() => setSearch("")} /> : null}
      </>}
      renderItem={({ item: goal }) => (
        <GoalCard
          goal={goal}
          projects={projects.data ?? []}
          busy={busy}
          editorOpen={flow.kind !== "closed"}
          approve={approve}
          cancel={cancel}
          remove={remove}
          onReplan={(goalId) => { replan.reset(); dispatch({ type: "replan", goalId }); }}
        />
      )}
    />

  );
}
