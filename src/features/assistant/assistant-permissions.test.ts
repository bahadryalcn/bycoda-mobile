// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { assistantProfileDefaults } from "../../../../host/assistant/profile-defaults";
import type { AssistantProfile } from "../../../../src/shared/model/host-contracts/assistant";
import type { AssistantMobileClient } from "./assistant-client";

vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Disclosure: Group,
    Section: Group,
    Stack: Group,
    MultiSelectField: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
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
      options: { value: string; label: string }[];
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
          createElement("option", { key: option.value, value: option.value }, option.label),
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
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
async function fixture(profile: AssistantProfile = opening) {
  let current = true;
  const updateProfile = vi.fn(async (_version: number, patch: object) => ({
    ...profile,
    ...patch,
    version: profile.version + 1,
  }));
  const notificationTargets = vi.fn(async () => [target]);
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
  [...container.querySelectorAll("button")].find((node) => node.textContent === label)!;
const click = async (label: string) => {
  await act(async () => button(label).click());
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
const choose = async (value: string) => {
  await act(async () => {
    const node = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Telegram notification destination"]',
    )!;
    node.value = value;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

it("keeps new policies local until explicit Save, using defaults and the opening CAS version", async () => {
  const f = await fixture({
    ...opening,
    keepAwakeWhileAway: undefined,
    urgentNotificationRepeats: undefined,
    urgentNotificationIntervalMinutes: undefined,
  } as unknown as AssistantProfile);
  expect(input("Urgent notification repeats").value).toBe("2");
  expect(input("Urgent notification repeat interval (minutes)").value).toBe("30");
  await click("Keep computer awake while away");
  await edit("Urgent notification repeats", "0");
  await edit("Urgent notification repeat interval (minutes)", "1440");
  expect(f.updateProfile).not.toHaveBeenCalled();
  await click("Save preferences");
  expect(f.updateProfile).toHaveBeenCalledWith(
    7,
    expect.objectContaining({
      keepAwakeWhileAway: false,
      urgentNotificationRepeats: 0,
      urgentNotificationIntervalMinutes: 1440,
    }),
  );
  expect(f.updateProfile.mock.calls[0][1]).not.toHaveProperty("notificationTelegram");
});
it("blocks empty, fractional and out-of-range numeric values instead of coercing them", async () => {
  const f = await fixture();
  for (const value of ["", "11", "-1", "1.5"]) {
    await edit("Urgent notification repeats", value);
    expect(button("Save preferences").disabled).toBe(true);
  }
  await edit("Urgent notification repeats", "10");
  for (const value of ["", "0", "1441", "1.5"]) {
    await edit("Urgent notification repeat interval (minutes)", value);
    expect(button("Save preferences").disabled).toBe(true);
  }
  await edit("Urgent notification repeat interval (minutes)", "1");
  await click("Save preferences");
  expect(f.updateProfile).toHaveBeenCalledWith(
    7,
    expect.objectContaining({
      urgentNotificationRepeats: 10,
      urgentNotificationIntervalMinutes: 1,
    }),
  );
});
it("shows only labels and revalidates an explicitly selected allowed destination before Save", async () => {
  const f = await fixture();
  expect(f.notificationTargets).not.toHaveBeenCalled();
  await click("Load Telegram conversations");
  expect(container.textContent).toContain("Work account · Team alerts");
  expect(container.textContent).not.toContain("private-account-id");
  expect(container.textContent).not.toContain("private-conversation-id");
  await choose(JSON.stringify([target.accountId, target.conversationId]));
  expect(f.updateProfile).not.toHaveBeenCalled();
  await click("Save preferences");
  expect(f.notificationTargets).toHaveBeenCalledTimes(2);
  expect(f.updateProfile).toHaveBeenCalledWith(
    7,
    expect.objectContaining({
      notificationTelegram: { accountId: target.accountId, conversationId: target.conversationId },
    }),
  );
});
it("never retargets a removed saved conversation and permits explicit clearing to null", async () => {
  const f = await fixture({
    ...opening,
    notificationTelegram: { accountId: "removed", conversationId: "gone" },
  });
  f.notificationTargets.mockResolvedValueOnce([]);
  await click("Load Telegram conversations");
  expect(container.textContent).toContain("Saved conversation unavailable");
  expect(container.textContent).not.toContain("removed");
  await choose("");
  await click("Save preferences");
  expect(f.updateProfile).toHaveBeenCalledWith(
    7,
    expect.objectContaining({ notificationTelegram: null }),
  );
});
it("refuses a destination revoked during preflight without falling back or saving", async () => {
  const f = await fixture();
  await click("Load Telegram conversations");
  await choose(JSON.stringify([target.accountId, target.conversationId]));
  f.notificationTargets.mockResolvedValueOnce([]);
  await click("Save preferences");
  expect(f.updateProfile).not.toHaveBeenCalled();
  expect(button("Save preferences").disabled).toBe(true);
});
it("does not dispatch or refresh another source after a connection change during preflight", async () => {
  const f = await fixture();
  await click("Load Telegram conversations");
  await choose(JSON.stringify([target.accountId, target.conversationId]));
  f.notificationTargets.mockImplementationOnce(async () => {
    f.setCurrent(false);
    return [target];
  });
  await click("Save preferences");
  expect(f.updateProfile).not.toHaveBeenCalled();
  expect(f.onChanged).not.toHaveBeenCalled();
});
it("holds uncertain Save until explicit reload and retains edits across a profile version conflict", async () => {
  const f = await fixture();
  await edit("Urgent notification repeats", "8");
  await f.render({ ...opening, version: 8 });
  expect(input("Urgent notification repeats").value).toBe("8");
  expect(button("Save preferences").disabled).toBe(true);
  await f.render();
  f.updateProfile.mockRejectedValueOnce(new Error("Lost acknowledgement"));
  await click("Save preferences");
  await click("Save preferences");
  expect(f.updateProfile).toHaveBeenCalledTimes(1);
  expect(input("Urgent notification repeats").value).toBe("8");
  await click("Load current preferences");
  expect(input("Urgent notification repeats").value).toBe("2");
  await f.render({ ...opening, version: 9 });
  expect(button("Save preferences").disabled).toBe(false);
});
it("keeps the saved target after a target read failure and does not replace it with an available conversation", async () => {
  const f = await fixture({
    ...opening,
    notificationTelegram: { accountId: "old-account", conversationId: "old-conversation" },
  });
  f.notificationTargets.mockRejectedValueOnce(new Error("Offline"));
  await click("Load Telegram conversations");
  expect(container.textContent).toContain("The saved destination is kept.");
  expect(f.updateProfile).not.toHaveBeenCalled();
  await click("Load Telegram conversations");
  await click("Save preferences");
  expect(f.updateProfile.mock.calls[0][1]).not.toHaveProperty("notificationTelegram");
});
it("prevents overlapping reads and saves while a target preflight is pending", async () => {
  const f = await fixture();
  await click("Load Telegram conversations");
  await choose(JSON.stringify([target.accountId, target.conversationId]));
  let resolve!: (targets: (typeof target)[]) => void;
  f.notificationTargets.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await click("Save preferences");
  await click("Save preferences");
  await click("Load Telegram conversations");
  expect(f.notificationTargets).toHaveBeenCalledTimes(2);
  expect(f.updateProfile).not.toHaveBeenCalled();
  await act(async () => resolve([target]));
  expect(f.updateProfile).toHaveBeenCalledTimes(1);
});
