import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useConnectionScope } from "@/state/connection-scope";
import { useActiveMachine, useMachines } from "@/state/machines";
import { usePrivateContentAccess } from "@/ui/private-access";
import type { QueryLike } from "@/ui/query-presentation";
import type { GitScope } from "./git-types";

/** Scope is captured independently of display/version/selection state. */
export function useGitReviewScope(scope: GitScope, path: string, visible = true) {
  const machine = useActiveMachine(), connection = useConnectionScope(), access = usePrivateContentAccess();
  const [opening] = useState(() => ({ scope: { ...scope }, path, machineId: machine?.id, machineName: machine?.name ?? machine?.id ?? "", connection }));
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scopeCurrent = connection === opening.connection && opening.connection.isCurrent() && machine?.id === opening.machineId &&
    scope.projectId === opening.scope.projectId && scope.cwd === opening.scope.cwd && scope.root === opening.scope.root && path === opening.path;
  const supported = scopeCurrent && !!machine?.capabilities?.includes("git.selective.review");
  const available = visible && supported && access.allowed && access.check();
  const latest = useRef({ available, access }); latest.current = { available, access };
  const check = () => mounted.current && latest.current.available && opening.connection.isCurrent() && latest.current.access.allowed &&
    latest.current.access.check() && useMachines.getState().activeId === opening.machineId;
  return { opening, scopeCurrent, supported, available, check, attached: () => mounted.current };
}

export function useGitReviewReadAccess(scope: ReturnType<typeof useGitReviewScope>, query: QueryLike) {
  const kind = (query.error as { kind?: string } | null)?.kind;
  const readable = scope.available && query.isEnabled !== false && query.fetchStatus !== "paused" && kind !== "auth" && kind !== "identity";
  const lease = useMemo(() => ({ active: false }), [readable]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  return { allowed: readable, check: () => readable && lease.active && scope.check() };
}
