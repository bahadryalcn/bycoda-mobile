// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DevicePermissionSettings } from "./device-permission-settings";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  allow: vi.fn(),
  settings: vi.fn(),
  test: vi.fn(),
  listeners: [] as ((state: string) => void)[],
}));
vi.mock("@/ui/info-hint", () => ({
  useInfoHint: () => ({ button: null, panel: null }),
  HintSection: ({ children }: PropsWithChildren) => createElement("div", null, children),
  InfoHint: () => null,
  InfoPanel: () => null,
  HintLabel: () => null,
  UnitHint: () => null,
  isUnitHint: () => false,
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Linking: { openSettings: mocks.settings },
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.listeners.push(listener);
      return {
        remove: () => {
          mocks.listeners.splice(mocks.listeners.indexOf(listener), 1);
        },
      };
    },
  },
}));
vi.mock("../push/PushSettings", () => ({
  PushSettings: () => null,
  usePushTestFromComputer: () => ({
    action: { error: null },
    disabled: false,
    busy: false,
    run: () => undefined,
  }),
}));
vi.mock("./device-permissions", () => ({
  readDevicePermission: mocks.read,
  allowDevicePermission: mocks.allow,
  testDeviceNotification: mocks.test,
}));
vi.mock("@/state/actions", async () => {
  const { useCallback, useRef, useState } = await import("react");
  const { createSingleFlight } = await import("@/state/single-flight");
  return {
    useAsyncAction: () => {
      const [isPending, setPending] = useState(false);
      const [error, setError] = useState<unknown>(null);
      const flight = useRef(createSingleFlight<unknown>());
      const run = useCallback(
        (action: () => Promise<unknown>) =>
          flight.current.run(async () => {
            setPending(true);
            setError(null);
            try {
              return await action();
            } catch (cause) {
              setError(cause);
              return undefined;
            } finally {
              setPending(false);
            }
          }),
        [],
      );
      return { isPending, run, error, isError: !!error, isSuccess: false };
    },
  };
});
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { muted: "#777" } }) }));
vi.mock("lucide-react-native/icons/bell", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/camera", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/mic", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/image", () => ({ default: () => null }));
vi.mock("@/ui/icon-tile", () => ({
  IconTile: ({ children }: PropsWithChildren) => createElement("span", null, children),
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    SectionHeader: ({ title }: { title: string }) => createElement("h2", null, title),
    Body: Wrapper,
    Stack: Wrapper,
    Row: Wrapper,
    NavigationGroup: Wrapper,
    Section: ({ title, children }: PropsWithChildren<{ title: string }>) =>
      createElement("section", null, createElement("h2", null, title), children),
    MutationState: ({ mutation }: { mutation: { error: unknown } }) =>
      mutation.error instanceof Error ? createElement("p", null, mutation.error.message) : null,
    ValueRow: ({ label, trailing }: { label: string; trailing?: ReactNode }) => createElement("div", { "data-value-row": label }, label, trailing),
    Badge: ({ label }: { label: string }) => createElement("span", { "data-badge": true }, label),
    NavigationRow: ({
      label,
      disabled,
      onPress,
      trailing,
    }: {
      label: string;
      disabled?: boolean;
      onPress: () => void;
      trailing?: ReactNode;
    }) =>
      createElement(
        "div",
        { "data-row": label },
        createElement("button", { disabled, onClick: onPress }, label),
        trailing,
      ),
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => createElement("button", { disabled, onClick: onPress }, label),
    Notice: ({ message, onRetry }: { message: string; onRetry?: () => void }) =>
      createElement(
        "div",
        null,
        createElement("p", null, message),
        onRetry ? createElement("button", { onClick: onRetry }, "Retry") : null,
      ),
  };
});
vi.mock("@/ui/issue-summary", () => ({
  IssueSummary: ({ issues, onRetry }: { issues: Array<string | undefined>; onRetry: () => void }) =>
    issues.some(Boolean)
      ? createElement(
          "div",
          null,
          issues.filter(Boolean).map((issue) => createElement("p", { key: issue }, issue)),
          createElement("button", { onClick: onRetry }, "Retry"),
        )
      : null,
}));
const granted = { granted: true, canAskAgain: true, status: "granted" };
const undetermined = { granted: false, canAskAgain: true, status: "undetermined" };
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
const buttons = () => [...container.querySelectorAll("button")].map((button) => button.textContent);
const find = (text: string) =>
  [...container.querySelectorAll("button")].find((button) => button.textContent === text)!;
// The state badge shown on a permission row; null when the state is unknown.
const badgeOf = (label: string) =>
  container.querySelector(`[data-row="${label}"] [data-badge]`)?.textContent ?? null;
async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root!.render(createElement(DevicePermissionSettings)));
}
beforeEach(() => {
  vi.stubEnv("EXPO_OS", "android");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.clearAllMocks();
  mocks.listeners.length = 0;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("distinguishes a retryable denial from a permission never requested", async () => {
  mocks.read.mockImplementation(async (kind: string) =>
    kind === "camera" ? { granted: false, canAskAgain: true, status: "denied" } : undetermined,
  );
  await render();
  expect(badgeOf("Camera")).toBe("Denied");
  expect(badgeOf("Notifications")).toBe("Not asked");
  expect(mocks.allow).not.toHaveBeenCalled();
});

it("shows microphone denial and lets the owner recover it without an automatic permission prompt", async () => {
  mocks.read.mockImplementation(async (kind: string) => kind === "microphone" ? { granted: false, canAskAgain: false, status: "denied" } : granted);
  mocks.allow.mockResolvedValue(undefined);
  await render();
  expect(badgeOf("Microphone")).toBe("Denied");
  expect(mocks.allow).not.toHaveBeenCalled();
  await act(async () => find("Microphone").click());
  expect(mocks.allow).toHaveBeenCalledExactlyOnceWith("microphone");
});

it("a failing notification read leaves the camera usable, exposes Retry, and never requests a permission on mount", async () => {
  mocks.read.mockImplementation(async (kind: string) => {
    if (kind === "notifications") throw new Error("unavailable");
    return undetermined;
  });
  await render();
  expect(badgeOf("Camera")).toBe("Not asked");
  expect(badgeOf("Notifications")).toBeNull();
  expect(find("Camera").disabled).toBe(false);
  expect(find("Notifications").disabled).toBe(true);
  expect(mocks.allow).not.toHaveBeenCalled();
  expect(mocks.settings).not.toHaveBeenCalled();
  mocks.read.mockResolvedValue(granted);
  await act(async () => find("Retry").click());
  expect(badgeOf("Notifications")).toBe("Granted");
  expect(buttons()).not.toContain("Retry");
  expect(mocks.allow).not.toHaveBeenCalled();
});
it("shows no badge while a read is pending and refreshes again when the app returns to the foreground", async () => {
  let release!: (value: typeof granted) => void;
  mocks.read.mockImplementation((kind: string) =>
    kind === "camera"
      ? new Promise((resolve) => {
          release = resolve as typeof release;
        })
      : Promise.resolve(granted),
  );
  await render();
  expect(badgeOf("Camera")).toBeNull();
  expect(badgeOf("Notifications")).toBe("Granted");
  await act(async () => release(granted));
  expect(badgeOf("Camera")).toBe("Granted");
  mocks.read.mockResolvedValue({ granted: false, canAskAgain: false, status: "denied" });
  await act(async () => mocks.listeners.forEach((listener) => listener("active")));
  expect(badgeOf("Camera")).toBe("Denied");
  expect(mocks.allow).not.toHaveBeenCalled();
});

it("retains every independent permission read failure without requesting permission", async () => {
  mocks.read.mockImplementation(async (kind: string) => {
    throw new Error(`${kind} status unavailable`);
  });
  await render();
  expect(container.textContent).toContain("Camera: camera status unavailable");
  expect(container.textContent).toContain("Notifications: notifications status unavailable");
  expect(mocks.allow).not.toHaveBeenCalled();
  mocks.read.mockResolvedValue(granted);
  await act(async () => find("Retry").click());
  expect(badgeOf("Camera")).toBe("Granted");
  expect(badgeOf("Notifications")).toBe("Granted");
  expect(mocks.allow).not.toHaveBeenCalled();
});

it("keeps a camera operation failure beside Camera when a foreground refresh arrives during that operation", async () => {
  mocks.read.mockResolvedValue(undetermined);
  let reject!: (error: Error) => void;
  mocks.allow.mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  await render();
  await act(async () => find("Camera").click());
  await act(async () => mocks.listeners.forEach((listener) => listener("active")));
  await act(async () => reject(new Error("Camera request failed")));
  const error = [...container.querySelectorAll("p")].find(
    (node) => node.textContent === "Camera request failed",
  )!;
  expect(error).toBeDefined();
  expect(
    error.compareDocumentPosition(find("Notifications")) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(mocks.read).toHaveBeenCalledTimes(3);
  expect(mocks.allow).toHaveBeenCalledExactlyOnceWith("camera");
});

it("shows the photos row as the system picker: no permission is read, requested or offered as an action", async () => {
  mocks.read.mockResolvedValue(granted);
  await render();
  const photos = container.querySelector('[data-row="Photos and files"]');
  expect(photos).toBeNull();
  expect(container.textContent).toContain("Photos and files");
  expect(container.textContent).toContain("System picker");
  expect(buttons()).not.toContain("Photos and files");
  expect(mocks.read.mock.calls.map(([kind]) => kind)).not.toContain("photos");
  expect(mocks.allow).not.toHaveBeenCalled();
});
