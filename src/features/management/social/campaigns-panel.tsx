import { ContentExcerpt } from "./content-excerpt";
import { RecordCard } from "@/ui/record-card";
import { CollectionRows } from "./collection-rows";
import { ActionMenu, Sheet, Body, Button, NavigationGroup, Row, SelectField, Stack } from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { stamp } from "../shared/format";

import { CampaignEditor } from "./campaign-editor";
import type { CampaignsPanelProps } from "./types";
import { accountIdentity, campaignReview, captureCampaignReview, variantReviewLines } from "./review-presentation";
import { CollectionSearch, useCollectionSearch } from "./collection-search";

export function CampaignsPanel({
  state,
  projectId,
  campaignAccount,
  editor,
  closeEditor,
  dispatch,
  action,
  run,
  page,
}: CampaignsPanelProps) {
  const copy = useCopy();
  const collection = useCollectionSearch(page ? state.campaigns : state.campaigns.filter((campaign) => !projectId || campaign.projectIds.includes(projectId)),
    (campaign) => [campaign.name, ...campaign.variants.map((variant) => variant.text)].join(" "), page);
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
      <CollectionSearch {...collection} />
      <CollectionRows page={page} key={projectId ?? "all"} items={collection.visible} renderItem={(campaign) => (
          <RecordCard key={campaign.id} title={campaign.name}
            menu={<ActionMenu label={copy("Diğer işlemler", "More actions")}
              busy={action.isPending && action.variables?.action === "campaigns.pause" && (action.variables?.input as { id?: string } | undefined)?.id === campaign.id}
              actions={[{ key: "pause", label: campaign.paused ? copy("Devam et", "Resume") : copy("Duraklat", "Pause"),
                disabled: action.isPending, onPress: () => run("campaigns.pause", { id: campaign.id, paused: !campaign.paused }) }]} />}
            preview={<Body numberOfLines={2}>{campaign.variants[0]?.text}</Body>}
            metadata={campaign.variants.map((variant) => accountIdentity(state.accounts, variant.accountId)).join(" · ")}
      footer={
            <Row>
              <Button
                label={copy("İçeriği onayla", "Approve content")}
                tone="secondary"
                disabled={action.isPending}
                onPress={() => {
                  const reviewed = captureCampaignReview(campaign);
                  confirmAction(
                    copy("İçeriği onayla", "Approve content"),
                    `${copy(
                      "Bu içerik ve hedef hesaplar için gönderim onayı verilecek.",
                      "Sending approval will be recorded for this content and its target accounts.",
                    )}\n\n${campaignReview(reviewed.snapshot, state.accounts, copy, stamp)}`,
                    copy("Onayla", "Approve"),
                    () => run("campaigns.approveReviewed", reviewed.input),
                  );
                }}
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
                    `${copy(
                      "Onaylı içerik belirtilen zamanda dış platformlarda yayınlanacak. Host onaysız gönderimi engeller.",
                      "Approved content will publish externally at its scheduled time. The host rejects unapproved sending.",
                    )}\n\n${campaignReview(campaign, state.accounts, copy, stamp)}`,
                    copy("Sıraya al", "Queue"),
                    () => run("campaigns.schedule", { id: campaign.id }),
                  )
                }
              />
            </Row>
      }
            details={<>
              <Body muted style={uiStyles.caption}>{copy("Projeler", "Projects")}: {campaign.projectIds.join(" · ")} · {copy("Sürüm", "Revision")}: {campaign.revision}</Body>
              {campaign.variants.map((variant, index) => (
              <Stack key={`${variant.accountId}:${index}`}>
                <Body muted style={uiStyles.caption}>
                  {accountIdentity(state.accounts, variant.accountId)} ·{" "}
                  {stamp(variant.scheduledAt)}
                </Body>
                <ContentExcerpt text={variant.text} />
                {variant.link && <Body>{variant.link}</Body>}
                {variantReviewLines(variant, copy).map((line, detailIndex) => <Body key={detailIndex}>{line}</Body>)}
              </Stack>
            ))}</>}
          >

          </RecordCard>
        )} />
    </>
  );
}
