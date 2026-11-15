// @vitest-environment jsdom
import { act, createElement, useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TranscriptRow } from "./transcript-row";

const renders = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("./transcript-block", async () => {
  const { memo } = await import("react");
  return {
    TranscriptBlock: memo(({ block }: { block: { id: string } }) => {
      renders.ids.push(block.id);
      return null;
    }),
  };
});
vi.mock("./activity-group", () => ({ ActivityGroup: () => null }));
vi.mock("./system-failure-card", () => ({ SystemFailureCard: () => null }));
vi.mock("./turn-chrome", () => ({ ModelSwitchDivider: () => null, ModelSwitchRow: () => null, TurnFooter: () => null }));
vi.mock("react-native", () => ({ View: (p: { children?: unknown }) => p.children ?? null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/tokens", () => ({ metrics: { toolRowHeight: 1 }, space: { xxs: 1, row: 1 } }));

const items = ["a", "b", "c"].map((id) => ({
  kind: "message" as const,
  id,
  author: undefined,
  block: { id, role: "assistant", text: id, remoteContent: { digest: id } },
}));
let setRevision: (n: number) => void;
let seen: () => number | undefined;
function Harness() {
  const [revision, set] = useState(1);
  setRevision = set;
  const ref = useRef(revision);
  ref.current = revision;
  const getRevision = useCallback(() => ref.current, []);
  seen = getRevision;
  const noop = useCallback(() => {}, []);
  const responseText = useCallback(() => undefined, []);
  const scope = useRef({ machineId: "m", sessionId: "s" }).current;
  return createElement(
    "div",
    null,
    items.map((item) =>
      createElement(TranscriptRow, {
        key: item.id,
        item: item as never,
        highlighted: false,
        live: false,
        getRevision,
        responseText,
        scope,
        disabled: false,
        onCommand: noop as never,
        onInspect: noop,
      }),
    ),
  );
}
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  renders.ids.length = 0;
  vi.unstubAllGlobals();
});

it("does not re-render unchanged remote-content rows on a revision-only update", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  await act(async () => root!.render(createElement(Harness)));
  expect(renders.ids).toEqual(["a", "b", "c"]);
  await act(async () => setRevision(2));
  expect(renders.ids).toEqual(["a", "b", "c"]);
  expect(seen()).toBe(2);
});
