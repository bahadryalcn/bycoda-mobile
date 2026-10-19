import { beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("react-native-reanimated", () => ({ default: { View: "AnimatedView" } }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("./motion", () => ({ reveal: undefined }));
vi.mock("./typography", () => ({ Body: "Body" }));
vi.mock("./layout", () => ({ Row: "Row" }));
vi.mock("./buttons", () => ({ Button: "Button" }));
vi.mock("./styles", () => ({ uiStyles: {} }));
vi.mock("panelui-native/components/badge", () => ({ Badge: "Badge" }));
vi.mock("panelui-native/components/spinner", () => ({ Spinner: "Spinner" }));
vi.mock("panelui-native/components/alert", () => ({ Alert: "Alert" }));
vi.mock("panelui-native/components/skeleton", () => ({ Skeleton: "Skeleton" }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark" }) }));
vi.mock("./tokens", () => ({ colors: {}, semanticColors: {}, space: {} }));
vi.mock("lucide-react-native/icons/info", () => ({ default: "Info" }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: "CircleCheck" }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: "TriangleAlert" }));
vi.mock("lucide-react-native/icons/circle-alert", () => ({ default: "CircleAlert" }));

import { RemoteHostError } from "../remote/host-error";
import { ErrorText, ErrorNotice } from "./feedback";
import { QueryState } from "./query-state";

describe("shared feedback error rendering", () => {
  beforeEach(() => {
    locale.value = "tr";
  });

  it("uses identical Turkish transport copy in inline, notice, and query errors", () => {
    const error = new RemoteHostError("machine", "network", "Raw English transport error");
    const expected = "Bilgisayara ulaşılamadı. Bağlantıyı kontrol edip yeniden dene.";
    expect(ErrorText({ error })?.props.children).toBe(expected);
    expect(ErrorNotice({ error })?.props.message).toBe(expected);
    const query = QueryState({ query: { error, status: "error" } });
    expect(query?.type).toBe(ErrorNotice);
    expect(ErrorNotice(query!.props)?.props.message).toBe(expected);
  });

  it("uses the selected locale rather than the incoming error language", () => {
    locale.value = "en";
    const error = new RemoteHostError("machine", "aborted", "İptal");
    expect(ErrorText({ error })?.props.children).toBe("Request cancelled.");
  });

  it("retains caller context and uncertain-outcome caution in both feedback components", () => {
    const error = new RemoteHostError("machine", "timeout", "Raw English timeout", true);
    const message = "Ek yüklemesi kesildi.";
    const expected = `${message}\n\nİşlem uygulanmış olabilir. Yeniden denemeden önce sonucu kontrol et.`;
    expect(ErrorText({ error, message })?.props.children).toBe(expected);
    expect(ErrorNotice({ error, message })?.props.message).toBe(expected);
  });

  it("preserves detailed validation errors and supplied retry actions", () => {
    const error = new Error("Branch review/ui already exists.");
    const refetch = vi.fn();
    const query = QueryState({ query: { error, status: "error", refetch } });
    const notice = ErrorNotice(query!.props);
    expect(notice?.props.message).toBe(error.message);
    notice?.props.onRetry();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("retains connection-repair actions for actual transport identity errors", () => {
    const error = new RemoteHostError("machine", "identity", "Identity changed.");
    const query = QueryState({ query: { error, status: "error", refetch: vi.fn() } });
    expect(query?.props.onRetry).toBeUndefined();
    expect(query?.props.children).toBeTruthy();
  });

  it("does not turn a local validation kind into a connection-repair action", () => {
    const error = Object.assign(new Error("Name is not allowed."), { kind: "auth" });
    const query = QueryState({ query: { error, status: "error", refetch: vi.fn() } });
    expect(query?.props.onRetry).toBeTypeOf("function");
    expect(query?.props.children).toBeNull();
    expect(ErrorNotice(query!.props)?.props.message).toBe(error.message);
  });

  it("renders no alert without an error", () => {
    expect(ErrorText({ error: null })).toBeNull();
    expect(ErrorNotice({ error: undefined })).toBeNull();
  });
});
