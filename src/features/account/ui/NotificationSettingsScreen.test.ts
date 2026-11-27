// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AccountState } from "./account-context";
import { defaultNotificationSettings, type NotificationSettings } from "../contracts";
import { AccountNotificationSettings } from "./NotificationSettingsScreen";

const fixture = vi.hoisted(() => ({
  account: undefined as AccountState | undefined,
  retryRegistration: vi.fn(),
  data: undefined as NotificationSettings | undefined,
  save: vi.fn(),
}));
vi.mock("./use-graced-read-error", () => ({ useGracedReadError: (query: { error: unknown }) => query.error ?? null }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ isPending: !fixture.data, data: fixture.data }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/time-field", () => ({ TimeField: ({ label, onChange }: { label: string; onChange: (value: string) => void }) => (
  h("button", { onClick: () => onChange(label.startsWith("Start") ? "07:00" : "08:00") }, label)
) }));
vi.mock("@/ui/week-hours", () => ({ HoursOverview: () => h("p", null, "Schedule preview") }));
vi.mock("@/ui/info-hint", () => ({ HintSection: ({ children }: PropsWithChildren) => h("section", null, children) }));
vi.mock("./account-context", () => ({ useAccount: () => fixture.account }));
vi.mock("./use-notification-saves", () => ({ useNotificationSaves: () => ({ pending: {}, failures: {}, save: fixture.save }) }));
vi.mock("@/ui/primitives", () => {
  const wrap = ({ children }: PropsWithChildren) => h("section", null, children);
  return {
    Body: wrap, Screen: wrap, ValueRow: () => null, Section: wrap, Stack: wrap, NavigationGroup: wrap, ToggleField: () => null,
    Notice: ({ message }: { message: string }) => h("p", { role: "alert" }, message),
    Loading: () => h("p", { role: "status" }, "Loading"),
    Skeleton: () => h("p", { role: "status" }, "Loading preferences"),
    ErrorNotice: ({ error, message, onRetry }: { error: Error; message: string; onRetry?: () => void }) =>
      error ? h("p", { role: "alert" }, message, onRetry === fixture.retryRegistration ? " Retry registration" : "") : null,
    StateView: ({ title, action }: { title: string; action?: { label: string } }) =>
      h("div", null, h("p", null, title), action ? h("button", null, action.label) : null),
  };
});

it("keeps an equal quiet-hours range local and saves the corrected schedule", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  render("signedIn");
  fixture.account!.device = {} as NonNullable<AccountState["device"]>;
  fixture.data = { ...defaultNotificationSettings(), quietHours: { start: "22:00", end: "07:00", timeZone: "UTC" } };
  fixture.save.mockClear();
  const button = (label: string) => [...container.querySelectorAll("button")].find(item => item.textContent === label)!;
  try {
    await act(async () => root.render(h(AccountNotificationSettings)));
    expect(container.textContent).toContain("Schedule preview");
    await act(async () => button("Start").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Start and end times must differ.");
    expect(container.textContent).not.toContain("Schedule preview");
    expect(fixture.save).not.toHaveBeenCalled();
    await act(async () => button("End").click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Schedule preview");
    expect(fixture.save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "quietHours" }),
      expect.objectContaining({ start: "07:00", end: "08:00" }),
      expect.any(Function),
    );
  } finally {
    await act(async () => root.unmount());
    fixture.account = undefined;
    fixture.data = undefined;
    vi.unstubAllGlobals();
  }
});

function render(status: AccountState["status"], registerError: Error | null = null) {
  fixture.account = {
    status,
    config: { publishableKey: "", apiUrl: "", mock: true },
    runtime: status === "signedIn" ? {} as AccountState["runtime"] : null,
    device: null,
    registerError,
    retryRegistration: fixture.retryRegistration,
    signOut: async () => undefined,
  };
  return renderToStaticMarkup(h(AccountNotificationSettings));
}

describe("notification settings access", () => {
  it.each(["loading", "signedIn"] as const)("shows progress for %s without asking for sign-in", (status) => {
    const html = render(status);
    expect(html).toContain('role="status">Loading');
    expect(html).not.toContain("Sign in");
  });

  it("offers the account's retry when phone registration fails", () => {
    const html = render("signedIn", new Error("Offline"));
    expect(html).toContain("This phone could not be registered to your account. Retry registration");
    expect(html).not.toContain("Sign in");
  });

  it("offers sign-in when the account is signed out", () => {
    expect(render("signedOut")).toContain("<button>Sign in</button>");
  });
});

describe("account part of the Notifications page", () => {
  it("renders nothing when this build has no account sign-in", () => {
    expect(render("unavailable")).toBe("");
  });
});
