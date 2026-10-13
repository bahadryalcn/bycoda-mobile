import { useState } from "react";
import { useLocale } from "../../i18n";
import { ChoiceChip, FormActions, ToggleField } from "../../ui/primitives";
import type {
  HostTask,
  HostTaskInput,
  HostAutomation,
  HostAutomationInput,
  HostAutomationRun,
  HostSettingsState,
} from "../../domain/types";
import {
  Action,
  Actions,
  Box,
  Copy,
  Feedback,
  Input,
  confirm,
  tr,
  useHostAction,
  useHostData,
  type ManagementProps,
} from "./shared";

function identifier() {
  return `mobile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
function AgentFields({
  harness,
  setHarness,
  model,
  setModel,
}: {
  harness: string;
  setHarness: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
}) {
  return (
    <>
      <Copy muted>{tr("Agent installed on the computer", "Bilgisayardaki ajan")}</Copy>
      <Actions>
        {["codex", "claude", "gemini", "opencode", "cursor"].map((v) => (
          <ChoiceChip key={v} label={v} selected={harness === v} onPress={() => setHarness(v)} />
        ))}
      </Actions>
      <Input
        label={tr("Model ID", "Model kimliği")}
        value={model}
        onChangeText={setModel}
        autoCapitalize="none"
      />
    </>
  );
}
export function TasksScreen({ machineId, projectId }: ManagementProps) {
  useLocale();
  const query = useHostData<HostTask[]>(
    machineId,
    projectId,
    "tasks",
    "tasks.list",
    projectId ? { projectId } : {},
  );
  const mutation = useHostAction(machineId);
  const [editing, setEditing] = useState<HostTask | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [harness, setHarness] = useState("codex");
  const [model, setModel] = useState("");
  const [verify, setVerify] = useState("");
  function edit(task: HostTask | "new") {
    setEditing(task);
    setTitle(task === "new" ? "" : task.title);
    setPrompt(task === "new" ? "" : task.prompt);
    setHarness(task === "new" ? "codex" : task.harness);
    setModel(task === "new" ? "" : task.model);
    setVerify(task === "new" ? "" : (task.verifyCommand ?? ""));
  }
  async function save() {
    const existing = editing && editing !== "new" ? editing : null;
    const task: HostTaskInput = {
      ...(existing ?? {}),
      id: existing?.id ?? identifier(),
      projectId: existing?.projectId ?? projectId!,
      title: title.trim(),
      prompt,
      harness: harness as HostTaskInput["harness"],
      model: model.trim(),
      modelSettings: existing?.modelSettings ?? {},
      runtimeMode: existing?.runtimeMode ?? "supervised",
      maxRunMinutes: existing?.maxRunMinutes ?? 0,
      isolate: existing?.isolate ?? true,
      review: existing?.review ?? true,
      autoMerge: false,
      verifyCommand: verify.trim(),
    };
    await mutation.mutateAsync({ method: "tasks.save", params: { task } });
    setEditing(null);
  }
  return (
    <>
      <Actions>
        <Action
          title={tr("New task", "Yeni görev")}
          disabled={!projectId || mutation.isPending}
          onPress={() => edit("new")}
        />
        <Action title={tr("Refresh", "Yenile")} onPress={() => void query.refetch()} />
      </Actions>
      {!projectId && (
        <Copy muted>
          {tr("Open a project to create a task.", "Görev oluşturmak için bir proje açın.")}
        </Copy>
      )}
      <Feedback loading={query.isPending} error={query.error} retry={() => void query.refetch()} />
      <Feedback error={mutation.error} />
      {editing && (
        <Box>
          <Input
            label={tr("Title", "Başlık")}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
          />
          <Input
            label={tr("Instructions", "Yönergeler")}
            value={prompt}
            onChangeText={setPrompt}
            multiline
          />
          <AgentFields {...{ harness, setHarness, model, setModel }} />
          <Input
            label={tr("Verification command (optional)", "Doğrulama komutu (isteğe bağlı)")}
            value={verify}
            onChangeText={setVerify}
            autoCapitalize="none"
          />
          <Copy muted>
            {tr(
              "Changes stay on a separate branch for review. Automatic merge is off.",
              "Değişiklikler inceleme için ayrı dalda tutulur. Otomatik birleştirme kapalı.",
            )}
          </Copy>
          <FormActions
            submitLabel={tr("Save", "Kaydet")}
            disabled={!title.trim() || !prompt.trim() || !model.trim() || mutation.isPending}
            onSubmit={() => void save().catch(() => {})}
            cancelLabel={tr("Cancel", "Vazgeç")}
            onCancel={() => setEditing(null)}
          />
        </Box>
      )}
      {query.data?.map((task) => (
        <Box key={task.id}>
          <Copy>{task.title}</Copy>
          <Copy muted>
            {task.status} · {task.harness} · {task.model}
          </Copy>
          <Copy>{task.prompt}</Copy>
          {task.error && <Copy>{task.error}</Copy>}
          {task.diffStat && <Copy>{task.diffStat}</Copy>}
          {task.reviewNotes
            ?.filter((n) => !n.resolvedAt)
            .map((n) => (
              <Copy key={n.id}>{n.finding}</Copy>
            ))}
          <Actions>
            {!["running", "verifying"].includes(task.status) && (
              <Action
                title={tr("Edit", "Düzenle")}
                disabled={mutation.isPending}
                onPress={() => edit(task)}
              />
            )}
            {["todo", "blocked", "done", "review"].includes(task.status) && (
              <Action
                title={tr("Queue / run", "Kuyruğa al / çalıştır")}
                disabled={mutation.isPending}
                onPress={() =>
                  confirm(tr("Run task", "Görevi çalıştır"), task.title, () =>
                    mutation.mutate({
                      method: "tasks.move",
                      params: { taskId: task.id, to: "queued" },
                    }),
                  )
                }
              />
            )}
            {["running", "verifying", "queued"].includes(task.status) && (
              <Action
                title={tr("Stop", "Durdur")}
                danger
                disabled={mutation.isPending}
                onPress={() =>
                  confirm(tr("Stop task", "Görevi durdur"), task.title, () =>
                    mutation.mutate({
                      method: "tasks.move",
                      params: { taskId: task.id, to: "blocked" },
                    }),
                  )
                }
              />
            )}
            {task.status === "review" && (
              <Action
                title={tr("Review again", "Tekrar incele")}
                disabled={mutation.isPending}
                onPress={() =>
                  mutation.mutate({ method: "tasks.review.recheck", params: { taskId: task.id } })
                }
              />
            )}
            {!task.branch && !["running", "verifying"].includes(task.status) && (
              <Action
                title={tr("Delete", "Sil")}
                danger
                disabled={mutation.isPending}
                onPress={() =>
                  confirm(tr("Delete task", "Görevi sil"), task.title, () =>
                    mutation.mutate({ method: "tasks.delete", params: { taskId: task.id } }),
                  )
                }
              />
            )}
          </Actions>
        </Box>
      ))}
      {query.data?.length === 0 && (
        <Copy muted>{tr("No tasks on this computer.", "Bu bilgisayarda görev yok.")}</Copy>
      )}
    </>
  );
}

export function AutomationsScreen({ machineId, projectId }: ManagementProps) {
  useLocale();
  const query = useHostData<HostAutomation[]>(
    machineId,
    projectId,
    "automations",
    "automations.list",
  );
  const mutation = useHostAction(machineId);
  const [editing, setEditing] = useState<HostAutomation | "new" | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [harness, setHarness] = useState("codex");
  const [model, setModel] = useState("");
  const [time, setTime] = useState("09:00");
  const [schedule, setSchedule] = useState<HostAutomationInput["scheduleKind"]>("daily");
  const [history, setHistory] = useState<string | null>(null);
  const runs = useHostData<HostAutomationRun[]>(
    machineId,
    projectId,
    `runs-${history}`,
    "automations.runs",
    { automationId: history },
    !!history,
  );
  function edit(a: HostAutomation | "new") {
    setEditing(a);
    setName(a === "new" ? "" : a.name);
    setPrompt(a === "new" ? "" : a.prompt);
    setHarness(a === "new" ? "codex" : a.harness);
    setModel(a === "new" ? "" : a.model);
    setTime(a === "new" ? "09:00" : a.time);
    setSchedule(a === "new" ? "daily" : a.scheduleKind);
  }
  async function save() {
    const old = editing && editing !== "new" ? editing : null;
    const automation: HostAutomationInput = {
      ...(old ?? {}),
      id: old?.id ?? identifier(),
      projectId: old?.projectId ?? projectId!,
      name: name.trim(),
      prompt,
      harness: harness as HostAutomationInput["harness"],
      model: model.trim(),
      modelSettings: old?.modelSettings ?? {},
      runtimeMode: old?.runtimeMode ?? "supervised",
      scheduleKind: schedule,
      minute: Number(time.split(":")[1]),
      time,
      dayOfWeek: old?.dayOfWeek ?? 1,
      maxRunMinutes: old?.maxRunMinutes ?? 0,
      maxRunsPerDay: old?.maxRunsPerDay ?? 0,
      enabled: old?.enabled ?? false,
    };
    await mutation.mutateAsync({ method: "automations.save", params: { automation } });
    setEditing(null);
  }
  return (
    <>
      <Actions>
        <Action
          title={tr("New automation", "Yeni otomasyon")}
          disabled={!projectId || mutation.isPending}
          onPress={() => edit("new")}
        />
        <Action title={tr("Refresh", "Yenile")} onPress={() => void query.refetch()} />
      </Actions>
      <Feedback loading={query.isPending} error={query.error} retry={() => void query.refetch()} />
      <Feedback error={mutation.error} />
      {editing && (
        <Box>
          <Input label={tr("Name", "Ad")} value={name} onChangeText={setName} />
          <Input
            label={tr("Instructions", "Yönergeler")}
            multiline
            value={prompt}
            onChangeText={setPrompt}
          />
          <AgentFields {...{ harness, setHarness, model, setModel }} />
          <Actions>
            {(["hourly", "daily", "weekdays", "weekly"] as const).map((s) => (
              <ChoiceChip
                key={s}
                label={s}
                selected={schedule === s}
                onPress={() => setSchedule(s)}
              />
            ))}
          </Actions>
          <Input
            label={tr("Computer local time (HH:mm)", "Bilgisayarın yerel saati (SS:dd)")}
            value={time}
            onChangeText={setTime}
          />
          {schedule === "weekly" && (
            <Copy muted>
              {tr(
                "Runs on Monday; existing automation retains its weekday.",
                "Pazartesi çalışır; mevcut otomasyon haftanın gününü korur.",
              )}
            </Copy>
          )}
          <Copy muted>
            {tr(
              "New schedules start paused. Enable after reviewing.",
              "Yeni zamanlamalar duraklatılmış başlar. İnceledikten sonra etkinleştirin.",
            )}
          </Copy>
          <FormActions
            submitLabel={tr("Save", "Kaydet")}
            disabled={
              !name.trim() ||
              !prompt.trim() ||
              !model.trim() ||
              !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
              mutation.isPending
            }
            onSubmit={() => void save().catch(() => {})}
            cancelLabel={tr("Cancel", "Vazgeç")}
            onCancel={() => setEditing(null)}
          />
        </Box>
      )}
      {query.data
        ?.filter((a) => !projectId || a.projectId === projectId)
        .map((a) => (
          <Box key={a.id}>
            <Copy>{a.name}</Copy>
            <Copy muted>
              {a.scheduleKind} · {a.time} · {a.lastRunStatus ?? ""}
            </Copy>
            {a.lastRunError && <Copy>{a.lastRunError}</Copy>}
            <ToggleField
              label={tr("Enable automation", "Otomasyonu etkinleştir")}
              value={a.enabled}
              disabled={mutation.isPending}
              onChange={(enabled) =>
                mutation.mutate({
                  method: "automations.save",
                  params: { automation: { ...a, enabled } },
                })
              }
            />
            <Actions>
              <Action title={tr("Edit", "Düzenle")} onPress={() => edit(a)} />
              <Action
                title={tr("Run now", "Şimdi çalıştır")}
                disabled={mutation.isPending}
                onPress={() =>
                  confirm(tr("Run automation", "Otomasyonu çalıştır"), a.name, () =>
                    mutation.mutate({
                      method: "automations.runNow",
                      params: { automationId: a.id },
                    }),
                  )
                }
              />
              <Action
                title={tr("History", "Geçmiş")}
                onPress={() => setHistory(history === a.id ? null : a.id)}
              />
              <Action
                title={tr("Delete", "Sil")}
                danger
                onPress={() =>
                  confirm(tr("Delete automation", "Otomasyonu sil"), a.name, () =>
                    mutation.mutate({
                      method: "automations.delete",
                      params: { automationId: a.id },
                    }),
                  )
                }
              />
            </Actions>
            {history === a.id && (
              <>
                <Feedback loading={runs.isPending} error={runs.error} />
                {runs.data?.map((r) => (
                  <Copy key={r.id}>
                    {new Date(r.createdAt).toLocaleString()} · {r.status}
                    {r.error ? ` · ${r.error}` : ""}
                  </Copy>
                ))}
                {runs.data?.length === 0 && (
                  <Copy muted>{tr("No runs yet.", "Henüz çalışma yok.")}</Copy>
                )}
              </>
            )}
          </Box>
        ))}
      {query.data?.filter((a) => !projectId || a.projectId === projectId).length === 0 && (
        <Copy muted>{tr("No automations in this project.", "Bu projede otomasyon yok.")}</Copy>
      )}
    </>
  );
}

export function HostSettingsScreen({ machineId }: ManagementProps) {
  useLocale();
  const query = useHostData<HostSettingsState>(
    machineId,
    undefined,
    "settings",
    "host.settings.get",
  );
  const mutation = useHostAction(machineId);
  const [concurrency, setConcurrency] = useState("");
  const [minutes, setMinutes] = useState("");
  const concurrent = concurrency || String(query.data?.maxRunningTasks ?? 2);
  const daily = minutes || String(query.data?.dailyAgentMinutes ?? 0);
  return (
    <>
      <Feedback loading={query.isPending} error={query.error} retry={() => void query.refetch()} />
      <Feedback error={mutation.error} />
      {query.data && (
        <Box>
          <Copy muted>
            {tr(
              "Limits apply to this computer and all its projects.",
              "Sınırlar bu bilgisayara ve tüm projelerine uygulanır.",
            )}
          </Copy>
          <Input
            label={tr("Concurrent tasks (1–8)", "Eşzamanlı görevler (1–8)")}
            keyboardType="number-pad"
            value={concurrent}
            onChangeText={setConcurrency}
          />
          <Input
            label={tr("Daily agent minutes (0 = unlimited)", "Günlük ajan dakikası (0 = sınırsız)")}
            keyboardType="number-pad"
            value={daily}
            onChangeText={setMinutes}
          />
          <Copy>
            {tr("Used today", "Bugün kullanılan")}: {Math.round(query.data.usedMinutes)} min
          </Copy>
          <Action
            title={tr("Save limits", "Sınırları kaydet")}
            disabled={
              mutation.isPending ||
              !/^\d+$/.test(concurrent) ||
              Number(concurrent) < 1 ||
              Number(concurrent) > 8 ||
              !/^\d+$/.test(daily) ||
              !Number.isSafeInteger(Number(daily))
            }
            onPress={() =>
              mutation.mutate({
                method: "host.settings.save",
                params: {
                  settings: {
                    maxRunningTasks: Number(concurrent),
                    dailyAgentMinutes: Number(daily),
                  },
                },
              })
            }
          />
        </Box>
      )}
    </>
  );
}
