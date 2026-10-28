/** Authority is captured from the displayed view, independently of transcript revision. */
export type SessionAuthority = { authorityGeneration?: number };

export function captureSessionAuthority(value: SessionAuthority): SessionAuthority {
  const generation = value.authorityGeneration;
  if (generation !== undefined && (!Number.isSafeInteger(generation) || generation < 1))
    throw new Error("The displayed session authority is invalid. Refresh this session.");
  // Keep an own property even for legacy absence. A later snapshot must not bless it.
  return { authorityGeneration: generation };
}

export function sessionIntent<T extends Record<string, unknown>>(
  displayed: SessionAuthority,
  intent: T,
): T & SessionAuthority {
  return {
    ...intent,
    ...(Object.hasOwn(intent, "authorityGeneration")
      ? captureSessionAuthority({
          authorityGeneration: intent.authorityGeneration as number | undefined,
        })
      : captureSessionAuthority(displayed)),
  };
}

/** A committed authority floor cannot be rolled back by an older pinned history read. */
export function retainSessionAuthority<T extends SessionAuthority>(
  current: SessionAuthority | undefined,
  next: T,
): T {
  const before = current ? captureSessionAuthority(current).authorityGeneration : undefined;
  const after = captureSessionAuthority(next).authorityGeneration;
  return before !== undefined && (after === undefined || before > after)
    ? { ...next, authorityGeneration: before }
    : next;
}
