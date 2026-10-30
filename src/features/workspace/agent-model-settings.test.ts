import { expect, it } from "vitest";
import { sessionCatalog } from "./catalog";
import { groupedSettings, SETTING_GROUP_TITLE, settingLabel } from "./agent-model-settings";
import {
  groupSettings,
  pickerSettings,
  SETTING_GROUP_TITLE as DESKTOP_GROUP_TITLE,
  settingLabel as desktopSettingLabel,
} from "../../../../src/features/sessions/model/modelPickerData";

it("orders and names model settings exactly like the desktop picker", () => {
  const catalog = sessionCatalog(undefined, ["claude", "codex"]);
  const models = [...catalog.models.claude!, ...catalog.models.codex!];
  expect(models.length).toBeGreaterThan(2);
  for (const model of models) {
    const desktop = Object.fromEntries(
      groupSettings(pickerSettings(model)).map((group) => [group.id, group.settings]),
    );
    const mobile = groupedSettings(model);
    for (const group of ["model", "context", "delegation"] as const) {
      expect(mobile[group].map((setting) => setting.id)).toEqual(
        (desktop[group] ?? []).map((setting) => setting.id),
      );
      for (const setting of mobile[group]) expect(settingLabel(setting)).toBe(desktopSettingLabel(setting));
    }
  }
  expect(SETTING_GROUP_TITLE).toEqual(DESKTOP_GROUP_TITLE);
});
