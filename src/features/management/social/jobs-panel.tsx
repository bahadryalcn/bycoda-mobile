import { SocialCollectionFeedback, SocialRecordFeedback } from "./action-feedback";
import { CollectionRows } from "./collection-rows";
import { ContentExcerpt } from "./content-excerpt";
import { Body, Button, ErrorText, Row } from "@/ui/primitives";
import { RecordCard } from "@/ui/record-card";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { stamp } from "../shared/format";
import { Status, statusLabel } from "../shared/status";
import { accountIdentity, recipientIdentity } from "./review-presentation";

import type { JobsPanelProps } from "./types";
import { CollectionSearch, useCollectionSearch } from "./collection-search";
import { useMobileTheme } from "@/ui/theme";

export function JobsPanel({ state, projectId, action, run, page }: JobsPanelProps) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const collection = useCollectionSearch(page ? state.jobs : state.jobs.filter((job) => !projectId || job.projectIds.includes(projectId)),
    (job) => [accountIdentity(state.accounts, job.accountId, job.provider),
      recipientIdentity([...(state.contacts ?? []), ...(state.related?.contacts ?? [])], job.accountId, job.contactId || job.payload.recipientId || ""),
      job.projectIds.join(" "), statusLabel(job.status, copy), stamp(job.scheduledAt), job.payload.text, job.error,
    ].filter(Boolean).join(" "), page);
  return <><CollectionSearch {...collection} />
      <CollectionRows page={page} beforeRows={(visible) => <SocialCollectionFeedback action={action} collection="jobs" visible={visible} />} key={projectId ?? "all"} items={page ? collection.visible : collection.visible
    .sort((a, b) => b.scheduledAt - a.scheduledAt)
    } renderItem={(job) => (
      <RecordCard key={job.id}
        title={accountIdentity(state.accounts, job.accountId, job.provider)}
        status={<Status value={job.status} />}
        metadata={stamp(job.scheduledAt)}
        preview={<Body numberOfLines={2}>{job.payload.text.replace(/\s+/g, " ").trim()}</Body>}
        details={<>
        <Body muted style={uiStyles.caption}>{copy("Projeler", "Projects")}: {job.projectIds.join(" · ")}</Body>
        <ContentExcerpt text={job.payload.text} />
        </>}
      >
        {(job.contactId || job.payload.recipientId) ? <Body muted style={uiStyles.caption}>
          {copy("Alıcı", "Recipient")}: {recipientIdentity(
            [...(state.contacts ?? []), ...(state.related?.contacts ?? [])], job.accountId,
            job.contactId || job.payload.recipientId || "",
          )}
        </Body> : null}
        <ErrorText error={job.error} />
        {job.status === "queued" || job.status === "failed" ? (
          <Row>
            {job.status === "queued" && (
              <Button
                label={copy("İptal et", "Cancel")}
                tone="quiet"
                busy={action.isPending && action.variables?.action === "jobs.cancel" && (action.variables?.input as { id?: string } | undefined)?.id === job.id}
                disabled={action.isPending}
                onPress={() => run("jobs.cancel", { id: job.id })}
              />
            )}
            {job.status === "failed" && (
              <Button
                label={copy("Tekrar dene", "Retry")}
                tone="secondary"
                busy={action.isPending && action.variables?.action === "jobs.retry" && (action.variables?.input as { id?: string } | undefined)?.id === job.id}
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
                    () => run("jobs.retry", { id: job.id }), undefined, "default",
                  )
                }
              />
            )}
          </Row>
        ) : null}
      <SocialRecordFeedback action={action} collection="jobs" id={job.id} />
          </RecordCard>
    )} /></>;
}
