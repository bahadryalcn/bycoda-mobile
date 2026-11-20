const inMemory = new WeakSet<object>();

/** Marks a response whose body the app already holds in memory with a known size. */
export function markBounded(response: Response): Response {
  inMemory.add(response);
  return response;
}

/**
 * A locally built reply (e.g. a decrypted local-network envelope). React Native's
 * global Response has no body stream, so stream-only reads would reject it.
 */
export function boundedResponse(body: string, status: number): Response {
  return markBounded(new Response(body, { status, headers: { "Content-Type": "application/json" } }));
}

/**
 * Bound streamed bytes before decoding; native Expo fetch provides a reader. Returns the decoded
 * chunks in order without joining them, so a large JSON body can be decoded cooperatively.
 * Each chunk ends on a complete code point (TextDecoder streams partial sequences).
 */
export async function boundedResponseParts(response: Response, limit: number, tooLarge: () => Error): Promise<string[]> {
  if (Number(response.headers.get("content-length")) > limit) {
    const error = tooLarge();
    void response.body?.cancel().catch(() => {});
    throw error;
  }
  if (inMemory.has(response) && !response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > limit) throw tooLarge();
    return [text];
  }
  const reader = response.body?.getReader?.();
  // Never fall back to text(): that would allocate an unbounded native response.
  if (!reader) throw new Error("Streaming host responses are unavailable.");
  const parts: string[] = [];
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        const error = tooLarge();
        void reader.cancel().catch(() => {});
        throw error;
      }
      parts.push(decoder.decode(part.value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts;
  } finally { reader.releaseLock(); }
}

/** Bound streamed bytes before decoding and return the whole body as one string. */
export async function boundedResponseText(response: Response, limit: number, tooLarge: () => Error): Promise<string> {
  return (await boundedResponseParts(response, limit, tooLarge)).join("");
}
