import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("react-native-svg", () => ({
  default: ({ children, testID, ...props }: { children?: React.ReactNode; testID?: string }) => h("svg", { ...props, "data-testid": testID }, children),
  Circle: () => null, G: () => null,
}));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); });
it("uses DOM decoration semantics on web without leaking native accessibility props", async () => {
  vi.stubEnv("EXPO_OS", "web"); vi.resetModules();
  const { IllustrationFrame } = await import("./frame");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const element = h(IllustrationFrame, { name: "connect-computer", size: 120 });
  const html = renderToStaticMarkup(element);
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toContain("accessibilityElementsHidden");
  expect(html).not.toContain("importantForAccessibility");
  expect(error).not.toHaveBeenCalled();
});
it("keeps native state art out of the screen-reader tree", async () => {
  vi.stubEnv("EXPO_OS", "ios"); vi.resetModules();
  const { IllustrationFrame } = await import("./frame");
  const element = IllustrationFrame({ name: "connect-computer", size: 120 });
  expect(element.props.accessible).toBe(false);
  expect(element.props.accessibilityElementsHidden).toBe(true);
  expect(element.props.importantForAccessibility).toBe("no-hide-descendants");
});
