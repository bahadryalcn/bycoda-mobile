import { PagedRows } from "../shared/paged-rows";
import { ContentExcerpt } from "./content-excerpt";
import { Body, Button, Card, ErrorText, Row } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { stamp } from "../shared/format";
import { Status } from "../shared/status";

import type { JobsPanelProps } from "./types";

export function JobsPanel({ state, projectId, action, run }: JobsPanelProps) {
  const copy = useCopy();
  return <PagedRows key={projectId ?? "all"} items={state.jobs
    .filter((job) => !projectId || job.projectIds.includes(projectId))
    .sort((a, b) => b.scheduledAt - a.scheduledAt)
    } renderItem={(job) => (
      <Card key={job.id}>
        <Row>
          <Status value={job.status} />
          <Body muted>{stamp(job.scheduledAt)}</Body>
        </Row>
        <ContentExcerpt text={job.payload.text} />
        <ErrorText error={job.error} />
        <Row>
          {job.status === "queued" && (
            <Button
              label={copy("İptal et", "Cancel")}
              disabled={action.isPending}
              onPress={() => run("jobs.cancel", { id: job.id })}
            />
          )}
          {job.status === "failed" && (
            <Button
              label={copy("Tekrar dene", "Retry")}
              disabled={action.isPending}
              onPress={() =>
                confirmAction(
                  copy("Gönderimi tekrar dene", "Retry send"),
                  copy(
                    "Host önceki işlemin sonucunu kontrol eder; belirsiz işlemler inceleme gerektirir.",
                    "The host checks the previous result; uncertain sends require review.",
                  ),
                  copy("Tekrar dene", "Retry"),
                  () => run("jobs.retry", { id: job.id }),
                )
              }
            />
          )}
        </Row>
      </Card>
    )} />;
}
