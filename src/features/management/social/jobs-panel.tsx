import { CollectionRows } from "./collection-rows";
import { ContentExcerpt } from "./content-excerpt";
import { Body, Button, Card, ErrorText, Row } from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { stamp } from "../shared/format";
import { Status, statusLabel } from "../shared/status";
import { accountIdentity, recipientIdentity } from "./review-presentation";

import type { JobsPanelProps } from "./types";
import { CollectionSearch, useCollectionSearch } from "./collection-search";

export function JobsPanel({ state, projectId, action, run, page }: JobsPanelProps) {
  const copy = useCopy();
  const collection = useCollectionSearch(page ? state.jobs : state.jobs.filter((job) => !projectId || job.projectIds.includes(projectId)),
    (job) => [accountIdentity(state.accounts, job.accountId, job.provider),
      recipientIdentity([...(state.contacts ?? []), ...(state.related?.contacts ?? [])], job.accountId, job.contactId || job.payload.recipientId || ""),
      job.projectIds.join(" "), statusLabel(job.status, copy), stamp(job.scheduledAt), job.payload.text, job.error,
    ].filter(Boolean).join(" "), page);
  return <><CollectionSearch {...collection} /><CollectionRows page={page} key={projectId ?? "all"} items={page ? collection.visible : collection.visible
    .sort((a, b) => b.scheduledAt - a.scheduledAt)
    } renderItem={(job) => (
      <Card key={job.id}>
        <Body style={uiStyles.title}>{accountIdentity(state.accounts, job.accountId, job.provider)}</Body>
        {(job.contactId || job.payload.recipientId) ? <Body muted>
          {copy("Alıcı", "Recipient")}: {recipientIdentity(
            [...(state.contacts ?? []), ...(state.related?.contacts ?? [])], job.accountId,
            job.contactId || job.payload.recipientId || "",
          )}
        </Body> : null}
        <Body muted style={uiStyles.caption}>{copy("Projeler", "Projects")}: {job.projectIds.join(" · ")}</Body>
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
                    `${accountIdentity(state.accounts, job.accountId, job.provider)}\n${copy("Alıcı", "Recipient")}: ${
                      recipientIdentity([...(state.contacts ?? []), ...(state.related?.contacts ?? [])], job.accountId,
                        job.contactId || job.payload.recipientId || "—")
                    }\n${copy("Projeler", "Projects")}: ${job.projectIds.join(" · ")}\n\n${copy(
                      "Host önceki işlemin sonucunu kontrol eder; belirsiz işlemler inceleme gerektirir.",
                      "The host checks the previous result; uncertain sends require review.",
                    )}`,
                    copy("Tekrar dene", "Retry"),
                    () => run("jobs.retry", { id: job.id }),
                  )
                }
              />
            )}
          </Row>
        ) : null}
      </Card>
    )} /></>;
}
