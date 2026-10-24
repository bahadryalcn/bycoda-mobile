import { parseSocialPolicies, SOCIAL_LIMIT_FIELDS } from "../../../../../src/features/social/model/socialPolicy";
import type { SocialPolicies, SocialPlatform, SocialPolicy } from "../../../../../src/features/social/model/social";

export type PolicyScope = "global" | SocialPlatform;
export type PolicyDraft = { provider: string; model: string; limits: Record<(typeof SOCIAL_LIMIT_FIELDS)[number], string> };
export { parseSocialPolicies as readPolicies, SOCIAL_LIMIT_FIELDS };

export function policyDraft(value: SocialPolicy): PolicyDraft {
  return { provider: value.agent?.provider ?? "", model: value.agent?.model ?? "",
    limits: Object.fromEntries(SOCIAL_LIMIT_FIELDS.map((key) => [key, String(value[key] ?? "")])) as PolicyDraft["limits"] };
}

export function reviewedPolicies(base: SocialPolicies, scope: PolicyScope, draft: PolicyDraft): SocialPolicies {
  const value: Record<string, unknown> = {};
  if (draft.provider) value.agent = { provider: draft.provider, ...(draft.model.trim() ? { model: draft.model.trim() } : {}) };
  else if (draft.model.trim()) throw new Error("Choose an agent before entering a model.");
  for (const key of SOCIAL_LIMIT_FIELDS) {
    const text = draft.limits[key].trim();
    if (text && !/^\d+$/.test(text)) throw new Error("Character limits must be whole numbers between 1 and 20000; omit to inherit.");
    if (text) value[key] = Number(text);
  }
  const policies = scope === "global" ? { ...base, global: value } : { ...base, platforms: { ...base.platforms, [scope]: value } };
  return parseSocialPolicies(policies);
}
