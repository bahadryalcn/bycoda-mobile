import { useState } from "react";
import { sourceSlice } from "./message-code-model";
export const SOURCE_PAGE_SIZE = 12_000;

/** Bound native text work without truncating the source or resurrecting an obsolete page. */
export function useSourcePages(source: string) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(source.length / SOURCE_PAGE_SIZE));
  const current = Math.max(0, Math.min(page, pages - 1));
  if (page !== current) setPage(current);
  return { page: current, pages, setPage, text: sourceSlice(source, current * SOURCE_PAGE_SIZE, (current + 1) * SOURCE_PAGE_SIZE) };
}
