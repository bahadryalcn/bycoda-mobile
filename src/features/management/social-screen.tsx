import { useEditorRecord } from "./shared/use-editor-record";
import { useProjectList } from "../workspace/use-project-directory";
import { useReducer } from "react";
import {
  Body,
  Badge,
  Button,
  ContextControls,
  SelectField,
  Notice,
  QueryState,
  Row,
  Screen,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useHostMutation } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { initialSocialFlow, socialFlowReducer, type SocialTab } from "./social-flow";
import { Scope } from "./shared/scope";
import { socialRequest as request } from "./social/request";
import { AccountsPanel } from "./social/accounts-panel";
import { ThreadsPanel } from "./social/threads-panel";
import { ThreadEditor } from "./social/thread-editor";
import { DraftEditor } from "./social/draft-editor";
import { CampaignEditor } from "./social/campaign-editor";
import { RuleEditor } from "./social/rule-editor";
import { accountIdentity, recipientIdentity } from "./social/review-presentation";
import { DraftsPanel } from "./social/drafts-panel";
import { CampaignsPanel } from "./social/campaigns-panel";
import { RulesPanel } from "./social/rules-panel";
import { JobsPanel } from "./social/jobs-panel";
import { useSocialWorkspace } from "./social/use-workspace-query";
import { socialActionTarget, SocialActionFeedback } from "./social/action-feedback";

export function SocialScreen() {
  const copy = useCopy();
  const projectId = useMachines((state) => state.selectedProjectId);
  const projects = useProjectList();
  const action = useHostMutation("social.request", ["social"]);
  const [flow, dispatch] = useReducer(socialFlowReducer, initialSocialFlow);
  const { tab, editor } = flow;
  const { query, state, page, collection, missingEnvironment } = useSocialWorkspace(tab, projectId);
  const fetchedSelectedThread =
    editor.kind === "thread"
      ? state?.threads.find((thread) => thread.id === editor.id)
      : undefined;
  const selectedThread = useEditorRecord(
    editor.kind === "thread" ? editor.id : null,
    fetchedSelectedThread,
  );
  const fetchedSelectedDraft =
    editor.kind === "draft"
      ? state?.drafts.find((draft) => draft.id === editor.id)
      : undefined;
  const selectedDraft = useEditorRecord(
    editor.kind === "draft" ? editor.id : null,
    fetchedSelectedDraft,
  );
  const fetchedCampaignAccount =
    editor.kind === "campaign"
      ? state?.accounts.find((account) => account.id === editor.accountId)
      : undefined;
  const campaignAccount = useEditorRecord(
    editor.kind === "campaign" ? editor.accountId : null,
    fetchedCampaignAccount,
  );
  const fetchedRuleAccount =
    editor.kind === "rule"
      ? state?.accounts.find((account) => account.id === editor.accountId)
      : undefined;
  const ruleAccount = useEditorRecord(
    editor.kind === "rule" ? editor.accountId : null,
    fetchedRuleAccount,
  );
  const closeEditor = () => dispatch({ type: "close", editor });
  const run = (name: string, input: Record<string, unknown> = {}) =>
    action.mutate(request(name, input));
  const feedbackTarget = socialActionTarget(action.variables);
  const collectionOwnsFeedback = !!state && !!feedbackTarget && feedbackTarget.collection === collection;
  const itemCount = state ? collection ? state.pages?.[collection]?.total : state.accounts.length : undefined;
  const emptyTitles: Record<SocialTab, string> = {
    inbox: copy("Henüz konuşma yok", "No conversations yet"),
    drafts: copy("Henüz taslak yok", "No drafts yet"),
    accounts: copy("Bu bilgisayarda sosyal hesap yok", "No social accounts on this computer"),
    campaigns: copy("Henüz içerik yok", "No content yet"),
    automations: copy("Henüz yanıt kuralı yok", "No reply rules yet"),
    jobs: copy("Henüz gönderim işi yok", "No sending jobs yet"),
  };
  // Navigation only: an empty collection never grants or starts social work.
  const emptyDestination: "accounts" | "inbox" | "drafts" | undefined = !state || tab === "accounts" ? undefined
    : !state.accounts.length ? "accounts"
    : tab === "inbox" ? "accounts"
    : tab === "drafts" ? "inbox"
    : tab === "jobs" ? "drafts"
    : tab === "automations" && (!projectId || !state.accounts.some((account) => account.grants[projectId]?.includes("draft"))) ? "accounts"
    : undefined;
  const destinationLabels = {
    accounts: copy("Hesaplar", "Accounts"),
    inbox: copy("Gelen kutusu", "Inbox"),
    drafts: copy("Taslaklar", "Drafts"),
  };
  return (
    <Screen title={copy("Sosyal medya", "Social media")} query={query}
      context={<ContextControls scope={<Scope allowAll />} view={
        <SelectField
          compact
          hideLabel
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
      } />}>
      {missingEnvironment ? <Notice tone="warning" message={copy(
        "Sosyal medya geçmişini görüntülemek için bilgisayardaki bycoda’yı güncelleyin.",
        "Update bycoda on the computer to view social history.",
      )} /> : <QueryState query={query} empty={!page?.loading && !page?.search.trim() && itemCount === 0} emptyTitle={emptyTitles[tab]} />}
      {editor.kind === "closed" && !page?.loading && !page?.search.trim() && itemCount === 0 && emptyDestination && <Button tone="secondary"
        label={destinationLabels[emptyDestination]}
        onPress={() => dispatch({ type: "tab", tab: emptyDestination })} />}
      {!collectionOwnsFeedback ? <SocialActionFeedback action={action} /> : null}
      {selectedThread && (
        <Sheet visible size="form" title={copy("Konuşma", "Conversation")} onClose={closeEditor}>
          <ThreadEditor key={selectedThread.id} thread={selectedThread}
            recipientLabel={recipientIdentity([...(state?.contacts ?? []), ...(state?.related?.contacts ?? [])], selectedThread.accountId, selectedThread.contactId)}
            accounts={state?.accounts ?? []} projects={projects.data ?? []} profiles={state?.profiles ?? []}
            available={!!state} unavailableFeedback={<QueryState query={query} loading="content" />}
            onClose={closeEditor} />
        </Sheet>
      )}
      {selectedDraft && <Sheet visible size="form" title={copy("Taslağı düzenle", "Edit draft")} onClose={closeEditor}>
        <DraftEditor key={selectedDraft.id} draft={selectedDraft}
          recipientLabel={recipientIdentity([...(state?.contacts ?? []), ...(state?.related?.contacts ?? [])], selectedDraft.accountId, selectedDraft.contactId)}
          contextLabel={[accountIdentity(state?.accounts ?? [], selectedDraft.accountId), projects.data?.find(project => project.id === selectedDraft.projectId)?.name ?? selectedDraft.projectId].filter(Boolean).join(" · ")}
          thread={[...(state?.threads ?? []), ...(state?.related?.threads ?? [])].find(thread => thread.id === selectedDraft.threadId)}
          profile={state?.profiles.find(profile => profile.projectId === selectedDraft.projectId)}
          available={!!state} unavailableFeedback={<QueryState query={query} loading="content" />} onClose={closeEditor} />
      </Sheet>}
      {campaignAccount && editor.kind === "campaign" && <Sheet visible size="form" title={copy("Yeni içerik taslağı", "New content draft")} onClose={closeEditor}>
        <CampaignEditor key={editor.accountId + "/" + editor.projectId} account={campaignAccount} projectId={editor.projectId}
          projectLabel={projects.data?.find(project => project.id === editor.projectId)?.name}
          profile={state?.profiles.find(profile => profile.projectId === editor.projectId)}
          available={!!state} unavailableFeedback={<QueryState query={query} loading="content" />} onClose={closeEditor} />
      </Sheet>}
      {ruleAccount && editor.kind === "rule" && <Sheet visible size="form" title={copy("Yeni yanıt kuralı", "New reply rule")} onClose={closeEditor}>
        <RuleEditor key={editor.accountId + "/" + editor.projectId} account={ruleAccount} projectId={editor.projectId}
          projectLabel={projects.data?.find(project => project.id === editor.projectId)?.name}
          profile={state?.profiles.find(profile => profile.projectId === editor.projectId)}
          available={!!state} unavailableFeedback={<QueryState query={query} loading="content" />} onClose={closeEditor} />
      </Sheet>}
      {state && (
        <>
          <Row>
            <Badge
              label={
                state.hostOnline
                  ? copy("Bilgisayar çevrimiçi", "Computer online")
                  : copy("Bilgisayar çevrimdışı", "Computer offline")
              }
              tone={state.hostOnline ? "default" : "warning"}
            />
            {state.stopped ? (
              <Badge label={copy("Gönderim durduruldu", "Sending stopped")} tone="warning" />
            ) : null}
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
              page={page}
              state={state}
              projectId={projectId}
              projects={projects.data ?? []}
              dispatch={dispatch}
            />
          )}
          {tab === "drafts" && (
            <DraftsPanel
              page={page}
              state={state}
              projectId={projectId}
              dispatch={dispatch}
              action={action}
              run={run}
            />
          )}
          {tab === "campaigns" && (
            <CampaignsPanel
              page={page}
              state={state}
              projectId={projectId}
              dispatch={dispatch}
              action={action}
              run={run}
            />
          )}
          {tab === "automations" && (
            <RulesPanel
              page={page}
              state={state}
              projectId={projectId}
              dispatch={dispatch}
              action={action}
              run={run}
            />
          )}
          {tab === "jobs" && (
            <JobsPanel page={page} state={state} projectId={projectId} action={action} run={run} />
          )}
        </>
      )}
    </Screen>
  );
}
