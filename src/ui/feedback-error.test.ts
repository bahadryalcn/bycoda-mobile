import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./use-feedback-animation", () => ({ useFeedbackAnimation: () => false }));
vi.mock("./use-delayed-visible", () => ({ useDelayedVisible: () => true }));
const locale = vi.hoisted(() => ({ value: "tr" }));
vi.mock("./copy", () => ({
  useCopy: () => (tr: string, en: string) => (locale.value === "tr" ? tr : en),
}));
vi.mock("react-native", () => ({
  StyleSheet: { flatten: (value: unknown) => value },
  ActivityIndicator: "ActivityIndicator",
  Text: "Text",
  View: "View",
}));
const handoff = vi.hoisted(() => ({ mounted: true }));
vi.mock("react-native-reanimated", () => ({ default: { View: "AnimatedView" }, useAnimatedStyle: () => ({}) }));
vi.mock("panelui-native/hooks/use-skeleton-handoff", () => ({ useSkeletonHandoff: () => ({ mounted: handoff.mounted, opacity: { value: 1 } }) }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("./motion", () => ({ reveal: undefined }));
vi.mock("./typography", () => ({ Body: "Body" }));
vi.mock("./state-view", () => ({ StateView: "StateView" }));
vi.mock("./toast", () => ({ showToast: vi.fn(), useToastAvailable: () => false }));
vi.mock("./layout", () => ({ Row: "Row" }));
vi.mock("./buttons", () => ({ Button: "Button" }));
vi.mock("./styles", () => ({ uiStyles: {} }));
vi.mock("panelui-native/components/badge", () => ({ Badge: "Badge" }));
vi.mock("panelui-native/components/spinner", () => ({ Spinner: "Spinner" }));
vi.mock("panelui-native/components/alert", () => ({ Alert: "Alert" }));
vi.mock("panelui-native/components/skeleton", () => ({ Skeleton: "Skeleton" }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("./tokens", () => ({ colors: {}, semanticColors: {}, space: {}, radii: {}, metrics: {} }));
vi.mock("lucide-react-native/icons/info", () => ({ default: "Info" }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: "CircleCheck" }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: "TriangleAlert" }));
vi.mock("lucide-react-native/icons/circle-alert", () => ({ default: "CircleAlert" }));

import { RemoteHostError } from "../remote/host-error";
import { ErrorText, ErrorNotice, FieldError, Skeleton, Loading } from "./feedback";
import { StateView } from "./state-view";
import { QueryState } from "./query-state";
/** QueryState keeps a Skeleton mounted for its hand-off: it is the result only while loading. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test probe reads arbitrary element props
type Rendered = { type: unknown; props: any } | null;
function unwrap(tree: ReturnType<typeof QueryState>): Rendered {
  const children = (tree?.props as { children: Rendered | Rendered[] }).children;
  if (!Array.isArray(children)) return children;
  const [skeleton, node = null] = children;
  return skeleton?.props.loading ? skeleton : node;
}
function renderQuery(props: ComponentProps<typeof QueryState>) {
  let result: Rendered = null;
  function Probe() { result = unwrap(QueryState(props)); return null; }
  renderToStaticMarkup(createElement(Probe));
  return result as Rendered;
}
function renderSkeleton(props: ComponentProps<typeof Skeleton>) {
  let result: ReturnType<typeof Skeleton> = null;
  function Probe() { result = Skeleton(props); return null; }
  renderToStaticMarkup(createElement(Probe));
  return result as ReturnType<typeof Skeleton>;
}

import { router } from "expo-router";

describe("shared feedback error rendering", () => {
  beforeEach(() => {
    locale.value = "tr";
  });

  it("uses identical Turkish transport copy in inline, notice, and query errors", () => {
    const error = new RemoteHostError("machine", "network", "Raw English transport error");
    const expected = "Bilgisayara ulaşılamadı. Bağlantıyı kontrol edip yeniden dene.";
    expect(ErrorText({ error })?.props.message).toBe(expected);
    expect(ErrorNotice({ error })?.props.message).toBe(expected);
    const query = renderQuery({ query: { error, status: "error" } });
    expect(query?.type).toBe(StateView);
    expect(query?.props.description).toBe(expected);
    expect(query?.props.illustration).toBe("unreachable");
    expect(ErrorText({ error })?.type).toBe(FieldError);
  });

  it("uses the selected locale rather than the incoming error language", () => {
    locale.value = "en";
    const error = new RemoteHostError("machine", "aborted", "İptal");
    expect(ErrorText({ error })?.props.message).toBe("Request cancelled.");
  });

  it("retains caller context and uncertain-outcome caution in both feedback components", () => {
    const error = new RemoteHostError("machine", "timeout", "Raw English timeout", true);
    const message = "Ek yüklemesi kesildi.";
    const expected = `${message}\n\nİşlem uygulanmış olabilir. Yeniden denemeden önce sonucu kontrol et.`;
    expect(ErrorText({ error, message })?.props.message).toBe(expected);
    expect(ErrorNotice({ error, message })?.props.message).toBe(expected);
  });

  it("preserves detailed validation errors and supplied retry actions", () => {
    const error = new Error("Branch review/ui already exists.");
    const refetch = vi.fn();
    const query = renderQuery({ query: { error, status: "error", refetch } });
    expect(query?.props.description).toBe(error.message);
    expect(query?.props.illustration).toBe("error");
    query?.props.action.onPress();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("retains connection-repair actions for actual transport identity errors", () => {
    const error = new RemoteHostError("machine", "identity", "Identity changed.");
    const query = renderQuery({ query: { error, status: "error", refetch: vi.fn() } });
    expect(query?.props.action.label).toBe("Bağlantıları yönet");
    expect(query?.props.illustration).toBe("locked");
    query?.props.action.onPress();
    expect(router.navigate).toHaveBeenCalledWith("/machines");
  });

  it("does not turn a local validation kind into a connection-repair action", () => {
    const error = Object.assign(new Error("Name is not allowed."), { kind: "auth" });
    const query = renderQuery({ query: { error, status: "error", refetch: vi.fn() } });
    expect(query?.props.action.label).toBe("Yeniden dene");
    expect(query?.props.description).toBe(error.message);
  });

  it("renders no alert without an error", () => {
    expect(ErrorText({ error: null })).toBeNull();
    expect(ErrorNotice({ error: undefined })).toBeNull();
  });

  it("dissolves a shown skeleton as an inert overlay after loading and drops it once faded", () => {
    handoff.mounted = true;
    const fading = renderSkeleton({ loading: false })!;
    expect(fading.props.pointerEvents).toBe("none");
    expect(fading.props.accessibilityRole).toBeUndefined();
    handoff.mounted = false;
    expect(renderSkeleton({ loading: false })).toBeNull();
    expect(renderSkeleton({ loading: true })).not.toBeNull();
    handoff.mounted = true;
  });

  it("announces the actual loading dependency with the shared skeleton or inline loader", () => {
    const query = { status: "pending" as const, fetchStatus: "fetching" as const, isPending: true };
    const skeleton = renderQuery({ query, loadingLabel: "Verifying project…" });
    expect(skeleton?.type).toBe(Skeleton);
    expect(skeleton?.props.label).toBe("Verifying project…");
    expect(renderSkeleton(skeleton!.props)!.props.accessibilityLabel).toBe("Verifying project…");
    const inline = renderQuery({ query, loading: "inline", loadingLabel: "Loading sessions…" });
    expect(inline?.type).toBe(Loading);
    expect(Loading(inline!.props).props.accessibilityLabel).toBe("Loading sessions…");
  });
});
