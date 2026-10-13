import type { Dispatch } from "react";
import type { useHostMutation } from "@/state/queries";
import type {
  HostProject,
  SocialAccount,
  SocialPolicy,
  SocialSnapshot,
  SocialThread,
} from "@/domain/types";
import type { SocialEditor, SocialFlowEvent } from "../social-flow";
import type { EffectiveSocialPolicy, SocialOAuthStatus } from "@/remote/types";
export type SocialDraft = SocialSnapshot["drafts"][number];
export type SocialProfile = SocialSnapshot["profiles"][number];
export type EffectivePolicy = EffectiveSocialPolicy;
export type PolicyInfoProps = { policy?: SocialPolicy };
export type FactChoicesProps = {
  profile?: SocialProfile;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};
export type ThreadEditorProps = {
  thread: SocialThread;
  accounts: SocialAccount[];
  projects: HostProject[];
  profiles: SocialProfile[];
  onClose: () => void;
};
export type DraftEditorProps = {
  draft: SocialDraft;
  thread?: SocialThread;
  profile?: SocialProfile;
  onClose: () => void;
};
export type CampaignEditorProps = {
  account: SocialAccount;
  projectId: string;
  profile?: SocialProfile;
  onClose: () => void;
};
export type RuleEditorProps = CampaignEditorProps;
export type AccountFormProps = { projectId: string | null; onClose: () => void };
export type AccountCardProps = {
  account: SocialAccount;
  state: SocialSnapshot;
  projectId: string | null;
};
export type OAuthStatus = SocialOAuthStatus;
export type AccountDraft = { name: string; platform: SocialAccount["platform"] };
export type ReplyFormDraft = { text: string; facts: string[] };
export type CampaignFormDraft = {
  name: string;
  text: string;
  link: string;
  when: string;
  facts: string[];
};
export type RuleFormDraft = {
  name: string;
  keyword: string;
  factId: string;
  mode: SocialSnapshot["rules"][number]["mode"];
  trigger: SocialSnapshot["rules"][number]["trigger"];
  dailyLimit: string;
};
export type SocialPanelContext = {
  state: SocialSnapshot;
  projectId: string | null;
  editor: SocialEditor;
  projects: HostProject[];
  selectedThread?: SocialThread;
  selectedDraft?: SocialDraft;
  campaignAccount?: SocialAccount;
  ruleAccount?: SocialAccount;
  closeEditor: () => void;
  dispatch: Dispatch<SocialFlowEvent>;
  action: ReturnType<typeof useHostMutation>;
  run: (name: string, input?: Record<string, unknown>) => void;
};
export type AccountsPanelProps = Pick<SocialPanelContext, "state" | "projectId" | "action" | "run">;
export type ThreadsPanelProps = Pick<
  SocialPanelContext,
  "state" | "projectId" | "selectedThread" | "projects" | "closeEditor" | "dispatch"
>;
export type DraftsPanelProps = Pick<
  SocialPanelContext,
  "state" | "projectId" | "selectedDraft" | "closeEditor" | "dispatch" | "action" | "run"
>;
export type CampaignsPanelProps = Pick<
  SocialPanelContext,
  | "state"
  | "projectId"
  | "campaignAccount"
  | "editor"
  | "closeEditor"
  | "dispatch"
  | "action"
  | "run"
>;
export type RulesPanelProps = Pick<
  SocialPanelContext,
  "state" | "projectId" | "ruleAccount" | "editor" | "closeEditor" | "dispatch" | "action" | "run"
>;
export type JobsPanelProps = Pick<SocialPanelContext, "state" | "projectId" | "action" | "run">;
