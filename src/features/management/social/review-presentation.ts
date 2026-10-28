import type { HostProject, SocialAccount, SocialSnapshot, SocialThread } from "@/domain/types";
import { SOCIAL_PLATFORM_NAMES } from "../../../../../src/features/social/model/social";

type Copy = (tr: string, en: string) => string;
type Variant = SocialSnapshot["campaigns"][number]["variants"][number];
type Contact = SocialSnapshot["contacts"][number];
type Campaign = SocialSnapshot["campaigns"][number];

export function captureCampaignReview(campaign: Campaign) {
  const snapshot = JSON.parse(JSON.stringify(campaign)) as Campaign;
  return { snapshot, input: { id: snapshot.id, expectedRevision: snapshot.revision } };
}

export function campaignApprovalError(error: unknown, copy: Copy): unknown {
  if (!(error instanceof Error)) return error;
  if (/^Unsupported social operation\.?$/.test(error.message)) return copy(
    "Bu içeriği güvenle onaylamak için bilgisayardaki bycoda’yı güncelleyin.",
    "Update bycoda on the computer to approve this content safely.",
  );
  if (error.message === "Campaign preview changed. Review the current campaign before approving.") return copy(
    "İçerik önizlemesi değişti. Onaylamadan önce güncel içeriği yeniden inceleyin.",
    "The content preview changed. Review the current content before approving.",
  );
  return error;
}

export function accountIdentity(accounts: readonly SocialAccount[], id: string, provider?: string) {
  const account = accounts.find((item) => item.id === id);
  const platform = account?.platform ?? provider;
  return [account?.name || id, platform && (SOCIAL_PLATFORM_NAMES[platform as SocialAccount["platform"]] ?? platform)]
    .filter(Boolean).join(" · ");
}

export function recipientIdentity(
  contacts: readonly Contact[], accountId: string, contactId: string,
) {
  const contact = contacts.find((item) => item.accountId === accountId &&
    (item.id === contactId || item.platformId === contactId));
  return contact?.name && contact.name !== contactId ? `${contact.name} · ${contactId}` : contactId;
}

export function threadRowPresentation(
  thread: SocialThread, accounts: readonly SocialAccount[], contacts: readonly Contact[],
  projects: readonly HostProject[], formatTime: (value: number) => string,
) {
  const contact = contacts.find((item) => item.accountId === thread.accountId &&
    (item.id === thread.contactId || item.platformId === thread.contactId));
  const title = contact?.name?.trim() || thread.contactId;
  const latestEvent = thread.events.at(-1);
  const latestMessage = latestEvent?.text ?? "";
  const metadata = [accountIdentity(accounts, thread.accountId),
    thread.projectId && (projects.find((item) => item.id === thread.projectId)?.name ?? thread.projectId),
    formatTime(latestEvent?.at ?? thread.lastInboundAt),
  ].filter(Boolean).join(" · ");
  return { title, latestMessage, metadata,
    accessibleLabel: [recipientIdentity(contacts, thread.accountId, thread.contactId), latestMessage, metadata].filter(Boolean).join(". "),
  };
}

export function variantReviewLines(variant: Variant, copy: Copy): string[] {
  const yesNo = (value: boolean) => value ? copy("Evet", "Yes") : copy("Hayır", "No");
  const privacyLabels: Record<string, string> = {
    private: copy("Özel", "Private"), unlisted: copy("Liste dışı", "Unlisted"), public: copy("Herkese açık", "Public"),
  };
  const privacy = (value: string) => privacyLabels[value] ?? value;
  const lines = variant.media.map((media) => [
    media.kind === "image" ? copy("Görsel", "Image") : copy("Video", "Video"),
    media.url ?? media.uploadId,
    media.alt,
  ].filter(Boolean).join(" · "));
  if (variant.youtube) {
    const options = variant.youtube;
    lines.push(`YouTube · ${copy("Başlık", "Title")}: ${options.title}`,
      `${copy("Görünürlük", "Visibility")}: ${privacy(options.privacy)}`,
      `${copy("Çocuklara özel", "Made for kids")}: ${yesNo(options.madeForKids)}`,
      `${copy("Sentetik medya içeriyor", "Contains synthetic media")}: ${yesNo(options.containsSyntheticMedia)}`);
  }
  if (variant.tiktok) {
    const options = variant.tiktok;
    lines.push(`TikTok · ${copy("Görünürlük", "Visibility")}: ${privacy(options.privacy)}`,
      `${copy("Süre (saniye)", "Duration (seconds)")}: ${options.durationSeconds}`,
      `${copy("Yorumlara izin ver", "Allow comments")}: ${yesNo(options.allowComment)}`,
      `${copy("Düete izin ver", "Allow duet")}: ${yesNo(options.allowDuet)}`,
      `${copy("Birleştirmeye izin ver", "Allow stitch")}: ${yesNo(options.allowStitch)}`,
      `${copy("Markalı içerik", "Branded content")}: ${yesNo(options.brandContent)}`,
      `${copy("Kendi markasını tanıtıyor", "Promotes own brand")}: ${yesNo(options.brandOrganic)}`,
      `${copy("Yapay zekâ içeriği", "AI-generated content")}: ${yesNo(options.isAigc)}`,
      `${copy("Platform onayı", "Platform consent")}: ${yesNo(options.consent)}`);
  }
  return lines;
}

export function campaignReview(
  campaign: SocialSnapshot["campaigns"][number],
  accounts: readonly SocialAccount[],
  copy: Copy,
  formatTime: (value: number) => string,
) {
  return [campaign.name, `${copy("Sürüm", "Revision")}: ${campaign.revision}`,
    `${copy("Projeler", "Projects")}: ${campaign.projectIds.join(" · ")}`,
    ...campaign.variants.map((variant) => [
      accountIdentity(accounts, variant.accountId), formatTime(variant.scheduledAt),
      variant.text, variant.link, ...variantReviewLines(variant, copy),
    ].filter(Boolean).join("\n")),
  ].join("\n\n");
}
