import { afterEach, expect, it, vi } from "vitest";
import { ComposerSendButton } from "./composer-send-button";
const state = vi.hoisted(() => ({ toast: vi.fn(), haptic: vi.fn() }));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/corner-down-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/list-plus", () => ({ default: () => null }));
vi.mock("@/ui/chat-controls", () => ({ ChatCircleAction: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string>) => en.replace(/\{(p\d+)\}/g, (_match, key: string) => values?.[key] ?? key) }));
vi.mock("@/ui/motion", () => ({ haptic: { select: state.haptic } }));
vi.mock("@/ui/toast", () => ({ showToast: state.toast }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
afterEach(() => { state.toast.mockReset(); state.haptic.mockReset(); });
const render = (props: Partial<Parameters<typeof ComposerSendButton>[0]> = {}) => ComposerSendButton({ mode: "steer", alternate: "queue", disabled: false, busy: false, onSend: vi.fn(), ...props });

it("does not announce success after a void alternate submission callback", () => {
  const send = vi.fn(); const view = render({ onSend: send });
  view.props.onLongPress();
  expect(send).toHaveBeenCalledExactlyOnceWith("queue");
  expect(state.haptic).toHaveBeenCalledOnce();
  expect(state.toast).not.toHaveBeenCalled();
  expect(view.props.longPressLabel).toBe("Queue");
  expect(view.props.hint).toBe("Press and hold for Queue");
});
it("does not infer delivery from an unresolved send promise", async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const send = vi.fn(() => pending); const view = render({ onSend: send });
  view.props.onLongPress();
  expect(state.toast).not.toHaveBeenCalled();
  finish(); await pending;
  expect(state.toast).not.toHaveBeenCalled();
});
it("keeps tap on current mode and long press on its named alternate", () => {
  const send = vi.fn(); const view = render({ mode: "queue", alternate: "steer", onSend: send });
  view.props.onPress(); view.props.onLongPress();
  expect(send.mock.calls).toEqual([[], ["steer"]]);
  expect(view.props.label).toBe("Queue");
  expect(view.props.longPressLabel).toBe("Steer");
  expect(state.haptic).toHaveBeenCalledOnce();
});
it.each([{ disabled: true }, { busy: true }])("retains disabled/busy protection for alternate accessibility callbacks: %j", props => {
  const send = vi.fn(); const view = render({ ...props, onSend: send });
  view.props.onPress(); view.props.onLongPress?.();
  expect(send).not.toHaveBeenCalled();
  expect(state.haptic).not.toHaveBeenCalled();
  expect(view.props.disabled).toBe(!!props.disabled);
  expect(view.props.busy).toBe(!!props.busy);
});
it("has no alternate action when no eligible alternate exists", () => {
  const view = render({ mode: "send", alternate: null });
  expect(view.props.onLongPress).toBeUndefined();
  expect(view.props.longPressLabel).toBeUndefined();
});
