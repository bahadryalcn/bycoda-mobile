// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { assistantProfileDefaults } from "../../../../host/assistant/profile-defaults";
import type { AssistantProfile } from "../../../../src/shared/model/host-contracts/assistant";
import type { AssistantMobileClient } from "./assistant-client";

const sheetGuard = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/ui/info-hint", () => ({ InfoHint: ({ text }: { text: string }) => createElement("span", null, text) }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: sheetGuard }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) =>
  en.replace(/\{(p\d+)\}/g, (_, key: string) => String(values?.[key] ?? key)) }));
vi.mock("@/ui/limit-presets", async () =>
  (await import("@/ui/limit-presets.fixture")).limitFieldDoubles((await import("@/ui/primitives")).NumberField as never));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    StatusText: ({ label }: { label: string }) => createElement("span", null, label),
    Section: Group,
    Stack: Group,
    MultiSelectField: ({ label }: { label: string }) => createElement("span", { "data-multi": label }, label),
    Notice: ({ message, children, action }: PropsWithChildren<{ message: string; action?: { label: string; onPress(): void } }>) =>
      createElement("div", null, createElement("p", null, message), children, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
    ErrorNotice: ({ action }: { action?: { label: string; onPress(): void } }) =>
      createElement("div", null, createElement("p", null, "error"), action ? createElement("button", { onClick: action.onPress }, action.label) : null),
    ValueRow: ({ label, value, trailing }: { label: string; value?: string; trailing?: React.ReactNode }) =>
      createElement("div", { "data-row": label }, label, value, trailing),
    showToast: toast,
    NavigationGroup: Group,
    NavigationRow: ({ label, detail, disabled }: { label: string; detail?: string; disabled?: boolean }) =>
      createElement("div", { "data-row": label, "aria-disabled": disabled }, label, detail),
    FormActions: ({ submitLabel, cancelLabel, onSubmit, onCancel, disabled, feedback }: PropsWithChildren<{
      submitLabel: string; cancelLabel: string; onSubmit(): void; onCancel(): void; disabled?: boolean; feedback?: React.ReactNode;
    }>) => createElement("footer", null, feedback,
      createElement("button", { onClick: onCancel }, cancelLabel),
      createElement("button", { onClick: onSubmit, disabled }, submitLabel)),
    StateView: ({ title }: { title: string }) => createElement("p", null, title),
    Body: Group,
    Button: ({ label, onPress, disabled }: { label: string; onPress(): void; disabled: boolean }) =>
      createElement("button", { onClick: onPress, disabled }, label),
    ToggleField: ({
      label,
      value,
      onChange,
      disabled,
    }: {
      label: string;
      value: boolean;
      onChange(value: boolean): void;
      disabled: boolean;
    }) =>
      createElement(
        "button",
        { "aria-label": label, "aria-pressed": value, onClick: () => onChange(!value), disabled },
        label,
      ),
    NumberField: ({
      label,
      value,
      onChangeText,
      editable,
      error,
    }: {
      label: string;
      value: string;
      onChangeText(value: string): void;
      editable: boolean;
      error?: string;
    }) =>
      createElement(
        "label",
        null,
        label,
        createElement("input", {
          "aria-label": label,
          value,
          disabled: !editable,
          onInput: (event: React.FormEvent<HTMLInputElement>) =>
            onChangeText(event.currentTarget.value),
        }),
        error,
      ),
    SelectField: ({
      label,
      value,
      options,
      onChange,
      disabled,
    }: {
      label: string;
      value: string;
      options: { value: string; label: string; disabled?: boolean }[];
      onChange(value: string): void;
      disabled: boolean;
    }) =>
      createElement(
        "select",
        {
          "aria-label": label,
          value,
          disabled,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value),
        },
        ...options.map((option) =>
          createElement("option", { key: option.value, value: option.value, disabled: option.disabled }, option.label),
        ),
      ),
  };
});
import { AssistantPermissions } from "./assistant-permissions";

const target = {
  accountId: "private-account-id",
  accountLabel: "Work account",
  conversationId: "private-conversation-id",
  conversationLabel: "Team alerts",
};
const opening = {
  ...assistantProfileDefaults,
  version: 7,
  permissionProjectIds: [],
  criticalExclusions: [],
  keepAwakeWhileAway: true,
  urgentNotificationRepeats: 2,
  urgentNotificationIntervalMinutes: 30,
  notificationTelegram: null,
} satisfies AssistantProfile;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
/** `opened` is what the destination read made when the settings open returns (or throws). */
async function fixture(profile: AssistantProfile = opening, opened: (typeof target)[] | Error = [target]) {
  let current = true;
  const updateProfile = vi.fn(async (_version: number, patch: object) => ({
    ...profile,
    ...patch,
    version: profile.version + 1,
  }));
  const notificationTargets = vi.fn(async () => [target]);
  notificationTargets.mockImplementationOnce(async () => {
    if (opened instanceof Error) throw opened;
    return opened;
  });
  const inspectPresence = vi.fn(async () => ({ profile: { ...opening, version: 9 } }));
  const onChanged = vi.fn(async () => {});
  const props = {
    profile,
    client: {
      updateProfile,
      notificationTargets,
      inspectPresence,
    } as unknown as AssistantMobileClient,
    projects: [],
    enabled: true,
    current: () => current,
    onChanged,
  };
  const render = async (next = profile) => {
    await act(async () =>
      root.render(createElement(AssistantPermissions, { ...props, profile: next })),
    );
  };
  await render();
  return {
    updateProfile,
    notificationTargets,
    inspectPresence,
    onChanged,
    render,
    setCurrent: (value: boolean) => {
      current = value;
    },
  };
}
const button = (label: string) =>
  [...container.querySelectorAll("button")].find((node) => node.textContent === label);
const click = async (label: string) => {
  await act(async () => button(label)!.click());
};
const input = (label: string) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const edit = async (label: string, value: string) => {
  await act(async () => {
    const node = input(label);
    node.value = value;
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const select = async (label: string, value: string) => {
  await act(async () => {
    const node = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    node.value = value;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const choose = (value: string) => select("Telegram notification destination", value);
const REPEATS = "Repeat urgent notifications", INTERVAL = "Repeat interval", AWAKE = "Keep the computer awake while away";
/** Lets the autosave delay pass and every save step settle. */
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
};
const destination = JSON.stringify([target.accountId, target.conversationId]);

// Notifications and the computer save on their own. They never carry the access fields, because the Host
// interrupts the assistant's running work whenever those are written.
it("saves notifications and the computer on their own, without the access fields, against the opening version", async () => {
  const f = await fixture({
    ...opening,
    keepAwakeWhileAway: undefined,
    urgentNotificationRepeats: undefined,
    urgentNotificationIntervalMinutes: undefined,
  } as unknown as AssistantProfile);
  expect(container.querySelector<HTMLSelectElement>(`select[aria-label="${REPEATS}"]`)!.value).toBe("2");
  expect(input(INTERVAL).value).toBe("30");
  expect(button("Save")).toBeUndefined();
  expect(sheetGuard).toHaveBeenLastCalledWith({ dirty: false, pending: false });
  await click(AWAKE);
  await select(REPEATS, "10");
  await edit(INTERVAL, "1440");
  expect(f.updateProfile).not.toHaveBeenCalled();
  await settle();
  expect(f.updateProfile).toHaveBeenCalledTimes(1);
  expect(f.updateProfile).toHaveBeenCalledWith(7, {
    keepAwakeWhileAway: false,
    urgentNotificationRepeats: 10,
    urgentNotificationIntervalMinutes: 1440,
  });
  expect(toast).toHaveBeenCalledWith({ message: "Preferences saved." });
});
it("offers repeat presets, hides the interval while repeats are off and saves Off", async () => {
  const f = await fixture({ ...opening, urgentNotificationRepeats: 4 });
  const options = [...container.querySelectorAll<HTMLOptionElement>(`select[aria-label="${REPEATS}"] option`)];
  expect(options.map((option) => option.textContent)).toEqual(["Off", "Once", "2 times", "3 times", "4 times", "5 times", "10 times"]);
  await select(REPEATS, "0");
  expect(container.querySelector(`input[aria-label="${INTERVAL}"]`)).toBeNull();
  await settle();
  expect(f.updateProfile).toHaveBeenCalledWith(7, expect.objectContaining({ urgentNotificationRepeats: 0 }));
});
it("never saves an empty, fractional or out-of-range interval and saves once it is fixed", async () => {
  const f = await fixture();
  for (const value of ["", "0", "1441", "1.5"]) {
    await edit(INTERVAL, value);
    await settle();
  }
  expect(f.updateProfile).not.toHaveBeenCalled();
  await edit(INTERVAL, "1");
  await settle();
  expect(f.updateProfile).toHaveBeenCalledWith(7, expect.objectContaining({ urgentNotificationIntervalMinutes: 1 }));
});
// The owner decided access changes apply only on an explicit Save that first says it interrupts work.
it("applies access only on Save, after saying that saving interrupts the assistant's work", async () => {
  const f = await fixture({ ...opening, permissionLevel: "ask" });
  expect(button("Save")).toBeUndefined();
  await select("Permission level", "everything");
  await settle();
  expect(f.updateProfile).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Saving interrupts the work the assistant is doing right now.");
  expect(sheetGuard).toHaveBeenLastCalledWith({ dirty: true, pending: false });
  await click("Save");
  expect(f.updateProfile).toHaveBeenCalledTimes(1);
  expect(f.updateProfile).toHaveBeenCalledWith(7, {
    permissionLevel: "everything",
    permissionProjectIds: [],
    criticalExclusions: [],
  });
  expect(button("Save")).toBeUndefined();
});
it("discards unsaved access edits on Cancel", async () => {
  const f = await fixture({ ...opening, permissionLevel: "ask" });
  await select("Permission level", "watch");
  await click("Cancel");
  expect(container.querySelector<HTMLSelectElement>('select[aria-label="Permission level"]')!.value).toBe("ask");
  expect(button("Save")).toBeUndefined();
  expect(f.updateProfile).not.toHaveBeenCalled();
});
it("shows an unset level as Not set without offering it, and the always-ask list only once a level is set", async () => {
  await fixture({ ...opening, permissionLevel: undefined });
  const unset = container.querySelector<HTMLOptionElement>('select[aria-label="Permission level"] option[value="legacy"]')!;
  expect(unset.textContent).toBe("Not set");
  expect(unset.disabled).toBe(true);
  expect(container.querySelector('[data-multi="Always ask separately"]')).toBeNull();
  await select("Permission level", "watch");
  expect(container.querySelector('[data-multi="Always ask separately"]')).not.toBeNull();
});
it("shows Telegram as an unavailable row naming where to connect it when no conversation is allowed", async () => {
  await fixture(opening, []);
  expect(container.querySelector('select[aria-label="Telegram notification destination"]')).toBeNull();
  const row = container.querySelector('[data-row="Telegram notification destination"]')!;
  expect(row.textContent).toContain("None");
  expect(row.textContent).toContain("Connect Telegram in Social on the desktop");
});
it("reads the allowed destinations on open, shows only labels and revalidates a chosen one before saving", async () => {
  const f = await fixture();
  expect(f.notificationTargets).toHaveBeenCalledTimes(1);
  expect(button("Retry")).toBeUndefined();
  expect(container.textContent).toContain("Work account · Team alerts");
  expect(container.textContent).not.toContain("private-account-id");
  expect(container.textContent).not.toContain("private-conversation-id");
  await choose(destination);
  await settle();
  expect(f.notificationTargets).toHaveBeenCalledTimes(2);
  expect(f.updateProfile).toHaveBeenCalledWith(
    7,
    expect.objectContaining({
      notificationTelegram: { accountId: target.accountId, conversationId: target.conversationId },
    }),
  );
});
it("never retargets a removed saved conversation and saves an explicit clearing to null", async () => {
  const f = await fixture(
    { ...opening, notificationTelegram: { accountId: "removed", conversationId: "gone" } },
    [],
  );
  expect(container.textContent).toContain("Saved conversation unavailable");
  expect(container.textContent).not.toContain("removed");
  await settle();
  expect(f.updateProfile).not.toHaveBeenCalled();
  await choose("");
  await settle();
  expect(f.updateProfile).toHaveBeenCalledWith(7, expect.objectContaining({ notificationTelegram: null }));
});
it("refuses a destination revoked during preflight without falling back or saving", async () => {
  const f = await fixture();
  f.notificationTargets.mockResolvedValueOnce([]);
  await choose(destination);
  await settle();
  expect(f.updateProfile).not.toHaveBeenCalled();
  await settle();
  expect(f.updateProfile).not.toHaveBeenCalled();
});
it("does not save or refresh another source after a connection change during preflight", async () => {
  const f = await fixture();
  f.notificationTargets.mockImplementationOnce(async () => {
    f.setCurrent(false);
    return [target];
  });
  await choose(destination);
  await settle();
  expect(f.updateProfile).not.toHaveBeenCalled();
  expect(f.onChanged).not.toHaveBeenCalled();
});
it("adopts a newer profile while nothing is edited here", async () => {
  const f = await fixture();
  await f.render({ ...opening, version: 8, urgentNotificationIntervalMinutes: 60 });
  expect(input(INTERVAL).value).toBe("60");
  expect(button("Load current preferences")).toBeUndefined();
  await click(AWAKE);
  await settle();
  expect(f.updateProfile).toHaveBeenCalledWith(8, expect.objectContaining({ keepAwakeWhileAway: false }));
});
it("holds an uncertain save until an explicit reload and keeps edits across a newer profile", async () => {
  const f = await fixture();
  await edit(INTERVAL, "60");
  await f.render({ ...opening, version: 8 });
  await settle();
  // A newer profile on the computer while editing is a conflict: nothing is written over it.
  expect(f.updateProfile).not.toHaveBeenCalled();
  expect(input(INTERVAL).value).toBe("60");
  expect(button("Load current preferences")).toBeDefined();
  await f.render();
  f.updateProfile.mockRejectedValueOnce(Object.assign(new Error("Lost acknowledgement"), { uncertain: true }));
  await settle();
  await settle();
  expect(f.updateProfile).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Could not confirm the save.");
  expect(input(INTERVAL).value).toBe("60");
  await click("Load current preferences");
  expect(input(INTERVAL).value).toBe("30");
  await settle();
  expect(f.updateProfile).toHaveBeenCalledTimes(1);
});
it("keeps the saved destination after a failed read and offers to read again", async () => {
  const f = await fixture(
    { ...opening, notificationTelegram: { accountId: "old-account", conversationId: "old-conversation" } },
    new Error("Offline"),
  );
  expect(container.textContent).toContain("The saved destination is kept.");
  await click("Retry");
  await edit(INTERVAL, "45");
  await settle();
  expect(f.updateProfile).toHaveBeenCalledTimes(1);
  expect(f.updateProfile.mock.calls[0][1]).not.toHaveProperty("notificationTelegram");
});
it("does not overlap a destination read with a save", async () => {
  const f = await fixture();
  let resolve!: (targets: (typeof target)[]) => void;
  f.notificationTargets.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await choose(destination);
  await settle();
  await settle();
  expect(f.notificationTargets).toHaveBeenCalledTimes(2);
  expect(f.updateProfile).not.toHaveBeenCalled();
  await act(async () => resolve([target]));
  expect(f.updateProfile).toHaveBeenCalledTimes(1);
});
