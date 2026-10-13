import { repositoryUrl, supportEmail } from "../legal/legal-content";

export type EngagementPlatform = "ios" | "android" | "web" | string;
export type EngagementCopy = (tr: string, en: string) => string;
export type EngagementConfig = {
  version?: unknown;
  android?: { package?: unknown };
  extra?: { engagement?: unknown };
};
export type EngagementLinks = {
  storeUrl: string | null;
  reviewUrl: string | null;
  shareUrl: string;
};
export type AppIdentity = {
  version: string | null;
  nativeBuild: string | null;
  preview: boolean;
};

function httpsUrl(value: unknown): URL | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port
      ? url
      : null;
  } catch {
    return null;
  }
}

function iosStoreUrl(value: unknown): string | null {
  const url = httpsUrl(value);
  if (
    !url ||
    url.hostname !== "apps.apple.com" ||
    !/^(?:\/[a-z]{2})?\/app\/(?:[^/]+\/)?id[1-9]\d*\/?$/.test(url.pathname)
  )
    return null;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function androidStoreUrl(value: unknown, packageName: unknown): string | null {
  const url = httpsUrl(value);
  if (
    !url ||
    url.hostname !== "play.google.com" ||
    url.pathname !== "/store/apps/details" ||
    typeof packageName !== "string" ||
    !/^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/.test(packageName) ||
    url.searchParams.getAll("id").length !== 1 ||
    url.searchParams.get("id") !== packageName
  )
    return null;
  url.search = "";
  url.searchParams.set("id", packageName);
  url.hash = "";
  return url.toString();
}

/** Public metadata only: never substitute a host endpoint or a pairing URL. */
export function publicAppUrl(value: unknown): string | null {
  const url = httpsUrl(value);
  const hostname = url?.hostname.replace(/\.+$/, "") ?? "";
  if (
    !url ||
    url.search ||
    url.hash ||
    !hostname.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example)$/.test(
      hostname,
    ) ||
    /(?:^|\.)(?:ts\.net|tailscale\.net)$/.test(hostname) ||
    /^[\d.]+$/.test(hostname) ||
    hostname.includes(":")
  )
    return null;
  return url.toString();
}

export function engagementLinks(
  config: EngagementConfig | null | undefined,
  platform: EngagementPlatform,
): EngagementLinks {
  const raw = config?.extra?.engagement;
  const settings =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const storeUrl =
    platform === "ios"
      ? iosStoreUrl(settings.iosAppStoreUrl)
      : platform === "android"
        ? androidStoreUrl(
            settings.androidPlayStoreUrl,
            config?.android?.package,
          )
        : null;
  let reviewUrl: string | null = null;
  if (storeUrl) {
    const review = new URL(storeUrl);
    review.searchParams.set(
      platform === "ios" ? "action" : "showAllReviews",
      platform === "ios" ? "write-review" : "true",
    );
    reviewUrl = review.toString();
  }
  return {
    storeUrl,
    reviewUrl,
    shareUrl: storeUrl ?? publicAppUrl(settings.publicAppUrl) ?? repositoryUrl,
  };
}

function displayValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text && text.length <= 80 && !/[\r\n\u0000]/.test(text) ? text : null;
}

/** Native build comes from the installed binary's Constants, never config guesses. */
export function appIdentity(
  constants: {
    expoConfig?: EngagementConfig | null;
    executionEnvironment?: unknown;
    platform?: {
      ios?: { buildNumber?: unknown };
      android?: { versionCode?: unknown };
    };
  },
  platform: EngagementPlatform,
): AppIdentity {
  const preview =
    constants.executionEnvironment === "storeClient" || platform === "web";
  return {
    version: displayValue(constants.expoConfig?.version),
    nativeBuild: preview
      ? null
      : displayValue(
          platform === "ios"
            ? constants.platform?.ios?.buildNumber
            : platform === "android"
              ? constants.platform?.android?.versionCode
              : null,
        ),
    preview,
  };
}

export function appShareContent(
  links: EngagementLinks,
  platform: EngagementPlatform,
  copy: EngagementCopy,
) {
  const message = copy(
    "bycoda ile bilgisayarındaki projeleri ve AI agentlarını telefonundan yönet.",
    "Manage your computer’s projects and AI agents from your phone with bycoda.",
  );
  return platform === "ios"
    ? { title: "bycoda", message, url: links.shareUrl }
    : { title: "bycoda", message: `${message}\n${links.shareUrl}` };
}

export function feedbackUrl(
  identity: AppIdentity,
  platform: EngagementPlatform,
  copy: EngagementCopy,
) {
  const subject = copy("bycoda mobil geri bildirim", "bycoda mobile feedback");
  const body = [
    copy("Geri bildirimim:", "My feedback:"),
    "",
    "",
    `${copy("Sürüm", "Version")}: ${identity.version ?? copy("Bilinmiyor", "Unknown")}`,
    `${copy("Derleme", "Build")}: ${
      identity.preview
        ? copy("Önizleme", "Preview")
        : (identity.nativeBuild ?? copy("Bilinmiyor", "Unknown"))
    }`,
    `${copy("Platform", "Platform")}: ${platform}`,
  ].join("\n");
  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
