import { useLayoutEffect, useRef, useState } from "react";
import { useConnectionScope } from "@/state/connection-scope";
import { useHostClient } from "@/state/queries";
import { usePrivateContentAccess } from "@/ui/private-access";
import { GitGenerateTextResultSchema } from "../../../../src/shared/model/host-contracts/git";
import type { GitScope } from "./git-types";
import type { GitDiffIndex } from "./wire";

type Client = NonNullable<ReturnType<typeof useHostClient>>;
type Generation = { key: string; client: Client } & (
  | { status: "pending" }
  | { status: "ready"; message: string }
  | { status: "error"; error: unknown }
);

export function useGitCommitGeneration(
  { projectId, cwd, root }: GitScope,
  index: GitDiffIndex | undefined,
) {
  const client = useHostClient();
  const connection = useConnectionScope();
  const access = usePrivateContentAccess();
  const key = JSON.stringify([connection.token, projectId, cwd, root, index?.branch, index?.head]);
  const available = !!client && access.allowed && access.check() && connection.isCurrent() &&
    index?.repository !== false && !index?.conflicts?.length && !index?.operation &&
    !!index?.files.some((file) => file.staged || file.unstaged);
  const current = useRef({ key, client, available, access });
  current.current = { key, client, available, access };
  const mounted = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const [generation, setGeneration] = useState<Generation | null>(null);
  // Reason: the temporary provider request belongs to one reviewed checkout and a mounted UI.
  useLayoutEffect(() => {
    mounted.current = true;
    setGeneration(null);
    return () => {
      mounted.current = false;
      operation.current?.abort();
      operation.current = null;
    };
  }, [key, client]);
  const attached = () => mounted.current && connection.isCurrent() && current.current.key === key &&
    current.current.client === client && current.current.available && current.current.access.check();
  const cancel = () => {
    operation.current?.abort();
    operation.current = null;
    setGeneration(null);
  };
  const start = () => {
    if (!client || !attached() || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setGeneration({ key, client, status: "pending" });
    void client.request<unknown>("git.generateText", { projectId, cwd, kind: "commit" }, {
      signal: controller.signal,
      timeoutMs: 120_000,
      retry: false,
    }).then((value) => {
      if (!attached() || operation.current !== controller || controller.signal.aborted) return;
      const result = GitGenerateTextResultSchema.safeParse(value);
      if (!result.success || !("message" in result.data) || !result.data.message.trim() || result.data.message.length > 64_000)
        throw new Error("Invalid Git generation result");
      setGeneration({ key, client, status: "ready", message: result.data.message.trim() });
    }).catch((error: unknown) => {
      if (attached() && operation.current === controller && !controller.signal.aborted)
        setGeneration({ key, client, status: "error", error });
    }).finally(() => {
      if (operation.current !== controller) return;
      operation.current = null;
      // A reply dropped while the diff is unavailable still ends this request.
      setGeneration((previous) => previous?.status === "pending" ? null : previous);
    });
  };
  const result = available && generation?.key === key && generation.client === client ? generation : null;
  return {
    available,
    pending: result?.status === "pending",
    suggestion: result?.status === "ready" ? result.message : undefined,
    error: result?.status === "error" ? result.error : undefined,
    start,
    cancel,
    useSuggestion: (apply: (message: string) => void) => {
      if (!attached() || result?.status !== "ready") return;
      apply(result.message);
      setGeneration(null);
    },
  };
}
