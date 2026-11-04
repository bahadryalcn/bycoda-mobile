import { router } from "expo-router";
import type { HostSteward } from "@/remote/types";
import { useActiveMachine } from "@/state/machines";
import type { useHostMutation } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { RecordCard } from "@/ui/record-card";
import {
  ActionMenu,
  Body,
  Button,
  ErrorText,
  MutationState,
  Row,
} from "@/ui/primitives";
import { stamp } from "../shared/format";
import { Status } from "../shared/status";
import { scheduleLabel } from "../automations/schedule-model";
import { savedStewardId } from "./steward-feedback";

type StewardCardProps = {
  item: HostSteward;
  save: ReturnType<typeof useHostMutation>;
  run: ReturnType<typeof useHostMutation>;
  remove: ReturnType<typeof useHostMutation>;
  busy: boolean;
  editorOpen: boolean;
  onEdit: (item: HostSteward) => void;
};

export function StewardCard({
  item,
  save,
  run,
  remove,
  busy,
  editorOpen,
  onEdit,
}: StewardCardProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  return (
    <RecordCard
      title={item.focus || copy("Proje sorumlusu", "Project steward")}
      status={
        <Status
          value={
            item.run
              ? "running"
              : item.enabled
                ? (item.lastRunStatus ?? "idle")
                : "paused"
          }
        />
      }
      metadata={
        scheduleLabel(item, copy) +
        " · " +
        copy("Sonraki", "Next") +
        ": " +
        stamp(item.nextRunAt)
      }
      footer={
        <Row>
          <Button
            label={copy("Şimdi çalıştır", "Run now")}
            tone="quiet"
            busy={run.isPending && run.variables?.stewardId === item.id}
            disabled={busy || !!item.run || editorOpen}
            onPress={() =>
              confirmAction(
                copy("Şimdi çalıştır", "Run now"),
                copy(
                  "Ajan bu projeyi inceleyip görev önerileri oluşturacak.",
                  "The agent will inspect this project and propose tasks.",
                ),
                copy("Çalıştır", "Run"),
                () => run.mutate({ stewardId: item.id }),
                copy("Vazgeç", "Cancel"),
                "default",
              )
            }
          />
        </Row>
      }
      details={
        <Body mono>
          {item.harness} · {item.model}
        </Body>
      }
      menu={
        <ActionMenu
          label={copy("Proje sorumlusu işlemleri", "Steward actions")}
          busy={
            (save.isPending &&
              (save.variables?.steward as { id?: string } | undefined)?.id ===
                item.id) ||
            (remove.isPending && remove.variables?.stewardId === item.id)
          }
          actions={[
            {
              key: "toggle",
              label: item.enabled
                ? copy("Duraklat", "Pause")
                : copy("Etkinleştir", "Enable"),
              disabled: busy || editorOpen,
              onPress: () =>
                save.mutate({
                  steward: {
                    ...item,
                    enabled: !item.enabled,
                    expectedConfiguration: item,
                  },
                }),
            },
            {
              key: "edit",
              label: copy("Düzenle", "Edit"),
              disabled: busy || editorOpen,
              onPress: () => onEdit(item),
            },
            item.lastSessionId && machine
              ? {
                  key: "session",
                  label: copy("Son oturum", "Last session"),
                  onPress: () =>
                    router.push({
                      pathname: "/session/[id]",
                      params: {
                        id: item.lastSessionId!,
                        machineId: machine.id,
                        projectId: item.projectId,
                      },
                    }),
                }
              : null,
            {
              key: "delete",
              label: copy("Sil", "Delete"),
              destructive: true,
              disabled: busy || editorOpen,
              onPress: () =>
                confirmAction(
                  copy("Sil", "Delete"),
                  copy(
                    "Proje sorumlusu silinir ve varsa çalışması durdurulur. Önerilen görevler korunur.",
                    "The steward will be deleted and its active run stopped. Proposed tasks are kept.",
                  ),
                  copy("Sil", "Delete"),
                  () => remove.mutate({ stewardId: item.id }),
                  copy("Vazgeç", "Cancel"),
                ),
            },
          ]}
        />
      }
    >
      <ErrorText error={item.lastRunError} />
      {savedStewardId(save.variables) === item.id ? (
        <MutationState
          mutation={save}
          success={copy(
            "Proje sorumlusu kaydedildi.",
            "Project steward saved.",
          )}
        />
      ) : null}
      {run.variables?.stewardId === item.id ? (
        <MutationState mutation={run} />
      ) : null}
      {remove.variables?.stewardId === item.id ? (
        <MutationState mutation={remove} />
      ) : null}
    </RecordCard>
  );
}
