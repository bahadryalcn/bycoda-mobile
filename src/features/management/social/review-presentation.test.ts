import { describe, expect, it } from "vitest";
import type { SocialAccount, SocialSnapshot } from "@/domain/types";
import { accountIdentity, campaignApprovalError, campaignReview, captureCampaignReview, recipientIdentity, threadRowPresentation, variantReviewLines } from "./review-presentation";

const copy = (_tr: string, en: string) => en;
const accounts = [
  { id: "store-x", name: "Store support", platform: "x" },
  { id: "store-wa", name: "Store support", platform: "whatsapp" },
] as SocialAccount[];

describe("social target review", () => {
  it("separates a friendly correspondent, latest message and scope without losing the recipient identifier", () => {
    const thread = { accountId: "store-wa", contactId: "internal-42", projectId: "p-1", lastInboundAt: 123,
      events: [{ direction: "inbound", text: "Customer question", at: 123 }, { direction: "outbound", text: "Latest reply", at: 200 }],
    } as SocialSnapshot["threads"][number];
    const contacts = [
      { id: "internal-42", accountId: "store-x", name: "Wrong person" },
      { id: "internal-42", accountId: "store-wa", name: "Deniz" },
    ] as SocialSnapshot["contacts"];
    const row = threadRowPresentation(thread, accounts, contacts, [{ id: "p-1", name: "Store website", cwd: "/synthetic/store" }], (time) => `at ${time}`);
    expect(row.title).toBe("Deniz");
    expect(row.latestMessage).toBe("Latest reply");
    expect(row.metadata).toBe("Store support · WhatsApp · Store website · at 200");
    expect(row.accessibleLabel).toContain("Deniz · internal-42");
    expect(threadRowPresentation(thread, accounts, [], [], String).title).toBe("internal-42");
  });
  it("captures the displayed revision and full preview before confirmation can yield", () => {
    const campaign = { id: "content", revision: 4, name: "Launch", projectIds: ["p-1"], paused: false, createdAt: 1,
      variants: [{ accountId: "store-x", text: "Reviewed text", scheduledAt: 123, factIds: [], media: [] }] } satisfies SocialSnapshot["campaigns"][number];
    const reviewed = captureCampaignReview(campaign);
    campaign.revision = 5;
    campaign.variants[0]!.text = "Changed after confirmation opened";
    expect(reviewed.input).toEqual({ id: "content", expectedRevision: 4 });
    expect(reviewed.snapshot.variants[0]!.text).toBe("Reviewed text");
    expect(campaignApprovalError(new Error("Unsupported social operation."), copy)).toContain("Update bycoda");
    expect(campaignApprovalError(new Error("Campaign preview changed. Review the current campaign before approving."), copy)).toContain("preview changed");
    const other = new Error("Permission denied");
    expect(campaignApprovalError(other, copy)).toBe(other);
  });
  it("distinguishes identically named accounts and scopes recipient names to the account", () => {
    expect(accountIdentity(accounts, "store-x")).toBe("Store support · X");
    expect(accountIdentity(accounts, "store-wa")).toBe("Store support · WhatsApp");
    const contacts = [
      { id: "same", accountId: "store-x", platformId: "42", name: "Aylin" },
      { id: "same", accountId: "store-wa", platformId: "42", name: "Deniz" },
    ] as SocialSnapshot["contacts"];
    expect(recipientIdentity(contacts, "store-wa", "42")).toBe("Deniz · 42");
    expect(recipientIdentity(contacts, "store-wa", "unknown")).toBe("unknown");
    expect(accountIdentity([], "removed-account", "telegram")).toBe("removed-account · Telegram");
  });

  it("reviews media identifiers, alt text and every platform option including false values", () => {
    const variant = {
      accountId: "store-x", text: "Launch", scheduledAt: 123, factIds: [],
      media: [{ kind: "image", uploadId: "upload-1", alt: "Side view" }, { kind: "video", url: "https://media.example/video" }],
      youtube: { title: "Product walkthrough", privacy: "unlisted", madeForKids: false, containsSyntheticMedia: true },
      tiktok: { privacy: "SELF_ONLY", durationSeconds: 20, allowComment: false, allowDuet: true, allowStitch: false,
        brandContent: true, brandOrganic: false, isAigc: true, consent: false },
    } satisfies SocialSnapshot["campaigns"][number]["variants"][number];
    const lines = variantReviewLines(variant, copy);
    expect(lines).toContain("Image · upload-1 · Side view");
    expect(lines).toContain("Video · https://media.example/video");
    expect(lines).toContain("Visibility: Unlisted");
    expect(lines).toContain("Made for kids: No");
    expect(lines).toContain("Contains synthetic media: Yes");
    expect(lines).toContain("TikTok · Visibility: SELF_ONLY");
    expect(lines).toContain("Duration (seconds): 20");
    expect(lines).toContain("Allow comments: No");
    expect(lines).toContain("Allow duet: Yes");
    expect(lines).toContain("Allow stitch: No");
    expect(lines).toContain("Branded content: Yes");
    expect(lines).toContain("Promotes own brand: No");
    expect(lines).toContain("AI-generated content: Yes");
    expect(lines).toContain("Platform consent: No");
    const campaign = { id: "campaign", name: "Store opening", projectIds: ["p-1"], variants: [variant], revision: 7, paused: false, createdAt: 1 };
    const review = campaignReview(campaign, accounts, copy, (at) => `at ${at}`);
    expect(review).toContain("Revision: 7");
    expect(review).toContain("Projects: p-1");
    expect(review).toContain("Store support · X\nat 123\nLaunch");
    expect(review).toContain("upload-1");
  });
});
