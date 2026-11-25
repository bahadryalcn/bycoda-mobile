import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("react-native", () => ({ Appearance: { setColorScheme: fixture.set } }));
import { applyNativeColorScheme, nativeColorScheme } from "./native-appearance";

beforeEach(() => { fixture.set.mockClear(); vi.unstubAllEnvs(); });

it("overrides the native appearance for an explicit app theme and clears it for System", () => {
  expect(nativeColorScheme("dark")).toBe("dark");
  expect(nativeColorScheme("light")).toBe("light");
  expect(nativeColorScheme("system")).toBe("auto");
});

it("applies the choice natively but leaves the web page alone", () => {
  vi.stubEnv("EXPO_OS", "ios");
  applyNativeColorScheme("dark");
  expect(fixture.set).toHaveBeenCalledExactlyOnceWith("dark");
  vi.stubEnv("EXPO_OS", "web");
  applyNativeColorScheme("light");
  expect(fixture.set).toHaveBeenCalledOnce();
});
