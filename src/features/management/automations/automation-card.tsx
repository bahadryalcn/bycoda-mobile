import { agentPresentation } from "../shared/agent-presentation";
import { RecordCard } from "@/ui/record-card";
import { router } from "expo-router";
import Power from "lucide-react-native/icons/power";
import Pause from "lucide-react-native/icons/pause";
import Pencil from "lucide-react-native/icons/pencil";
import History from "lucide-react-native/icons/history";
import MessageSquare from "lucide-react-native/icons/message-square";
import Trash2 from "lucide-react-native/icons/trash-2";
import { ActionMenu, Body, Button, ErrorNotice, MutationState } from "@/ui/primitives";
import { HoursOverview } from "@/ui/week-hours";
import { WEEK_ORDER, weekRunBlocks } from "@/ui/week-hours-model";
import { joinMeta, RecordTrailing, useMenuGlyph, useRelativeTime } from "../shared/record-bits";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useActiveMachine } from "@/state/machines";
import { Status } from "../shared/status";
import { AutomationHistory } from "./automation-history";
import type { AutomationCardProps } from "./types";
import { automationEventLabel, scheduleSentence } from "./schedule-model";
import { savedAutomationId } from "./automation-feedback";

export function AutomationCard({
  item,
  busy,
  editorOpen,
  historyId,
  onEdit,
  onHistory,
  save,
  run,
  remove,
}: AutomationCardProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const glyph = useMenuGlyph();
  const relative = useRelativeTime();
  const running = run.isPending && run.variables?.automationId === item.id;
  const dayNames = [copy("Paz", "Sun"), copy("Pzt", "Mon"), copy("Sal", "Tue"), copy("Çar", "Wed"), copy("Per", "Thu"), copy("Cum", "Fri"), copy("Cmt", "Sat")];
  const blocks = weekRunBlocks(item);
  const runNow = () => confirmAction(
    copy("Şimdi çalıştır", "Run now"),
    copy("Ajan bu bilgisayarda otomasyon talimatlarını çalıştıracak.", "The agent will run this automation on the computer."),
    copy("Çalıştır", "Run"),
    () => run.mutate({ automationId: item.id }), undefined, "default",
  );
  // Edit, history, last session and delete are secondary; they live in the overflow menu.
  const menu = [
    {
      key: "toggle", icon: glyph(item.enabled ? Pause : Power),
      label: item.enabled ? copy("Duraklat", "Pause") : copy("Etkinleştir", "Enable"),
      disabled: busy || editorOpen,
      onPress: () =>
        save.mutate({
          automation: { ...item, enabled: !item.enabled, expectedConfiguration: item },
        }),
    },
    {
      key: "edit", icon: glyph(Pencil),
      label: copy("Düzenle", "Edit"),
      disabled: busy || editorOpen,
      onPress: () => onEdit(item.id),
    },
    {
      key: "history", icon: glyph(History),
      label: copy("Geçmiş", "History"),
      onPress: () => onHistory(historyId === item.id ? null : item.id),
    },
    !!item.lastSessionId && {
      key: "session", icon: glyph(MessageSquare),
      label: copy("Son oturum", "Last session"),
      onPress: () => {
        if (machine && item.lastSessionId)
          router.navigate({
            pathname: "/session/[id]",
            params: {
              id: item.lastSessionId,
              machineId: machine.id,
              projectId: item.projectId,
            },
          });
      },
    },
    {
      key: "delete", icon: glyph(Trash2, true),
      label: copy("Sil", "Delete"),
      destructive: true,
      disabled: busy,
      onPress: () =>
        confirmAction(
          copy("Otomasyonu sil", "Delete automation"),
          copy(
            "Zamanlanmış iş ve çalıştırma geçmişi silinecek.",
            "The schedule and run history will be deleted.",
          ),
          copy("Sil", "Delete"),
          () => remove.mutate({ automationId: item.id }),
        ),
    },
  ];
  return (
    <RecordCard
      title={item.name}
      status={<Status value={item.enabled ? (item.lastRunStatus ?? "idle") : "paused"} />}
      metadata={joinMeta([
        item.template?.kind === "project-scan" ? copy("Proje taraması", "Project scan") : undefined,
        !item.projectId ? "Room" : undefined,
        item.trigger?.kind === "continuous" ? copy("Sürekli · en az {p0} dk", "Continuous · minimum {p0} min", { p0: item.trigger.minimumGapMinutes }) : item.trigger?.kind === "event" ? automationEventLabel(item.trigger.event, copy) : scheduleSentence(item, copy),
        item.enabled && !!relative(item.nextRunAt) && copy("Sonraki {p0}", "Next {p0}", { p0: relative(item.nextRunAt) }),
        !!relative(item.lastRunAt) && copy("Son çalışma {p0}", "Last run {p0}", { p0: relative(item.lastRunAt) }),
      ])}
      preview={item.prompt ? <Body muted numberOfLines={2}>{item.prompt}</Body> : null}
      footer={<Button tone="primary" label={copy("Şimdi çalıştır", "Run now")} busy={running}
        disabled={busy || editorOpen} onPress={runNow} />}
      menu={<RecordTrailing>
        <ActionMenu label={copy("Otomasyon işlemleri", "Automation actions")}
          busy={(save.isPending && (save.variables?.automation as { id?: string } | undefined)?.id === item.id) || (remove.isPending && remove.variables?.automationId === item.id)} actions={menu} />
      </RecordTrailing>}
      details={
        <>
          <Body>{item.prompt}</Body>
          <Body muted>{agentPresentation(item.harness, item.model)}</Body>
          {!item.trigger ? <HoursOverview rows={WEEK_ORDER.map((day) => ({ key: String(day), label: dayNames[day], blocks: blocks[day] }))} /> : null}
        </>
      }
    >
      <ErrorNotice error={historyId === item.id ? undefined : item.lastRunError} />
      {!editorOpen && savedAutomationId(save.variables) === item.id ? <MutationState mutation={save} success={copy("Otomasyon kaydedildi.", "Automation saved.")} /> : null}
      {run.variables?.automationId === item.id ? <MutationState mutation={run} success={copy("Çalıştırma istendi.", "Run requested.")} /> : null}
      {remove.variables?.automationId === item.id ? <MutationState mutation={remove} /> : null}
      {historyId === item.id && (
        <AutomationHistory automationId={item.id} projectId={item.projectId} summary={item} automationName={item.name} onClose={() => onHistory(null)} />
      )}
    </RecordCard>
  );
}
