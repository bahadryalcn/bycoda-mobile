/** Bound streamed bytes before decoding; native Expo fetch provides a reader. */
export async function boundedResponseText(response: Response, limit: number, tooLarge: () => Error): Promise<string> {
  if (Number(response.headers.get("content-length")) > limit) {
    const error = tooLarge();
    void response.body?.cancel().catch(() => {});
    throw error;
  }
  const reader = response.body?.getReader?.();
  // Never fall back to text(): that would allocate an unbounded native response.
  if (!reader) throw new Error("Streaming host responses are unavailable.");
  let text = "";
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
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
