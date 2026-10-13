export type EffectiveSocialPolicy = {
  platform: import("../../../../src/features/social/model/social").SocialPlatform;
  effective: import("../../../../src/features/social/model/social").SocialPolicy;
};

export type SocialDraftInput = {
  accountId: string;
  projectId: string;
  threadId?: string;
  contactId?: string;
  postId?: string;
  text: string;
  factIds?: string[];
};

export type SocialOAuthStatus = {
  status: string;
  candidates: { id: string; name: string }[];
  error?: string;
};

export type SocialOAuthBegin = {
  url: string;
  expiresAt: number;
};

export type {
  SocialSnapshot,
  SocialAccount,
  SocialPlatform,
  SocialPolicy,
  SocialPolicies,
  SocialThread,
  SocialDraft,
  SocialJob,
  SocialRule,
} from "../../../../src/features/social/model/social";
