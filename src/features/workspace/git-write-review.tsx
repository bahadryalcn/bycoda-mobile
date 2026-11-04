import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { Body, Notice, Stack } from "@/ui/primitives";
import { GitDiffViewer } from "./git-diff-viewer";

type Presentation = { title: string; submitLabel: string; machineName: string; root: string; path: string; detail: string; contents: string | null; destructive?: boolean };

/** Caller owns transport and uncertainty; this lifetime binds review to its draft. */
export function useGitWriteReview<T>(owner: unknown, disabled: boolean, current: () => boolean, deliver: (request: T) => void) {
  const lease = useMemo(() => ({ active: false }), [owner, disabled]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  type Pending = Presentation & { request: T; lease: typeof lease };
  const [pending, setPending] = useState<Pending | null>(null), issued = useRef<Pending | null>(null);
  useLayoutEffect(() => { if (issued.current && issued.current.lease !== lease) { issued.current = null; setPending(null); } }, [lease]);
  useLayoutEffect(() => () => { issued.current = null; }, []);
  const cancel = () => { if (issued.current === pending) { issued.current = null; setPending(null); } };
  const confirm = () => {
    if (!pending || issued.current !== pending || pending.lease !== lease || !lease.active || disabled || !current()) return;
    issued.current = null; setPending(null); deliver(pending.request);
  };
  return { pending: pending?.lease === lease && !disabled ? pending : null, cancel,
    open: (value: Presentation & { request: T }) => {
      if (!lease.active || disabled || !current() || issued.current) return;
      const next = { ...value, lease }; issued.current = next; setPending(next);
    },
    element: pending?.lease === lease && !disabled ? <GitWriteReview review={pending} onClose={cancel} onConfirm={confirm} /> : null,
  };
}

export function GitWriteReview({ review, onClose, onConfirm }: { review: Presentation; onClose: () => void; onConfirm: () => void }) {
  const lines = useMemo(() => (review.contents ?? "").split(/\r?\n/).map((text, index) => ({ kind: "same" as const, text, oldLine: index + 1, newLine: index + 1 })), [review.contents]);
  return <ActionReviewSheet title={review.title} submitLabel={review.submitLabel} tone={review.destructive ? "danger" : undefined} onClose={onClose} onConfirm={onConfirm}>
    <Stack><Body selectable>{review.machineName}</Body><Body mono selectable>{review.root}</Body><Body mono selectable>{review.path}</Body>
      <Notice tone={review.destructive ? "warning" : "info"} message={review.detail} />
      {review.contents !== null ? <GitDiffViewer lines={lines} /> : null}
    </Stack>
  </ActionReviewSheet>;
}
