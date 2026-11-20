import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression guard for native permission prompts and widget display names. Widget `name`
// values are identifiers and must stay stable; only the localized catalogs may change.
const root = new URL("../../../", import.meta.url);
const app = JSON.parse(readFileSync(new URL("app.json", root), "utf8")) as {
  expo: { locales: Record<string, string>; plugins: unknown[] };
};

const plugin = (name: string) =>
  app.expo.plugins.find((value): value is [string, Record<string, unknown>] =>
    Array.isArray(value) && value[0] === name,
  )?.[1] as Record<string, unknown> | undefined;

type WidgetConfig = {
  name: string;
  displayName: string;
  description: string;
  ios?: unknown;
  android?: unknown;
};
const widgets = (plugin("expo-widgets")?.widgets ?? []) as WidgetConfig[];

const IOS_PERMISSION_KEYS = [
  "NSLocalNetworkUsageDescription",
  "NSMicrophoneUsageDescription",
  "NSCameraUsageDescription",
  "NSFaceIDUsageDescription",
  "NSPhotoLibraryUsageDescription",
  "NSPhotoLibraryAddUsageDescription",
];

// Mirrors expo-widgets' toAndroidResourceName, which names the generated <string> resources.
const androidResourceStem = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();

describe("native widget identity and locales", () => {
  it("keeps widget identifiers stable", () => {
    expect(widgets.map((widget) => widget.name)).toEqual([
      "ActiveSessions",
      "NeedsAttention",
      "UsageLimits",
      "SessionActivity",
    ]);
  });

  it("registers a native catalog for every supported non-English locale", () => {
    const supported = (plugin("expo-localization")?.supportedLocales ?? []) as string[];
    expect(Object.keys(app.expo.locales).sort()).toEqual(
      supported.filter((locale) => locale !== "en").sort(),
    );
  });

  for (const [locale, catalogPath] of Object.entries(app.expo.locales)) {
    it(`${locale} covers permission prompts and widget names`, () => {
      const catalog = JSON.parse(
        readFileSync(new URL(catalogPath, root), "utf8"),
      ) as {
        ios: Record<string, unknown> & { "Localizable.strings": Record<string, string> };
        android: Record<string, string>;
      };

      for (const key of IOS_PERMISSION_KEYS) {
        expect(catalog.ios[key], key).toEqual(expect.any(String));
      }

      for (const widget of widgets) {
        if (widget.ios) {
          // Swift passes the English displayName and description as lookup keys.
          expect(catalog.ios["Localizable.strings"][widget.displayName], widget.name).toEqual(
            expect.any(String),
          );
          expect(catalog.ios["Localizable.strings"][widget.description], widget.name).toEqual(
            expect.any(String),
          );
        }
        if (widget.android) {
          const stem = androidResourceStem(widget.name);
          expect(catalog.android[`${stem}_display_name`], widget.name).toEqual(expect.any(String));
          expect(catalog.android[`${stem}_description`], widget.name).toEqual(expect.any(String));
        }
      }
    });
  }
});
