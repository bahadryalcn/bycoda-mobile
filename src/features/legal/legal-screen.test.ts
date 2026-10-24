import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { LegalScreen } from "./legal-screen";

const navigation = vi.hoisted(() => ({ canGoBack: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock("expo-router", () => ({ router: navigation, Stack: { Screen: "stack-screen" }, useLocalSearchParams: () => ({ document: "unknown-document" }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({ Body: "body", Button: "button", Card: "card", Screen: "screen" }));
vi.mock("./legal-document", () => ({ isLegalDocument: () => false }));
beforeEach(() => vi.clearAllMocks());

it.each([true, false])("recovers an unknown legal document (history: %s)", (history) => {
  navigation.canGoBack.mockReturnValue(history);
  const screen = LegalScreen() as ReactElement<{ children: ReactElement[] }>;
  const card = screen.props.children[1] as ReactElement<{ children: ReactElement[] }>;
  const button = card.props.children[1] as ReactElement<{ onPress: () => void }>;
  button.props.onPress();
  if (history) { expect(navigation.back).toHaveBeenCalledOnce(); expect(navigation.replace).not.toHaveBeenCalled(); }
  else { expect(navigation.back).not.toHaveBeenCalled(); expect(navigation.replace).toHaveBeenCalledWith("/"); }
});
