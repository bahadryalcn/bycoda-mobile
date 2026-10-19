import { ContentExcerpt } from "./content-excerpt";
import { RecordCard } from "@/ui/record-card";
import { PagedRows } from "../shared/paged-rows";
import { Sheet, Body, Button, NavigationGroup, Row, SelectField, Stack } from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { stamp } from "../shared/format";

import { CampaignEditor } from "./campaign-editor";
import type { CampaignsPanelProps } from "./types";

export function CampaignsPanel({
  state,
  projectId,
  campaignAccount,
  editor,
  closeEditor,
  dispatch,
  action,
  run,
}: CampaignsPanelProps) {
  const copy = useCopy();
  return (
    <>
      {projectId && (
        <NavigationGroup>
          <SelectField
            variant="row"
            label={copy("Yeni içerik taslağı", "New content draft")}
            value={undefined}
            placeholder={copy("Hesap seçin", "Choose an account")}
            options={state.accounts.filter((account) => account.platform !== "youtube" && account.grants[projectId]?.includes("draft")).map((account) => ({ value: account.id, label: account.name }))}
            onChange={(accountId) => dispatch({ type: "open", editor: { kind: "campaign", accountId, projectId } })}
          />
        </NavigationGroup>
      )}
      {campaignAccount && editor.kind === "campaign" && (
        <Sheet visible size="form" title={copy("Yeni içerik taslağı", "New content draft")} onClose={closeEditor}>
        <CampaignEditor
          key={editor.accountId + "/" + editor.projectId}
          account={campaignAccount}
          projectId={editor.projectId}
          profile={state.profiles.find((profile) => profile.projectId === editor.projectId)}
          onClose={closeEditor}
        />
        </Sheet>
      )}
      <PagedRows key={projectId ?? "all"} items={state.campaigns
        .filter((campaign) => !projectId || campaign.projectIds.includes(projectId))} renderItem={(campaign) => (
          <RecordCard key={campaign.id} title={campaign.name}
            preview={<Body numberOfLines={2}>{campaign.variants[0]?.text}</Body>}
            metadata={campaign.variants.map((variant) => state.accounts.find((account) => account.id === variant.accountId)?.name ?? variant.accountId).join(" · ")}
      footer={
            <Row>
              <Button
                label={copy("İçeriği onayla", "Approve content")}
                tone="secondary"
                disabled={action.isPending}
                onPress={() =>
                  confirmAction(
                    copy("İçeriği onayla", "Approve content"),
                    copy(
                      "Bu içerik ve hedef hesaplar için gönderim onayı verilecek.",
                      "Sending approval will be recorded for this content and its target accounts.",
                    ),
                    copy("Onayla", "Approve"),
                    () => run("campaigns.approve", { id: campaign.id }),
                  )
                }
              />
              <Button
                label={copy("Gönderimi sıraya al", "Queue publishing")}
                tone="primary"
                disabled={
                  action.isPending || !state.sendingEnabled || state.stopped || campaign.paused
                }
                onPress={() =>
                  confirmAction(
                    copy("Gönderimi sıraya al", "Queue publishing"),
                    copy(
                      "Onaylı içerik belirtilen zamanda dış platformlarda yayınlanacak. Host onaysız gönderimi engeller.",
                      "Approved content will publish externally at its scheduled time. The host rejects unapproved sending.",
                    ),
                    copy("Sıraya al", "Queue"),
                    () => run("campaigns.schedule", { id: campaign.id }),
                  )
                }
              />
              <Button
                label={campaign.paused ? copy("Devam et", "Resume") : copy("Duraklat", "Pause")}
                tone="quiet"
                disabled={action.isPending}
                onPress={() =>
                  run("campaigns.pause", { id: campaign.id, paused: !campaign.paused })
                }
              />
            </Row>
      }
            details={<>{campaign.variants.map((variant) => (
              <Stack key={variant.accountId}>
                <Body muted style={uiStyles.caption}>
                  {state.accounts.find((account) => account.id === variant.accountId)?.name} ·{" "}
                  {stamp(variant.scheduledAt)}
                </Body>
                <ContentExcerpt text={variant.text} />
                {variant.link && <Body>{variant.link}</Body>}
              </Stack>
            ))}</>}
          >

          </RecordCard>
        )} />
    </>
  );
}
