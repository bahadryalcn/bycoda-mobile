import { useEffect, useMemo, useState } from "react";
import { useActiveMachine } from "@/state/machines";
import { useHostClient, useHostQuery } from "@/state/queries";
import { ApprovalsClient } from "./approvals-client";
import { APPROVALS_CAPABILITY, parseApprovals, pendingApprovalCount } from "./approvals-model";

/** The active computer's approvals, refreshed while a screen shows them; empty when the computer predates approvals. */
export function useApprovals(interval = 3000) {
  const machine = useActiveMachine();
  const transport = useHostClient();
  const supported = !!machine?.capabilities?.includes(APPROVALS_CAPABILITY);
  const query = useHostQuery<unknown>(["approvals"], "approvals.list", {}, { enabled: supported, interval });
  const client = useMemo(
    () => (transport && supported ? new ApprovalsClient({ request: (m, p, o) => transport.request(m, p, o) }) : null),
    [transport, supported],
  );
  const approvals = useMemo(() => parseApprovals(query.data), [query.data]);
  return { query, client, supported, approvals };
}

/** A clock that ticks once a second so deadlines count down. */
export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function usePendingApprovalCount() {
  const { approvals, supported } = useApprovals(15000);
  return supported ? pendingApprovalCount(approvals, Date.now()) : 0;
}
