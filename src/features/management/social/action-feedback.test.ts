// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  socialActionTarget,
  SocialCollectionFeedback,
  SocialRecordFeedback,
} from "./action-feedback";
import { CollectionRows } from "./collection-rows";
import type { SocialPanelContext, SocialCollectionPage } from "./types";
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string) => en,
}));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children }: PropsWithChildren) =>
    createElement("span", null, children),
  Row: ({ children }: PropsWithChildren) =>
    createElement("div", null, children),
  Button: ({ label, onPress }: { label: string; onPress: () => void }) =>
    createElement("button", { onClick: onPress }, label),
  MutationState: ({ mutation, pending }: { mutation: { error?: Error; isPending?: boolean }; pending?: string }) => mutation.isPending ? createElement("p", null, pending) : mutation.error ? createElement("p", null, mutation.error.message) : null,
}));
it.each([
  ["drafts.approve", "drafts"],
  ["replies.send", "drafts"],
  ["messages.send", "drafts"],
  ["comments.send", "drafts"],
  ["campaigns.pause", "campaigns"],
  ["campaigns.approveReviewed", "campaigns"],
  ["campaigns.schedule", "campaigns"],
  ["automations.pause", "rules"],
  ["automations.activate", "rules"],
  ["jobs.cancel", "jobs"],
  ["jobs.retry", "jobs"],
])(
  "routes only the matching social record family: %s",
  (action, collection) => {
    expect(socialActionTarget({ action, input: { id: "same-id" } })).toEqual({
      collection,
      id: "same-id",
    });
  },
);
it("leaves unknown, inherited and malformed targets with the screen owner", () => {
  for (const variables of [
    undefined,
    { action: "constructor", input: { id: "x" } },
    { action: "future.operation", input: { id: "x" } },
    { action: "jobs.retry", input: [] },
    { action: "jobs.retry", input: { id: "" } },
    { action: "jobs.retry", input: { id: 1 } },
  ])
    expect(socialActionTarget(variables)).toBeUndefined();
});
it("keeps one recoverable error across local batches, filtering and a loading host page without dispatch", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"),
    root = createRoot(container),
    mutate = vi.fn();
  const action = {
    variables: { action: "jobs.retry", input: { id: "job-20" } },
    error: new Error("Retry failed"),
    mutate,
  } as unknown as SocialPanelContext["action"];
  const items = Array.from({ length: 21 }, (_, i) => ({ id: `job-${i}` }));
  const render = (visible: typeof items, page?: SocialCollectionPage) =>
    root.render(
      createElement(CollectionRows<{ id: string }>, {
        items: visible,
        page,
        beforeRows: (rows) =>
          createElement(SocialCollectionFeedback, {
            action,
            collection: "jobs",
            visible: rows,
          }),
        renderItem: (item) =>
          createElement(
            "section",
            { key: item.id, "data-record": item.id },
            createElement(SocialRecordFeedback, {
              action,
              collection: "jobs",
              id: item.id,
            }),
            createElement(SocialRecordFeedback, {
              action,
              collection: "drafts",
              id: item.id,
            }),
          ),
      }),
    );
  try {
    await act(async () => render(items));
    expect(container.querySelector('[data-record="job-20"]')).toBeNull();
    expect(container.textContent?.match(/Retry failed/g)).toHaveLength(1);
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector('[data-record="job-20"]')?.textContent).toBe(
      "Retry failed",
    );
    expect(container.textContent?.match(/Retry failed/g)).toHaveLength(1);
    await act(async () => render([]));
    expect(container.querySelector("section")).toBeNull();
    expect(container.textContent?.match(/Retry failed/g)).toHaveLength(1);
    await act(async () =>
      render(items, {
        search: "",
        setSearch: vi.fn(),
        loading: true,
        busy: false,
        invalidSearch: false,
        onOffset: vi.fn(),
      }),
    );
    expect(container.querySelector("section")).toBeNull();
    expect(container.textContent?.match(/Retry failed/g)).toHaveLength(1);
    expect(mutate).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});


it("keeps a pending operation visible when its target is not in the rendered batch", () => {
 const action = { variables: { action: "jobs.retry", input: { id: "off-list" } }, isPending: true } as unknown as SocialPanelContext["action"];
 const html = renderToStaticMarkup(createElement(SocialCollectionFeedback, { action, collection: "jobs", visible: [] }));
 expect(html).toContain("Working…");
});
