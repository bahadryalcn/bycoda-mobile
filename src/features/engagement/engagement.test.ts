import { describe, expect, it, vi } from "vitest";
import { repositoryUrl } from "../legal/legal-content";
import {
  appIdentity,
  appShareContent,
  engagementLinks,
  publicAppUrl,
} from "./engagement-model";
import { openPublicLink, sharePublicApp } from "./engagement-actions";

const english = (_tr: string, en: string) => en;
const turkish = (tr: string, _en: string) => tr;
const config = {
  version: "0.1.0",
  android: { package: "com.bycoda.mobile" },
  extra: {
    engagement: {
      iosAppStoreUrl: "https://apps.apple.com/app/bycoda/id123456789",
      androidPlayStoreUrl:
        "https://play.google.com/store/apps/details?id=com.bycoda.mobile",
      publicAppUrl: repositoryUrl,
    },
    hostEndpoint: "https://host.private.local",
    accessKey: "private-access-key",
  },
};

describe("mobile public app links", () => {
  it("keeps unpublished rating unavailable and shares the existing public repository", () => {
    expect(engagementLinks(null, "ios")).toEqual({
      reviewUrl: null,
      storeUrl: null,
      appPageUrl: null,
      shareUrl: repositoryUrl,
    });
    expect(
      engagementLinks({ android: config.android }, "android").reviewUrl,
    ).toBeNull();
  });

  it("uses a configured real-ID Apple link for manual review and a clean listing for sharing", () => {
    expect(engagementLinks(config, "ios")).toEqual({
      storeUrl: "https://apps.apple.com/app/bycoda/id123456789",
      reviewUrl:
        "https://apps.apple.com/app/bycoda/id123456789?action=write-review",
      appPageUrl: "https://apps.apple.com/app/bycoda/id123456789",
      shareUrl: "https://apps.apple.com/app/bycoda/id123456789",
    });
    const regional = {
      extra: {
        engagement: {
          iosAppStoreUrl:
            "https://apps.apple.com/tr/app/bycoda/id123456789?l=tr&token=secret#fragment",
        },
      },
    };
    expect(engagementLinks(regional, "ios").storeUrl).toBe(
      "https://apps.apple.com/tr/app/bycoda/id123456789",
    );
  });

  it("requires the Play listing to match this app package and adds reviews only to the review action", () => {
    expect(engagementLinks(config, "android")).toEqual({
      storeUrl:
        "https://play.google.com/store/apps/details?id=com.bycoda.mobile",
      reviewUrl:
        "https://play.google.com/store/apps/details?id=com.bycoda.mobile&showAllReviews=true",
      appPageUrl:
        "https://play.google.com/store/apps/details?id=com.bycoda.mobile",
      shareUrl:
        "https://play.google.com/store/apps/details?id=com.bycoda.mobile",
    });
    for (const value of [
      "https://play.google.com/store/apps/details?id=another.app",
      "https://play.google.com/store/apps/details?id=com.bycoda.mobile&id=another.app",
      "https://play.google.com/store/apps/details?id=com.bycoda.mobile.bad",
    ]) {
      expect(
        engagementLinks(
          { ...config, extra: { engagement: { androidPlayStoreUrl: value } } },
          "android",
        ).reviewUrl,
      ).toBeNull();
    }
  });

  it.each([
    "http://apps.apple.com/app/bycoda/id123456789",
    "https://apps.apple.com.evil.com/app/bycoda/id123456789",
    "https://name:password@apps.apple.com/app/bycoda/id123456789",
    "https://apps.apple.com:8443/app/bycoda/id123456789",
    "https://apps.apple.com/app/bycoda/id0",
    "https://apps.apple.com/app/bycoda/idYOUR_APP_ID",
    "https://apps.apple.com/app/bycoda/id123456789/private",
  ])("rejects an unsafe or placeholder Apple URL %s", (value) => {
    expect(
      engagementLinks(
        { extra: { engagement: { iosAppStoreUrl: value } } },
        "ios",
      ).reviewUrl,
    ).toBeNull();
  });

  it("does not choose either platform store on the web", () => {
    expect(engagementLinks(config, "web")).toEqual({
      storeUrl: null,
      reviewUrl: null,
      appPageUrl: repositoryUrl,
      shareUrl: repositoryUrl,
    });
  });

  it("offers no app page when none is configured, while sharing still falls back to the repository", () => {
    const links = engagementLinks({ extra: { engagement: {} } }, "web");
    expect(links.appPageUrl).toBeNull();
    expect(links.shareUrl).toBe(repositoryUrl);
    expect(engagementLinks({ extra: { engagement: { publicAppUrl: "https://bycoda.example.com/app" } } }, "web").appPageUrl).toBe("https://bycoda.example.com/app");
  });

  it.each([
    "http://github.com/bahadryalcn/bycoda",
    "https://localhost/host",
    "https://localhost./host",
    "https://computer.local/host",
    "https://host.internal/host",
    "https://127.0.0.1/host",
    "https://192.168.1.5/host",
    "https://[::1]/host",
    "https://computer.tailnet.ts.net/host",
    "https://key:secret@public.example.com/host",
    "https://public.example.com/app?accessKey=secret",
    "https://public.example.com/app#pairing-code",
  ])(
    "never uses a private or credential-bearing public share URL %s",
    (value) => {
      expect(publicAppUrl(value)).toBeNull();
      expect(
        engagementLinks(
          { extra: { engagement: { publicAppUrl: value } } },
          "ios",
        ).shareUrl,
      ).toBe(repositoryUrl);
    },
  );

  it("shares only localized public app copy and the public listing", () => {
    const ios = appShareContent(engagementLinks(config, "ios"), "ios", english);
    const android = appShareContent(
      engagementLinks(config, "android"),
      "android",
      turkish,
    );
    expect(ios.url).toBe("https://apps.apple.com/app/bycoda/id123456789");
    expect(ios.message).toContain("Manage your computer");
    expect(android.message).toContain("telefonundan yönet");
    expect(android.message).toContain(
      "https://play.google.com/store/apps/details?id=com.bycoda.mobile",
    );
    const output = JSON.stringify({ ios, android });
    expect(output).not.toContain("private-access-key");
    expect(output).not.toContain("host.private.local");
    expect(output).not.toContain("write-review");
  });
});

describe("mobile app identity and feedback", () => {
  it.each(["android", "ios"])("reads %s identity from the installed Application metadata when legacy Constants omit it", platform => {
    expect(appIdentity({ expoConfig: config }, platform, {
      nativeApplicationVersion: "0.2.0",
      nativeBuildVersion: "1",
    })).toEqual({ version: "0.2.0", nativeBuild: "1", preview: false });
  });
  it("prefers installed binary metadata over configuration and deprecated Constants values", () => {
    expect(
      appIdentity(
        {
          expoConfig: config,
          platform: {
            ios: { buildNumber: "12" },
            android: { versionCode: 42 },
          },
        },
        "ios",
        { nativeApplicationVersion: "0.2.0", nativeBuildVersion: "13" },
      ),
    ).toEqual({ version: "0.2.0", nativeBuild: "13", preview: false });
    expect(
      appIdentity(
        { expoConfig: config, platform: { android: { versionCode: 42 } } },
        "android",
        { nativeApplicationVersion: "0.2.0", nativeBuildVersion: "43" },
      ).nativeBuild,
    ).toBe("43");
    expect(
      appIdentity({ expoConfig: config, platform: { android: { versionCode: 42 } } }, "android"),
    ).toEqual({ version: null, nativeBuild: null, preview: false });
  });

  it("labels Expo Go and web as previews without reporting their host's binary build", () => {
    const constants = {
      expoConfig: config,
      executionEnvironment: "storeClient",
      platform: { ios: { buildNumber: "999" } },
    };
    expect(appIdentity(constants, "ios", { nativeApplicationVersion: "99.0", nativeBuildVersion: "999" })).toEqual({
      version: "0.1.0",
      nativeBuild: null,
      preview: true,
    });
    expect(appIdentity({ expoConfig: config }, "web").preview).toBe(true);
  });


});

describe("mobile explicit public actions", () => {
  it("does not open any review URL while a listing is unavailable", async () => {
    const open = vi.fn();
    expect(
      await openPublicLink(engagementLinks(null, "ios").reviewUrl, open),
    ).toBe("unavailable");
    expect(open).not.toHaveBeenCalled();
  });

  it("opens the configured manual review route and exposes link failure", async () => {
    const links = engagementLinks(config, "android");
    const open = vi.fn(async () => undefined);
    expect(await openPublicLink(links.reviewUrl, open)).toBe("opened");
    expect(open).toHaveBeenCalledExactlyOnceWith(links.reviewUrl);
    expect(
      await openPublicLink(links.reviewUrl, async () => {
        throw new Error("no browser");
      }),
    ).toBe("failed");
  });

  it("returns iOS dismissal separately and never reports Android delivery", async () => {
    expect(
      await sharePublicApp(
        engagementLinks(config, "ios"),
        "ios",
        english,
        async () => ({ action: "dismissedAction" }),
      ),
    ).toBe("dismissed");
    expect(
      await sharePublicApp(
        engagementLinks(config, "android"),
        "android",
        english,
        async () => ({ action: "sharedAction" }),
      ),
    ).toBe("returned");
  });

  it("does not invoke the native share API on web and handles native rejection", async () => {
    const share = vi.fn(async () => ({ action: "sharedAction" }));
    expect(
      await sharePublicApp(
        engagementLinks(config, "web"),
        "web",
        english,
        share,
      ),
    ).toBe("unavailable");
    expect(share).not.toHaveBeenCalled();
    expect(
      await sharePublicApp(
        engagementLinks(config, "ios"),
        "ios",
        english,
        async () => {
          throw new Error("no share sheet");
        },
      ),
    ).toBe("failed");
  });
});
