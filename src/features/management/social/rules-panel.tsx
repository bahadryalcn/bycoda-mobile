import { socialLabel } from "./labels";
import { RecordCard } from "@/ui/record-card";
import { PagedRows } from "../shared/paged-rows";
import { NavigationGroup, SelectField, Sheet, Body, Button, Row } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";

import { RuleEditor } from "./rule-editor";
import type { RulesPanelProps } from "./types";

export function RulesPanel({
  state,
  projectId,
  ruleAccount,
  editor,
  closeEditor,
  dispatch,
  action,
  run,
}: RulesPanelProps) {
  const copy = useCopy();
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
      {ruleAccount && editor.kind === "rule" && (
        <Sheet visible size="form" title={copy("Yeni yanıt kuralı", "New reply rule")} onClose={closeEditor}>
        <RuleEditor
          key={editor.accountId + "/" + editor.projectId}
          account={ruleAccount}
          projectId={editor.projectId}
          profile={state.profiles.find((profile) => profile.projectId === editor.projectId)}
          onClose={closeEditor}
        />
        </Sheet>
      )}
      <PagedRows key={projectId ?? "all"} items={state.rules
        .filter((rule) => !projectId || rule.projectId === projectId)} renderItem={(rule) => (
          <RecordCard key={rule.id} title={rule.name}
            metadata={`${socialLabel(rule.mode, copy)} · ${socialLabel(rule.trigger, copy)} · ${rule.dailyLimit} ${copy("/ gün", "/ day")}`}
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
                        rule.mode === "automatic"
                          ? copy(
                              "Bu kural, izinli alıcılara sizin her seferinde onayınızı almadan dışarıya yanıt gönderebilir.",
                              "This rule may send external replies to eligible recipients without approval for each reply.",
                            )
                          : copy(
                              "Kural gelen içerikten taslak hazırlayacak; gönderim ayrı onay gerektirir.",
                              "The rule will prepare drafts from incoming content; sending needs separate approval.",
                            ),
                        copy("Etkinleştir", "Activate"),
                        () =>
                          run("automations.activate", {
                            id: rule.id,
                            ...(rule.mode === "automatic"
                              ? { confirm: "ENABLE_AUTOMATIC_REPLIES" }
                              : {}),
                          }),
                      )
                }
              />
            </Row>
      }
            details={<Body>{rule.topics.join(", ")}</Body>}
          >
            {rule.pausedReason && <Body>{rule.pausedReason}</Body>}

          </RecordCard>
        )} />
    </>
  );
}
