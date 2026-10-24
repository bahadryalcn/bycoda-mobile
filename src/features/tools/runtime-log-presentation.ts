export const LOG_SEARCH_LIMIT = 512;
export const LOG_DETAILS_LIMIT = 16_000;

/** Keep the entered draft intact; an invalid filter must not issue a different search. */
export function logSearch(value: string) {
  const query = value.trim();
  return { query, tooLong: query.length > LOG_SEARCH_LIMIT };
}

export function logDetails(value: unknown) {
  const serialized = JSON.stringify(value, null, 2) ?? "";
  return {
    text: serialized.slice(0, LOG_DETAILS_LIMIT),
    truncated: serialized.length > LOG_DETAILS_LIMIT,
  };
}
