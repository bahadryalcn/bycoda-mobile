// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { useAnimationLead } from "./animation-lead";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const seen = new Map<string, boolean>();
function Probe({ name, wants, priority }: { name: string; wants: boolean; priority?: number }) {
  seen.set(name, useAnimationLead(wants, priority));
  return null;
}
const tree = (items: { name: string; wants: boolean; priority?: number }[]) =>
  createElement("div", null, ...items.map((item) => createElement(Probe, { key: item.name, ...item })));

it("lets one busy indicator animate at a time, preferring the highest priority", () => {
  const root = createRoot(document.createElement("div"));
  act(() => root.render(tree([{ name: "row", wants: true }, { name: "writing", wants: true, priority: 1 }])));
  expect(seen).toEqual(new Map([["row", false], ["writing", true]]));
  act(() =>
    root.render(
      tree([
        { name: "row", wants: true },
        { name: "writing", wants: true, priority: 1 },
        { name: "bar", wants: true, priority: 2 },
      ]),
    ),
  );
  expect(seen).toEqual(new Map([["row", false], ["writing", false], ["bar", true]]));
  // A paused or hidden lead hands motion to the next one.
  act(() =>
    root.render(
      tree([
        { name: "row", wants: true },
        { name: "writing", wants: true, priority: 1 },
        { name: "bar", wants: false, priority: 2 },
      ]),
    ),
  );
  expect(seen).toEqual(new Map([["row", false], ["writing", true], ["bar", false]]));
  act(() => root.unmount());
});
