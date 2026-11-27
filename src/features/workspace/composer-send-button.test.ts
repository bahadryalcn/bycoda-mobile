// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ComposerSendButton } from "./composer-send-button";

type ButtonProps = {
  label: string;
  hint?: string;
  disabled?: boolean;
  busy?: boolean;
  onPress(): void;
  onLongPress?: () => void;
  longPressLabel?: string;
};
type Option = { key: string; label: string; detail?: string; selected?: boolean; disabled?: boolean; onPress(): void };
type SheetProps = { open: boolean; label: string; items: Option[]; onClose(): void };
const state = vi.hoisted(() => ({
  toast: vi.fn(),
  haptic: vi.fn(),
  button: undefined as ButtonProps | undefined,
  sheet: undefined as SheetProps | undefined,
}));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/corner-down-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/list-plus", () => ({ default: () => null }));
vi.mock("@/ui/chat-controls", () => ({ ChatCircleAction: (props: ButtonProps) => { state.button = props; return null; } }));
vi.mock("@/ui/anchored-menu", () => ({ AnchoredMenu: (props: SheetProps) => { state.sheet = props; return null; } }));
vi.mock("react-native", () => ({ View: ({ children }: { children?: unknown }) => children }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string>) => en.replace(/\{(p\d+)\}/g, (_match, key: string) => values?.[key] ?? key) }));
vi.mock("@/ui/motion", () => ({ haptic: { select: state.haptic } }));
vi.mock("@/ui/toast", () => ({ showToast: state.toast }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));

let root: Root, node: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div");
  root = createRoot(node);
});
afterEach(() => {
  act(() => root.unmount());
  state.toast.mockReset(); state.haptic.mockReset();
  state.button = undefined; state.sheet = undefined;
  vi.unstubAllGlobals();
});
const render = (props: Partial<Parameters<typeof ComposerSendButton>[0]> = {}) => {
  act(() => root.render(createElement(ComposerSendButton, { mode: "steer", alternate: "queue", disabled: false, busy: false, onSend: vi.fn(), ...props })));
  return state.button!;
};
const choose = (key: string) => act(() => state.sheet!.items.find((option) => option.key === key)!.onPress());

it("shows the default mode on tap and opens the anchored Steer now / Queue menu on long press", () => {
  const send = vi.fn();
  const button = render({ onSend: send });
  expect(button.label).toBe("Steer");
  expect(button.longPressLabel).toBe("Choose how to send");
  expect(button.hint).toBe("Press and hold to choose Steer now or Queue.");
  expect(state.sheet?.open).toBe(false);
  act(() => button.onLongPress!());
  expect(send).not.toHaveBeenCalled();
  expect(state.haptic).toHaveBeenCalledOnce();
  expect(state.sheet?.open).toBe(true);
  expect(state.sheet?.label).toBe("Choose how to send");
  expect(state.sheet?.items.map((option) => [option.label, option.detail, option.selected])).toEqual([
    ["Steer now", "Interrupts what the agent is doing", true],
    ["Queue", "Runs after the current turn", false],
  ]);
  choose("queue");
  expect(send).toHaveBeenCalledExactlyOnceWith("queue");
  expect(state.toast).not.toHaveBeenCalled();
});
it("marks queue as the default when Settings prefers it, and tap keeps the default", () => {
  const send = vi.fn();
  const button = render({ mode: "queue", alternate: "steer", onSend: send });
  expect(button.label).toBe("Queue");
  act(() => button.onPress());
  act(() => state.button!.onLongPress!());
  expect(state.sheet?.items.find((option) => option.selected)?.key).toBe("queue");
  choose("steer");
  expect(send.mock.calls).toEqual([[], ["steer"]]);
});
it.each([{ disabled: true }, { busy: true }])("offers no long press while disabled or busy, and tap does nothing: %j", (props) => {
  const send = vi.fn();
  const button = render({ ...props, onSend: send });
  act(() => button.onPress());
  expect(button.onLongPress).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
  expect(state.haptic).not.toHaveBeenCalled();
  expect(state.sheet?.open).toBe(false);
  expect(button.disabled).toBe(!!props.disabled);
  expect(button.busy).toBe(!!props.busy);
});
it("offers no choice when only one mode can be delivered or the agent is idle", () => {
  for (const props of [{ mode: "send" as const, alternate: null }, { mode: "steer" as const, alternate: null }]) {
    const button = render(props);
    expect(button.onLongPress).toBeUndefined();
    expect(button.longPressLabel).toBeUndefined();
    expect(button.hint).toBeUndefined();
  }
});
it("retires an open choice when the run ends and does not reopen it for the next run", () => {
  const button = render();
  act(() => button.onLongPress!());
  expect(state.sheet?.open).toBe(true);
  render({ mode: "send", alternate: null });
  expect(state.sheet?.open).toBe(false);
  render();
  expect(state.sheet?.open).toBe(false);
});
it("closes an open choice when the draft stops being sendable", () => {
  const button = render();
  act(() => button.onLongPress!());
  render({ disabled: true });
  expect(state.sheet?.open).toBe(false);
});
