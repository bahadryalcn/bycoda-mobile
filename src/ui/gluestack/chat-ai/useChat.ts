import { useState, useRef, useCallback } from "react";
import type { ChatMessage } from "./types";
import { randomUUID } from "expo-crypto";
type Options = {
  initialMessages?: ChatMessage[];
  transport: (input: string, messages: ChatMessage[]) => Promise<ChatMessage>;
};
/** Optional controlled transport adapter; the product composer uses its host RPC directly. */
export function useChat({ initialMessages = [], transport }: Options) {
  const [messages, setMessages] = useState(initialMessages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const send = useCallback(
    async (input: string) => {
      if (!input.trim() || inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      setError(null);
      const current = ++generation.current;
      const user: ChatMessage = {
        id: randomUUID(),
        role: "user",
        content: input,
        timestamp: Date.now(),
      };
      const next = [...messages, user];
      setMessages(next);
      try {
        const reply = await transport(input, next);
        if (generation.current === current) setMessages((prev) => [...prev, reply]);
      } catch (cause) {
        if (generation.current === current)
          setError(cause instanceof Error ? cause : new Error("Request failed"));
      } finally {
        if (generation.current === current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [messages, transport],
  );
  const reset = () => {
    generation.current++;
    inFlight.current = false;
    setMessages(initialMessages);
    setLoading(false);
    setError(null);
  };
  return {
    messages,
    setMessages,
    send,
    reset,
    loading,
    error,
    status: error ? ("error" as const) : loading ? ("loading" as const) : ("idle" as const),
  };
}
