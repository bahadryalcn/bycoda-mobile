import { createElement as h, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ providers: ["codex", "claude"], capabilities: ["models.routing.v1"] }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => ({ data: { workCaps: { providers: { "custom-agent": {} } } } }), useHostMutation: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({}) }));
vi.mock("@/ui/primitives", () => {
  const wrap = ({ children }: PropsWithChildren) => h("div", null, children);
  return { Body: wrap, Button: wrap, Disclosure: wrap, FormActions: wrap, Notice: wrap, NumberField: wrap, QueryState: wrap, Stack: wrap,
    SelectField: ({ options }: { options: { value: string; label: string }[] }) => h("ul", null, options.map(option => h("li", { key: option.value, "data-value": option.value }, option.label))) };
});
import { RemoteHostError } from "@/remote/host-error";
import { WorkCapsSettings, failureText, locksUntilReload } from "./work-caps-settings";

it("uses product provider names in scope choices while preserving exact routing IDs and custom providers", () => {
  const html = renderToStaticMarkup(h(WorkCapsSettings, { current: () => true, enabled: true }));
  expect(html).toContain('data-value="codex">Codex</li>');
  expect(html).toContain('data-value="claude">Claude</li>');
  expect(html).toContain('data-value="custom-agent">custom-agent</li>');
});

const copy = (_turkish: string, english: string) => english;
const hostError = (kind: "network" | "host", message: string, uncertain = false) => new RemoteHostError("machine", kind, message, uncertain);

it("locks the caps form only when the save may have landed or the Host refused a stale version", () => {
  expect(locksUntilReload(hostError("network", "offline"))).toBe(false);
  expect(locksUntilReload(hostError("host", "Daily tokens must be a whole number."))).toBe(false);
  expect(locksUntilReload(hostError("network", "offline", true))).toBe(true);
  expect(locksUntilReload(hostError("host", "Model routing changed; reload before saving."))).toBe(true);
  expect(locksUntilReload(new Error("Work caps were not confirmed."))).toBe(false);
});

it("shows the Host outcome for Host errors and a generic outcome for anything else", () => {
  expect(failureText(hostError("network", "offline"), copy)).toContain("could not be reached");
  expect(failureText(hostError("host", "Daily tokens must be a whole number."), copy)).toBe("Daily tokens must be a whole number.");
  expect(failureText(new Error("Computer connection changed."), copy)).toBe("Could not complete this action.");
});
