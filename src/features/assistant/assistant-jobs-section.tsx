import { useRef, useState } from "react";
import { View } from "react-native";
import { useCopy } from "@/ui/copy";
import { Badge, Body, Button, ErrorNotice, FormActions, Row, Section, Sheet } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import type {
  AssistantJob,
  AssistantJobHoldReason,
} from "../../../../src/shared/model/host-contracts/assistant";
import type { AssistantJobAction, AssistantMobileClient } from "./assistant-client";
import { jobActions, jobHold, jobHoldCopy, jobStatusCopy } from "./assistant-jobs";

const MAX_JOBS = 20;

/**
 * Pause, resume and stop. Each control owns its pending and error state; the Host version
 * check means a lost reply can only conflict on a later tap, never act twice.
 */
export function AssistantJobsSection({
  client,
  jobs,
  holds,
  current,
  enabled,
  onChanged,
}: {
  client: AssistantMobileClient;
  jobs: AssistantJob[];
  holds: Record<string, AssistantJobHoldReason> | undefined;
  current(): boolean;
  enabled: boolean;
  onChanged(): Promise<unknown>;
}) {
  const copy = useCopy();
  const pending = useRef(false);
  const [busy, setBusy] = useState<{ id: string; action: AssistantJobAction } | null>(null);
  const [errors, setErrors] = useState<Record<string, unknown>>({});
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  // Always act on the Host's latest version of the job, never a copy captured when the sheet opened.
  const stopping =
    jobs.find((job) => job.id === stoppingId && jobActions(job).includes("stop")) ?? null;
  const run = async (job: AssistantJob, action: AssistantJobAction) => {
    if (pending.current || !current() || !enabled) return;
    pending.current = true;
    setBusy({ id: job.id, action });
    setErrors((old) => ({ ...old, [job.id]: undefined }));
    try {
      await client.controlJob({ id: job.id, expectedVersion: job.version, action });
      if (current()) setStoppingId(null);
    } catch (error) {
      if (current()) setErrors((old) => ({ ...old, [job.id]: error }));
    } finally {
      pending.current = false;
      if (current()) setBusy(null);
      // A conflict or lost reply is resolved by the Host's current job, not by this tap.
      await onChanged().catch(() => {});
    }
  };
  if (!jobs.length) return null;
  const labels: Record<AssistantJobAction, string> = {
    pause: copy("Duraklat", "Pause"),
    resume: copy("Sürdür", "Resume"),
    stop: copy("Durdur", "Stop"),
  };
  const stopError = stopping ? errors[stopping.id] : undefined;
  return (
    <Section title={copy("İşler", "Jobs")}>
      {jobs.slice(0, MAX_JOBS).map((job) => {
        const hold = jobHold(job, holds);
        const actions = jobActions(job);
        return (
          <View key={job.id} style={{ gap: space.xs }}>
            <Body>{job.title}</Body>
            <Row>
              <Badge
                label={copy(...jobStatusCopy(job.status))}
                tone={
                  job.status === "failed"
                    ? "danger"
                    : job.status === "stalled" || job.status === "waiting"
                      ? "warning"
                      : "default"
                }
              />
              {job.progress.total > 0 ? (
                <Body muted>
                  {copy("{p0}/{p1} görev", "{p0}/{p1} tasks", {
                    p0: job.progress.done,
                    p1: job.progress.total,
                  })}
                </Body>
              ) : null}
            </Row>
            {hold ? <Body muted>{copy(...jobHoldCopy(hold))}</Body> : null}
            {actions.length ? (
              <Row>
                {actions.map((action) => (
                  <Button
                    key={action}
                    label={labels[action]}
                    accessibilityLabel={`${labels[action]}: ${job.title}`}
                    tone={action === "stop" ? "danger" : "default"}
                    density="compact"
                    busy={busy?.id === job.id && busy.action === action}
                    disabled={!enabled || busy !== null}
                    onPress={() => (action === "stop" ? setStoppingId(job.id) : void run(job, action))}
                  />
                ))}
              </Row>
            ) : null}
            {errors[job.id] && stopping?.id !== job.id ? (
              <ErrorNotice error={errors[job.id]} />
            ) : null}
          </View>
        );
      })}
      {stopping ? (
        <Sheet
          visible
          size="compact"
          title={copy("Bu iş durdurulsun mu?", "Stop this job?")}
          onClose={() => {
            if (!busy) setStoppingId(null);
          }}
        >
          <Body>{stopping.title}</Body>
          <Body muted>
            {copy(
              "Asistan bu işi bırakır ve çalışan görevleri durdurur. Bunu geri alamazsın.",
              "The assistant abandons this job and stops its running tasks. This cannot be undone.",
            )}
          </Body>
          <FormActions
            submitLabel={copy("İşi durdur", "Stop job")}
            cancelLabel={copy("Vazgeç", "Cancel")}
            tone="danger"
            busy={busy?.id === stopping.id}
            disabled={!enabled}
            onCancel={() => setStoppingId(null)}
            onSubmit={() => void run(stopping, "stop")}
            feedback={stopError ? <ErrorNotice error={stopError} /> : undefined}
          />
        </Sheet>
      ) : null}
    </Section>
  );
}
