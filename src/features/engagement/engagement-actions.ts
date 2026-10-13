import {
  appShareContent,
  type EngagementCopy,
  type EngagementLinks,
  type EngagementPlatform,
} from "./engagement-model";

type OpenResult = "opened" | "unavailable" | "failed";
export async function openPublicLink(
  url: string | null,
  openURL: (url: string) => Promise<unknown>,
): Promise<OpenResult> {
  if (!url) return "unavailable";
  try {
    await openURL(url);
    return "opened";
  } catch {
    return "failed";
  }
}

export type ShareResult = "returned" | "dismissed" | "unavailable" | "failed";
export async function sharePublicApp(
  links: EngagementLinks,
  platform: EngagementPlatform,
  copy: EngagementCopy,
  share: (
    content: ReturnType<typeof appShareContent>,
  ) => Promise<{ action: string }>,
): Promise<ShareResult> {
  if (platform !== "ios" && platform !== "android") return "unavailable";
  try {
    const result = await share(appShareContent(links, platform, copy));
    // Android returns sharedAction even when dismissed. Neither platform proves delivery.
    if (result.action === "dismissedAction") return "dismissed";
    return result.action === "sharedAction" ? "returned" : "failed";
  } catch {
    return "failed";
  }
}
