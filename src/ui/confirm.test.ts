import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ cancel: "Vazgeç" }));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("../i18n", () => ({ tr: () => state.cancel }));
import { Alert } from "react-native";
import { confirmAction } from "./confirm";

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("confirmation intent and authority", () => {
  it("localizes cancel and keeps deletion destructive without executing it", () => {
    vi.stubEnv("EXPO_OS", "android");
    const remove = vi.fn();
    confirmAction("Sil", "Kayıt silinecek", "Sil", remove);
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2]!;
    expect(buttons[0]).toMatchObject({ text: "Vazgeç", style: "cancel" });
    expect(buttons[1]).toMatchObject({ style: "destructive" });
    expect(remove).not.toHaveBeenCalled();
    buttons[1]!.onPress?.();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("ordinary start still requires confirmation and uses ordinary styling", () => {
    vi.stubEnv("EXPO_OS", "ios");
    const start = vi.fn();
    confirmAction("Başlat", "Bilgisayarda çalışır", "Başlat", start, undefined, "default");
    expect(vi.mocked(Alert.alert).mock.calls[0]![2]![1]).toMatchObject({ style: "default" });
    expect(start).not.toHaveBeenCalled();
  });

  it("preserves explicit cancel labels", () => {
    confirmAction("Delete", "Review", "Delete", vi.fn(), "Keep editing");
    expect(vi.mocked(Alert.alert).mock.calls[0]![2]![0]!.text).toBe("Keep editing");
  });

  it("never dispatches when a web confirmation is declined", () => {
    vi.stubEnv("EXPO_OS", "web");
    const accept = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", accept);
    const dispatch = vi.fn();
    confirmAction("Start", "Review target", "Start", dispatch, undefined, "default");
    expect(dispatch).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    accept.mockReturnValue(true);
    confirmAction("Start", "Review target", "Start", dispatch, undefined, "default");
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
