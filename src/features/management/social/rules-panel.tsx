import { SocialCollectionFeedback, SocialRecordFeedback } from "./action-feedback";
import { socialLabel } from "./labels";
import { RecordCard } from "@/ui/record-card";
import { CollectionRows } from "./collection-rows";
import { Badge, NavigationGroup, SelectField, Body, Button, Row } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";

import type { RulesPanelProps } from "./types";
import { accountIdentity } from "./review-presentation";
import { CollectionSearch, useCollectionSearch } from "./collection-search";

export function RulesPanel({
  state,
  projectId,
  dispatch,
  action,
  run,
  page,
}: RulesPanelProps) {
  const copy = useCopy();
  const collection = useCollectionSearch(page ? state.rules : state.rules.filter((rule) => !projectId || rule.projectId === projectId),
    (rule) => [rule.name, accountIdentity(state.accounts, rule.accountId), rule.projectId,
      socialLabel(rule.mode, copy), socialLabel(rule.trigger, copy), `${rule.dailyLimit} ${copy("/ gün", "/ day")}`,
      rule.topics.join(" "), rule.pausedReason,
    ].filter(Boolean).join(" "), page);
  return (
    <>
      {projectId && (
        <NavigationGroup>
          <SelectField
            variant="row"
            label={copy("Yeni yanıt kuralı", "New reply rule")}
            value={undefined}
            placeholder={copy("Hesap seçin", "Choose an account")}
            options={state.accounts.filter((account) => account.grants[projectId]?.includes("draft")).map((account) => ({ value: account.id, label: account.name }))}
            onChange={(accountId) => dispatch({ type: "open", editor: { kind: "rule", accountId, projectId } })}
          />
        </NavigationGroup>
      )}
      <CollectionSearch {...collection} />

      <CollectionRows page={page} beforeRows={(visible) => <SocialCollectionFeedback action={action} collection="rules" visible={visible} />} key={projectId ?? "all"} items={collection.visible} renderItem={(rule) => (
          <RecordCard key={rule.id} title={rule.name}
            status={<Badge label={rule.enabled ? copy("Etkin", "Active") : copy("Duraklatıldı", "Paused")} tone={rule.enabled ? "success" : "warning"} />}
            metadata={`${accountIdentity(state.accounts, rule.accountId)} · ${socialLabel(rule.mode, copy)} · ${socialLabel(rule.trigger, copy)} · ${rule.dailyLimit} ${copy("/ gün", "/ day")}`}
      footer={
            <Row>
              <Button
                label={rule.enabled ? copy("Duraklat", "Pause") : copy("Etkinleştir", "Activate")}
                tone={rule.enabled ? "quiet" : "secondary"}
                disabled={action.isPending}
                onPress={() =>
                  rule.enabled
                    ? run("automations.pause", { id: rule.id })
                    : confirmAction(
                        copy("Kuralı etkinleştir", "Activate rule"),
                        `${rule.name}\n${accountIdentity(state.accounts, rule.accountId)}\n${copy("Proje", "Project")}: ${rule.projectId}\n\n${rule.mode === "automatic"
                          ? copy(
                              "Bu kural, izinli alıcılara sizin her seferinde onayınızı almadan dışarıya yanıt gönderebilir.",
                              "This rule may send external replies to eligible recipients without approval for each reply.",
                            )
                          : copy(
                              "Kural gelen içerikten taslak hazırlayacak; gönderim ayrı onay gerektirir.",
                              "The rule will prepare drafts from incoming content; sending needs separate approval.",
                            )}`,
                        copy("Etkinleştir", "Activate"),
                        () =>
                          run("automations.activate", {
                            id: rule.id,
                            ...(rule.mode === "automatic"
                              ? { confirm: "ENABLE_AUTOMATIC_REPLIES" }
                              : {}),
                          }), undefined, "default",
                      )
                }
              />
            </Row>
      }
            details={<>
              <Body muted>{`${copy("Proje", "Project")}: ${rule.projectId}`}</Body>
              {rule.topics.length ? <Body>{rule.topics.join(", ")}</Body> : null}
            </>}
          >
            {rule.pausedReason && <Body>{rule.pausedReason}</Body>}

          <SocialRecordFeedback action={action} collection="rules" id={rule.id} />
          </RecordCard>
        )} />
    </>
  );
}
