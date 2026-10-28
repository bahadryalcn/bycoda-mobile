import type { SocialThread } from "@/domain/types";

export const THREAD_PAGE_LIMIT = 20;
export class ThreadPageUnavailable extends Error {
  override name = "ThreadPageUnavailable";
}
export type ThreadPage = SocialThread & { eventsPage: NonNullable<SocialThread["eventsPage"]> };

/** Accept only the bounded full-content page requested for this selected record. */
export function isThreadPage(value: unknown, id: string, offset?: number): value is ThreadPage {
  if (!value || typeof value !== "object") return false;
  const thread = value as ThreadPage;
  const page = thread.eventsPage;
  if (thread.id !== id || thread.eventsPreview !== false || !page ||
    !Number.isInteger(page.total) || page.total < 0 || page.limit !== THREAD_PAGE_LIMIT ||
    !Number.isInteger(page.offset) || page.offset < 0 ||
    page.offset !== (offset === undefined ? Math.max(0, page.total - THREAD_PAGE_LIMIT) : Math.min(offset, Math.max(0, page.total - 1))) ||
    !Array.isArray(thread.events) || thread.events.length !== Math.min(THREAD_PAGE_LIMIT, Math.max(0, page.total - page.offset))) return false;
  return thread.events.every((event) => typeof event?.id === "string" && typeof event.text === "string" &&
    Number.isFinite(event.at) && (event.direction === "inbound" || event.direction === "outbound"));
}
