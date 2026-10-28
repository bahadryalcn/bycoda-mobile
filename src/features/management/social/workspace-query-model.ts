import type { SocialCollection, SocialPage, SocialSnapshot, SocialWorkspaceQuery, SocialWorkspaceResponse } from "../../../../../src/features/social/model/social";
import type { SocialTab } from "../social-flow";

export const SOCIAL_PAGE_LIMIT = 20;
export const SOCIAL_SEARCH_LIMIT = 1000;
export const socialCollections: Partial<Record<SocialTab, SocialCollection>> = {
  inbox: "threads", drafts: "drafts", campaigns: "campaigns", automations: "rules", jobs: "jobs",
};
const sections = { inbox: "inbox", drafts: "inbox", accounts: "accounts", campaigns: "campaigns", automations: "rules", jobs: "history" } as const;

export class WorkspaceQueryError extends Error {
  constructor(readonly code: "unsupported" | "scope" | "response" | "search", message: string = code) {
    super(message);
  }
}

export function workspaceSearch(value: string) {
  const query = value.trim();
  return { query, invalid: query.length > SOCIAL_SEARCH_LIMIT };
}

export function workspaceInput(tab: SocialTab, projectId: string | null, offset: number, search: string): SocialWorkspaceQuery {
  const { query, invalid } = workspaceSearch(search);
  if (invalid) throw new WorkspaceQueryError("search");
  if (!Number.isSafeInteger(offset) || offset < 0) throw new WorkspaceQueryError("response");
  const collection = socialCollections[tab];
  return {
    section: sections[tab], limit: SOCIAL_PAGE_LIMIT,
    ...(projectId ? { projectId } : {}),
    ...(collection ? { offsets: { [collection]: offset }, ...(query ? { filters: { [collection]: { query } } } : {}) } : {}),
  };
}

export function pageNavigation(page: SocialPage) {
  return {
    previous: Math.max(0, page.offset - page.limit),
    next: page.offset + page.limit,
    hasPrevious: page.offset > 0,
    hasNext: page.offset + page.limit < page.total,
    first: page.total ? page.offset + 1 : 0,
    last: Math.min(page.offset + page.limit, page.total),
  };
}

function assertSnapshot(snapshot: SocialSnapshot, environmentId: string, limit: number) {
  if (!snapshot || snapshot.executorId !== environmentId) throw new WorkspaceQueryError("scope");
  const collections: SocialCollection[] = ["campaigns", "publishingPlans", "threads", "contacts", "rules", "jobs", "drafts"];
  if (!Array.isArray(snapshot.accounts) || !Array.isArray(snapshot.profiles) || !snapshot.pages)
    throw new WorkspaceQueryError("response");
  for (const collection of collections) {
    const rows = snapshot[collection];
    const page = snapshot.pages[collection];
    if (!Array.isArray(rows) || rows.length > limit || !page ||
      !Number.isSafeInteger(page.offset) || page.offset < 0 ||
      !Number.isSafeInteger(page.total) || page.total < 0 || page.limit !== limit ||
      (page.total === 0 ? page.offset !== 0 : page.offset >= page.total)) throw new WorkspaceQueryError("response");
  }
  for (const thread of snapshot.threads) {
    if (thread.eventsPreview !== true || !Array.isArray(thread.events) || thread.events.length > 1 ||
      thread.events.some((event) => typeof event.text !== "string" || Array.from(event.text).length > 300))
      throw new WorkspaceQueryError("response");
  }
}

/** A cache belongs to one reviewed connection; cursors never cross query or machine identity. */
export class SocialWorkspaceCache {
  private pages = new Map<string, { cursor: string; snapshot: SocialSnapshot }>();
  private latestSnapshot?: SocialSnapshot;
  latest() { return this.latestSnapshot; }

  async read(input: SocialWorkspaceQuery, environmentId: string, request: (input: SocialWorkspaceQuery) => Promise<unknown>, isCurrent: () => boolean) {
    if (!isCurrent()) throw new WorkspaceQueryError("scope");
    const key = JSON.stringify(input);
    const previous = this.pages.get(key);
    let raw: unknown;
    try { raw = await request({ ...input, ...(previous ? { cursor: previous.cursor } : {}) }); }
    catch (error) {
      if (!isCurrent()) throw new WorkspaceQueryError("scope");
      if (error instanceof Error && /Unsupported social operation\b/.test(error.message)) throw new WorkspaceQueryError("unsupported");
      throw error;
    }
    if (!isCurrent()) throw new WorkspaceQueryError("scope");
    const response = raw as SocialWorkspaceResponse;
    if (!response || typeof response.cursor !== "string" || !response.cursor || typeof response.unchanged !== "boolean" ||
      (response.unchanged && !previous)) throw new WorkspaceQueryError("response");
    const snapshot = response.unchanged ? previous!.snapshot : response.snapshot;
    if (!snapshot) throw new WorkspaceQueryError("response");
    assertSnapshot(snapshot, environmentId, input.limit ?? SOCIAL_PAGE_LIMIT);
    this.pages.delete(key);
    this.pages.set(key, { cursor: response.cursor, snapshot });
    if (this.pages.size > 16) this.pages.delete(this.pages.keys().next().value!);
    this.latestSnapshot = snapshot;
    return snapshot;
  }
}
