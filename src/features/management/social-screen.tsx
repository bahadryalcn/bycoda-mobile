import { useEditorRecord } from "./shared/use-editor-record";
import { useProjectList } from "../workspace/use-project-directory";
import { useReducer } from "react";
import {
  Body,
  Button,
  SelectField,
  MutationState,
  Notice,
  QueryState,
  Row,
  Screen,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useMachines } from "@/state/machines";
import type { SocialSnapshot } from "@/domain/types";
import { initialSocialFlow, socialFlowReducer, type SocialTab } from "./social-flow";
import { Scope } from "./shared/scope";
import { Status } from "./shared/status";
import { socialRequest as request } from "./social/request";
import { AccountsPanel } from "./social/accounts-panel";
import { ThreadsPanel } from "./social/threads-panel";
import { DraftsPanel } from "./social/drafts-panel";
import { CampaignsPanel } from "./social/campaigns-panel";
import { RulesPanel } from "./social/rules-panel";
import { JobsPanel } from "./social/jobs-panel";

export function SocialScreen() {
  const copy = useCopy();
  const projectId = useMachines((state) => state.selectedProjectId);
  const query = useHostQuery<SocialSnapshot>(
    ["social"],
    "social.request",
    { action: "snapshot", input: {} },
    { interval: 8000 },
  );
  const projects = useProjectList();
  const action = useHostMutation("social.request", ["social"]);
  const [flow, dispatch] = useReducer(socialFlowReducer, initialSocialFlow);
  const { tab, editor } = flow;
  const fetchedSelectedThread =
    editor.kind === "thread"
      ? query.data?.threads.find((thread) => thread.id === editor.id)
      : undefined;
  const selectedThread = useEditorRecord(editor.kind === "thread" ? editor.id : null, fetchedSelectedThread);
  const fetchedSelectedDraft =
    editor.kind === "draft"
      ? query.data?.drafts.find((draft) => draft.id === editor.id)
      : undefined;
  const selectedDraft = useEditorRecord(editor.kind === "draft" ? editor.id : null, fetchedSelectedDraft);
  const fetchedCampaignAccount =
    editor.kind === "campaign"
      ? query.data?.accounts.find((account) => account.id === editor.accountId)
      : undefined;
  const campaignAccount = useEditorRecord(editor.kind === "campaign" ? editor.accountId : null, fetchedCampaignAccount);
  const fetchedRuleAccount =
    editor.kind === "rule"
      ? query.data?.accounts.find((account) => account.id === editor.accountId)
      : undefined;
  const ruleAccount = useEditorRecord(editor.kind === "rule" ? editor.accountId : null, fetchedRuleAccount);
  const closeEditor = () => dispatch({ type: "close", editor });
  const run = (name: string, input: Record<string, unknown> = {}) =>
    action.mutate(request(name, input));
  const state = query.data;
  const itemCount = state
    ? {
        inbox: state.threads.filter((value) => !projectId || value.projectId === projectId).length,
        drafts: state.drafts.filter((value) => !projectId || value.projectId === projectId).length,
        accounts: state.accounts.length,
        campaigns: state.campaigns.filter(
          (value) => !projectId || value.projectIds.includes(projectId),
        ).length,
        automations: state.rules.filter((value) => !projectId || value.projectId === projectId)
          .length,
        jobs: state.jobs.filter((value) => !projectId || value.projectIds.includes(projectId))
          .length,
      }[tab]
    : undefined;
  const emptyTitles: Record<SocialTab, string> = {
    inbox: copy("Henüz konuşma yok", "No conversations yet"),
    drafts: copy("Henüz taslak yok", "No drafts yet"),
    accounts: copy("Bu bilgisayarda sosyal hesap yok", "No social accounts on this computer"),
    campaigns: copy("Henüz içerik yok", "No content yet"),
    automations: copy("Henüz yanıt kuralı yok", "No reply rules yet"),
    jobs: copy("Henüz gönderim işi yok", "No sending jobs yet"),
  };
  return (
    <Screen title={copy("Sosyal medya", "Social media")} query={query}>
      <Scope allowAll />
      <SelectField
        label={copy("Görünüm", "View")}
        value={tab}
        options={[
          { value: "inbox", label: copy("Gelen kutusu", "Inbox") },
          { value: "drafts", label: copy("Taslaklar", "Drafts") },
          { value: "accounts", label: copy("Hesaplar", "Accounts") },
          { value: "campaigns", label: copy("İçerikler", "Content") },
          { value: "automations", label: copy("Kurallar", "Rules") },
          { value: "jobs", label: copy("Gönderim geçmişi", "Sending history") },
        ]}
        onChange={(tab) => dispatch({ type: "tab", tab })}
      />
      <QueryState query={query} empty={itemCount === 0} emptyTitle={emptyTitles[tab]} />
      <MutationState mutation={action} />
      {state && (
        <>
          <Row>
            <Status value={state.stopped ? "blocked" : state.hostOnline ? "running" : "blocked"} />
            <Body muted>
              {state.sendingEnabled
                ? copy("Gönderimler yetkili", "Sending authorized")
                : copy("Gönderimler kapalı", "Sending disabled")}
            </Body>
          </Row>
          {editor.kind !== "closed" &&
            !selectedThread &&
            !selectedDraft &&
            !campaignAccount &&
            !ruleAccount && (
              <Notice
                tone="warning"
                message={copy(
                  "Düzenlenen kayıt artık bulunamadı.",
                  "The edited record is no longer available.",
                )}
              >
                <Button label={copy("Kapat", "Close")} onPress={closeEditor} />
              </Notice>
            )}
          {tab === "accounts" && (
            <AccountsPanel state={state} projectId={projectId} action={action} run={run} />
          )}
          {tab === "inbox" && (
            <ThreadsPanel
              state={state}
              projectId={projectId}
              selectedThread={selectedThread}
              projects={projects.data ?? []}
              closeEditor={closeEditor}
              dispatch={dispatch}
            />
          )}
          {tab === "drafts" && (
            <DraftsPanel
              state={state}
              projectId={projectId}
              selectedDraft={selectedDraft}
              closeEditor={closeEditor}
              dispatch={dispatch}
              action={action}
              run={run}
            />
          )}
          {tab === "campaigns" && (
            <CampaignsPanel
              state={state}
              projectId={projectId}
              campaignAccount={campaignAccount}
              editor={editor}
              closeEditor={closeEditor}
              dispatch={dispatch}
              action={action}
              run={run}
            />
          )}
          {tab === "automations" && (
            <RulesPanel
              state={state}
              projectId={projectId}
              ruleAccount={ruleAccount}
              editor={editor}
              closeEditor={closeEditor}
              dispatch={dispatch}
              action={action}
              run={run}
            />
          )}
          {tab === "jobs" && (
            <JobsPanel state={state} projectId={projectId} action={action} run={run} />
          )}
        </>
      )}
    </Screen>
  );
}
