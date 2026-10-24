import { expect, it } from "vitest";
import {
  readComputerTemplate,
  readDesktopPreferences,
  readDesktopPreferenceStatus,
} from "./desktop-preferences-model";
const snapshot = {
  environmentId: "env",
  sourceSessionId: "source",
  projectCwd: "/project",
  workingCwd: "/checkout",
  revision: "review",
  atomic: false,
  templates: [{ id: "one", name: "One", preview: "Text" }],
  providers: [
    {
      id: "claude",
      models: [
        {
          id: "model",
          name: "Model",
          settings: [
            {
              id: "effort",
              label: "Effort",
              effort: true,
              options: [{ value: "high", label: "High" }],
            },
          ],
        },
      ],
      runtimeModes: ["supervised"],
      globalModel: "model",
      globalDefaults: { effort: "high" },
      projectDefaults: {},
      unsupportedDefaults: 0,
      hidden: false,
    },
  ],
};
it("accepts bounded scoped canonical metadata and rejects foreign identities/raw fields", () => {
  expect(readDesktopPreferences(snapshot, "env", "source").atomic).toBe(false);
  expect(() => readDesktopPreferences(snapshot, "other", "source")).toThrow();
  expect(() =>
    readDesktopPreferences({ ...snapshot, transcript: "secret" }, "env", "source"),
  ).toThrow();
  expect(() =>
    readDesktopPreferences(
      { ...snapshot, templates: [...snapshot.templates, ...snapshot.templates] },
      "env",
      "source",
    ),
  ).toThrow();
  const changed = structuredClone(snapshot);
  changed.providers[0].globalDefaults.effort = "unknown";
  expect(() => readDesktopPreferences(changed, "env", "source")).toThrow();
});
it("requires an explicitly reviewed full template and a verified applied receipt", () => {
  expect(
    readComputerTemplate(
      { revision: "review", template: { id: "one", name: "One", body: "Text {{cursor}}" } },
      "review",
      "one",
    ).body,
  ).toContain("{{cursor}}");
  expect(() =>
    readComputerTemplate(
      { revision: "old", template: { id: "one", name: "One", body: "Text" } },
      "review",
      "one",
    ),
  ).toThrow();
  expect(readDesktopPreferenceStatus({ state: "unknown" }, "env", "source")).toEqual({
    state: "unknown",
  });
  expect(() => readDesktopPreferenceStatus({ state: "applied" }, "env", "source")).toThrow();
});
