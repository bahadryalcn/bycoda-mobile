import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useCopy } from "@/ui/copy";
import { ActionMenu, Badge, Body, Button, ErrorNotice, FormActions, Row, SectionHeader, Separator, Sheet, StatusText } from "@/ui/primitives";
import { metrics, space } from "@/ui/tokens";
import type {
  AssistantJob,
  AssistantJobHoldReason,
} from "../../../../src/shared/model/host-contracts/assistant";
import type { AssistantJobAction, AssistantMobileClient } from "./assistant-client";
import { jobActions, jobHold, jobHoldCopy, jobStatusCopy } from "./assistant-jobs";

const MAX_JOBS = 20;

/** Jobs the assistant can still stop: the ones "Stop all jobs" would end. */
export const unfinishedJobs = (jobs: readonly AssistantJob[]) => jobs.filter((job) => jobActions(job).includes("stop"));
const jobsSignature = (jobs: readonly AssistantJob[]) => JSON.stringify(jobs.map((job) => [job.id, job.status]));

/**
 * Pause, resume and stop. Each control owns its pending and error state; the Host version
 * check means a lost reply can only conflict on a later tap, never act twice.
 * "Stop all jobs" is the Host's pause of the whole assistant: it stops every unfinished job and keeps
 * the assistant paused until "Resume" here (or on the desktop).
 */
export function AssistantJobsSection({
  client,
  jobs,
  paused = false,
  holds,
  current,
  enabled,
  onChanged,
}: {
  client: AssistantMobileClient;
  jobs: AssistantJob[];
  /** The Host's assistant-wide pause (`snapshot.paused`). */
  paused?: boolean;
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
  const [visibleCount, setVisibleCount] = useState(MAX_JOBS);
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
  // Stop all reviews the exact list it names; when that list changes under it, the review retires.
  const unfinished = unfinishedJobs(jobs);
  const signature = jobsSignature(unfinished);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [allBusy, setAllBusy] = useState<"stop" | "resume" | null>(null);
  const [allError, setAllError] = useState<{ kind: "stop" | "resume"; error: unknown } | null>(null);
  useEffect(() => {
    if (reviewing !== null && !allBusy && (reviewing !== signature || !unfinished.length)) setReviewing(null);
  }, [reviewing, signature, allBusy, unfinished.length]);
  const runAll = async (kind: "stop" | "resume") => {
    if (pending.current || !current() || !enabled) return;
    pending.current = true;
    setAllBusy(kind);
    setAllError(null);
    try {
      if (kind === "stop") await client.pauseAll();
      else await client.resumeAll();
      if (current()) setReviewing(null);
    } catch (error) {
      if (current()) setAllError({ kind, error });
    } finally {
      pending.current = false;
      if (current()) setAllBusy(null);
      await onChanged().catch(() => {});
    }
  };
  if (!jobs.length && !paused) return null;
  const labels: Record<AssistantJobAction, string> = {
    pause: copy("Duraklat", "Pause"),
    resume: copy("Devam ettir", "Resume"),
    stop: copy("Durdur", "Stop"),
  };
  const stopError = stopping ? errors[stopping.id] : undefined;
  const visibleJobs = jobs.slice(0, visibleCount);
  return (
    <View style={{ gap: space.sm }}>
      {/* Stopping every job is a section command: it lives in the header's menu, not as a standing red button. */}
      <SectionHeader title={copy("İşler", "Jobs")} count={jobs.length || undefined} trailing={unfinished.length ? (
        <ActionMenu label={copy("İş işlemleri", "Job actions")} actions={[{
          key: "stop-all",
          label: copy("Tüm işleri durdur ({p0})", "Stop all jobs ({p0})", { p0: unfinished.length }),
          destructive: true,
          reviewed: true,
          disabled: !enabled || busy !== null || allBusy !== null,
          onPress: () => { setAllError(null); setReviewing(signature); },
        }]} />
      ) : undefined} />
      {paused ? (
        <Row>
          <StatusText label={copy("Asistan duraklatıldı", "Assistant paused")} tone="warning" />
          <Button
            label={copy("Devam ettir", "Resume")}
            density="compact"
            busy={allBusy === "resume"}
            disabled={!enabled || busy !== null || allBusy !== null}
            onPress={() => void runAll("resume")}
          />
        </Row>
      ) : null}
      {allError?.kind === "resume" ? <ErrorNotice error={allError.error} /> : null}
      {jobs.length > MAX_JOBS ? <Body muted>{copy("{p0}/{p1} iş gösteriliyor", "Showing {p0} of {p1} jobs", { p0: visibleJobs.length, p1: jobs.length })}</Body> : null}
      {visibleJobs.map((job) => {
        const hold = jobHold(job, holds);
        const actions = jobActions(job);
        // One row per job: title and status, its commands behind the row's "…" menu.
        return (
          <View key={job.id} style={{ gap: space.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: metrics.rowHeightSession, paddingVertical: space.xs }}>
            <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
            <Body>{job.title}</Body>
            <Row>
              {/* A failed, stalled or waiting job needs the owner and is a badge; any other state is quiet text. */}
              {job.status === "failed" || job.status === "stalled" || job.status === "waiting" ? (
                <Badge label={copy(...jobStatusCopy(job.status))} tone={job.status === "failed" ? "danger" : "warning"} />
              ) : (
                <StatusText label={copy(...jobStatusCopy(job.status))} tone={job.status === "running" ? "live" : "default"} />
              )}
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
            </View>
            {actions.length ? (
              <ActionMenu
                label={copy("İş işlemleri", "Job actions")}
                subtitle={job.title}
                busy={busy?.id === job.id}
                actions={actions.map((action) => ({
                  key: action,
                  label: labels[action],
                  destructive: action === "stop",
                  reviewed: action === "stop",
                  disabled: !enabled || busy !== null,
                  onPress: () => (action === "stop" ? setStoppingId(job.id) : void run(job, action)),
                }))}
              />
            ) : null}
            </View>
            {errors[job.id] && stopping?.id !== job.id ? (
              <ErrorNotice error={errors[job.id]} />
            ) : null}
            <Separator />
          </View>
        );
      })}
      {visibleJobs.length < jobs.length ? <Button label={copy("Daha fazla iş göster", "Show more jobs")} tone="quiet" onPress={() => setVisibleCount((count) => count + MAX_JOBS)} /> : null}
      {/* A partly failed stop changes the list and retires the review; its error stays here. */}
      {allError?.kind === "stop" && reviewing === null ? <ErrorNotice error={allError.error} /> : null}
      {reviewing !== null ? (
        <Sheet
          visible
          size="compact"
          title={copy("Tüm işler durdurulsun mu?", "Stop all jobs?")}
          onClose={() => {
            if (!allBusy) setReviewing(null);
          }}
        >
          <Body muted>
            {copy(
              "Asistan bu işleri bırakır, çalışan görevlerini durdurur ve sen devam ettirene kadar duraklatılmış kalır. Durdurulan işler geri alınamaz.",
              "The assistant abandons these jobs, stops their running tasks and stays paused until you resume it. Stopped jobs cannot be undone.",
            )}
          </Body>
          {unfinished.map((job) => (
            <View key={job.id} style={{ gap: space.xxs }}>
              <Body>{job.title}</Body>
              <StatusText label={copy(...jobStatusCopy(job.status))} tone={job.status === "running" ? "live" : "default"} />
            </View>
          ))}
          <FormActions
            submitLabel={copy("Tümünü durdur", "Stop all")}
            cancelLabel={copy("Vazgeç", "Cancel")}
            tone="danger"
            busy={allBusy === "stop"}
            disabled={!enabled}
            onCancel={() => setReviewing(null)}
            onSubmit={() => void runAll("stop")}
            feedback={allError?.kind === "stop" ? <ErrorNotice error={allError.error} /> : undefined}
          />
        </Sheet>
      ) : null}
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
    </View>
  );
}
