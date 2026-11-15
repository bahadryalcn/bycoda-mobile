import { agentPresentation } from "../shared/agent-presentation";
import { router } from "expo-router";
import type { HostSteward } from "@/remote/types";
import { useActiveMachine } from "@/state/machines";
import type { useHostMutation } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { RecordCard } from "@/ui/record-card";
import { useMobileTheme } from "@/ui/theme";
import Play from "lucide-react-native/icons/play";
import Pause from "lucide-react-native/icons/pause";
import Pencil from "lucide-react-native/icons/pencil";
import MessageSquare from "lucide-react-native/icons/message-square";
import Trash2 from "lucide-react-native/icons/trash-2";
import {
  ActionMenu,
  Body,
  ErrorNotice,
  IconButton,
  MutationState,
} from "@/ui/primitives";
import { joinMeta, RecordTrailing, useMenuGlyph, useRelativeTime } from "../shared/record-bits";
import { Status } from "../shared/status";
import { scheduleSentence } from "../automations/schedule-model";
import { savedStewardId } from "./steward-feedback";
import { useProjectList } from "../../workspace/use-project-directory";

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
  const { colors } = useMobileTheme();
  const machine = useActiveMachine();
  const projects = useProjectList();
  const glyph = useMenuGlyph();
  const relative = useRelativeTime();
  const running = run.isPending && run.variables?.stewardId === item.id;
  const runNow = () =>
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
    );
  return (
    <RecordCard
      title={projects.data?.find((project) => project.id === item.projectId)?.name ?? copy("Proje sorumlusu", "Project steward")}
      preview={item.focus ? <Body muted numberOfLines={2}>{item.focus}</Body> : null}
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
      metadata={joinMeta([
        scheduleSentence(item, copy),
        item.enabled && !item.run && !!relative(item.nextRunAt) && copy("Sonraki {p0}", "Next {p0}", { p0: relative(item.nextRunAt) }),
        !!relative(item.lastRunAt) && copy("Son çalışma {p0}", "Last run {p0}", { p0: relative(item.lastRunAt) }),
      ])}
      details={
        <>
          {item.focus ? <Body>{item.focus}</Body> : null}
          <Body muted>{agentPresentation(item.harness, item.model)}</Body>
        </>
      }
      menu={
        <RecordTrailing>
        <IconButton label={copy("Şimdi çalıştır", "Run now")} busy={running}
          disabled={busy || !!item.run || editorOpen} onPress={runNow}>
          <Play size={18} color={colors.accent} />
        </IconButton>
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
              icon: glyph(item.enabled ? Pause : Play),
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
              icon: glyph(Pencil),
              label: copy("Düzenle", "Edit"),
              disabled: busy || editorOpen,
              onPress: () => onEdit(item),
            },
            item.lastSessionId && machine
              ? {
                  key: "session",
                  icon: glyph(MessageSquare),
                  label: copy("Son oturum", "Last session"),
                  onPress: () =>
                    router.navigate({
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
              icon: glyph(Trash2, true),
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
        </RecordTrailing>
      }
    >
      <ErrorNotice error={item.lastRunError} />
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
