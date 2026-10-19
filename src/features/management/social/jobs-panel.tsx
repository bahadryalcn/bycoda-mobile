import { PagedRows } from "../shared/paged-rows";
import { ContentExcerpt } from "./content-excerpt";
import { Body, Button, Card, ErrorText, Row } from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
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
          <Body muted style={[uiStyles.caption, uiStyles.grow]}>{stamp(job.scheduledAt)}</Body>
        </Row>
        <ContentExcerpt text={job.payload.text} />
        <ErrorText error={job.error} />
        {job.status === "queued" || job.status === "failed" ? (
          <Row>
            {job.status === "queued" && (
              <Button
                label={copy("İptal et", "Cancel")}
                tone="quiet"
                disabled={action.isPending}
                onPress={() => run("jobs.cancel", { id: job.id })}
              />
            )}
            {job.status === "failed" && (
              <Button
                label={copy("Tekrar dene", "Retry")}
                tone="secondary"
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
        ) : null}
      </Card>
    )} />;
}
