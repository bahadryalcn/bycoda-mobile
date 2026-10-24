export type PreferenceDefaults = {
  effort?: string;
  runtimeMode?: string;
  extras?: Record<string, string>;
};
export type PreferenceModel = {
  id: string;
  name: string;
  settings: {
    id: string;
    label: string;
    effort: boolean;
    options: { value: string; label: string }[];
  }[];
};
export type DesktopPreferencesSnapshot = {
  environmentId: string;
  sourceSessionId: string;
  projectCwd: string;
  workingCwd: string;
  revision: string;
  atomic: false;
  templates: { id: string; name: string; trigger?: string; preview: string }[];
  providers: {
    id: string;
    models: PreferenceModel[];
    runtimeModes: string[];
    globalModel?: string;
    projectModel?: string;
    globalDefaults: PreferenceDefaults;
    projectDefaults: PreferenceDefaults;
    unsupportedDefaults: number;
    hidden: boolean;
  }[];
  globalProvider?: string;
  projectProvider?: string;
};
export type DesktopPreferenceStatus = {
  state: "unknown" | "applied" | "failed";
  snapshot?: DesktopPreferencesSnapshot;
  message?: string;
};
export type ComputerTemplate = { id: string; name: string; body: string; trigger?: string };
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 200): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max && !/[\0\r\n]/.test(value);
const optional = (value: unknown, max = 200) => value === undefined || text(value, max);
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const array = (value: unknown, max: number): value is unknown[] =>
  Array.isArray(value) && value.length <= max;
const unique = (rows: { id: string }[]) => new Set(rows.map((row) => row.id)).size === rows.length;
function defaults(value: unknown, model: PreferenceModel | undefined, modes: string[]) {
  if (
    !record(value) ||
    !exact(value, ["effort", "runtimeMode", "extras"]) ||
    !optional(value.effort) ||
    !optional(value.runtimeMode) ||
    (value.runtimeMode !== undefined && !modes.includes(value.runtimeMode as string))
  )
    return false;
  if (
    value.effort !== undefined &&
    !model?.settings.some(
      (setting) =>
        setting.effort && setting.options.some((option) => option.value === value.effort),
    )
  )
    return false;
  if (
    value.extras !== undefined &&
    (!record(value.extras) ||
      Object.entries(value.extras).some(
        ([key, val]) =>
          !model?.settings.some(
            (setting) =>
              !setting.effort &&
              setting.id === key &&
              setting.options.some((option) => option.value === val),
          ),
      ))
  )
    return false;
  return true;
}
export function readDesktopPreferences(
  value: unknown,
  environmentId: string,
  sourceSessionId: string,
): DesktopPreferencesSnapshot {
  if (
    !record(value) ||
    !exact(value, [
      "environmentId",
      "sourceSessionId",
      "projectCwd",
      "workingCwd",
      "revision",
      "atomic",
      "templates",
      "providers",
      "globalProvider",
      "projectProvider",
    ]) ||
    value.environmentId !== environmentId ||
    value.sourceSessionId !== sourceSessionId ||
    !text(value.projectCwd, 4096) ||
    !text(value.workingCwd, 4096) ||
    !text(value.revision) ||
    value.atomic !== false ||
    !array(value.templates, 100) ||
    !array(value.providers, 30)
  )
    throw new Error("Invalid desktop preference snapshot");
  for (const row of value.templates)
    if (
      !record(row) ||
      !exact(row, ["id", "name", "trigger", "preview"]) ||
      !text(row.id) ||
      !text(row.name, 160) ||
      !optional(row.trigger, 24) ||
      typeof row.preview !== "string" ||
      row.preview.length > 160
    )
      throw new Error("Invalid computer template metadata");
  for (const row of value.providers) {
    if (
      !record(row) ||
      !exact(row, [
        "id",
        "models",
        "runtimeModes",
        "globalModel",
        "projectModel",
        "globalDefaults",
        "projectDefaults",
        "unsupportedDefaults",
        "hidden",
      ]) ||
      !text(row.id) ||
      !array(row.models, 500) ||
      !array(row.runtimeModes, 4) ||
      row.runtimeModes.some(
        (mode) =>
          !["supervised", "auto-accept-edits", "auto", "full-access"].includes(String(mode)),
      ) ||
      typeof row.hidden !== "boolean" ||
      !Number.isInteger(row.unsupportedDefaults) ||
      Number(row.unsupportedDefaults) < 0 ||
      !optional(row.globalModel) ||
      !optional(row.projectModel)
    )
      throw new Error("Invalid desktop provider metadata");
    for (const model of row.models) {
      if (
        !record(model) ||
        !exact(model, ["id", "name", "settings"]) ||
        !text(model.id) ||
        !text(model.name, 1000) ||
        !array(model.settings, 50)
      )
        throw new Error("Invalid desktop model metadata");
      for (const setting of model.settings)
        if (
          !record(setting) ||
          !exact(setting, ["id", "label", "effort", "options"]) ||
          !text(setting.id) ||
          !text(setting.label, 1000) ||
          typeof setting.effort !== "boolean" ||
          !array(setting.options, 100) ||
          setting.options.some(
            (option) =>
              !record(option) ||
              !exact(option, ["value", "label"]) ||
              typeof option.value !== "string" ||
              option.value.length > 200 ||
              !text(option.label, 1000),
          )
        )
          throw new Error("Invalid desktop model settings");
    }
    const models = row.models as PreferenceModel[];
    if (
      !unique(models) ||
      (row.globalModel !== undefined && !models.some((model) => model.id === row.globalModel)) ||
      (row.projectModel !== undefined && !models.some((model) => model.id === row.projectModel)) ||
      !defaults(
        row.globalDefaults,
        models.find((model) => model.id === row.globalModel) ?? models[0],
        row.runtimeModes as string[],
      ) ||
      !defaults(
        row.projectDefaults,
        models.find((model) => model.id === (row.projectModel ?? row.globalModel)) ?? models[0],
        row.runtimeModes as string[],
      )
    )
      throw new Error("Invalid desktop default choices");
  }
  const parsed = value as DesktopPreferencesSnapshot;
  if (
    !unique(parsed.templates) ||
    !unique(parsed.providers) ||
    [parsed.globalProvider, parsed.projectProvider].some(
      (id) => id !== undefined && !parsed.providers.some((row) => row.id === id),
    )
  )
    throw new Error("Invalid desktop preference identities");
  return parsed;
}
export function readDesktopPreferenceStatus(
  value: unknown,
  environmentId: string,
  sourceSessionId: string,
): DesktopPreferenceStatus {
  if (
    !record(value) ||
    !exact(value, ["state", "snapshot", "message"]) ||
    !["unknown", "applied", "failed"].includes(String(value.state)) ||
    !optional(value.message, 1000)
  )
    throw new Error("Invalid desktop preference receipt");
  if (value.state === "applied" && !value.snapshot)
    throw new Error("Missing desktop preference readback");
  return {
    state: value.state as DesktopPreferenceStatus["state"],
    ...(value.snapshot
      ? { snapshot: readDesktopPreferences(value.snapshot, environmentId, sourceSessionId) }
      : {}),
    ...(value.message ? { message: String(value.message) } : {}),
  };
}
export function readComputerTemplate(
  value: unknown,
  revision: string,
  templateId: string,
): ComputerTemplate {
  if (
    !record(value) ||
    !exact(value, ["revision", "template"]) ||
    value.revision !== revision ||
    !record(value.template) ||
    !exact(value.template, ["id", "name", "body", "trigger"]) ||
    value.template.id !== templateId ||
    !text(value.template.id) ||
    !text(value.template.name, 160) ||
    typeof value.template.body !== "string" ||
    !value.template.body.trim() ||
    value.template.body.length > 20000 ||
    !optional(value.template.trigger, 24)
  )
    throw new Error("Computer template review changed");
  return value.template as ComputerTemplate;
}
