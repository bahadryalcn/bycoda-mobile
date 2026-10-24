import { createContext, use, useCallback, useMemo, useRef, type PropsWithChildren } from "react";
import type { ComposerTransfer, ComposerTransferScope } from "./composer-transfer-model";
type Receiver = (request: ComposerTransfer) => void;
type Bridge = { register: (receiver: Receiver) => () => void; transfer: Receiver };
const Context = createContext<Bridge | null>(null);

/** The mounted composer keeps sole ownership of draft persistence and insertion. */
export function ComposerTransferProvider({ scope, children }: PropsWithChildren<{ scope: ComposerTransferScope }>) {
  const receiver = useRef<Receiver | null>(null);
  const register = useCallback((next: Receiver) => {
    receiver.current = next;
    return () => { if (receiver.current === next) receiver.current = null; };
  }, []);
  const transfer = useCallback((request: ComposerTransfer) => {
    if (request.machineId !== scope.machineId || request.sessionId !== scope.sessionId || !receiver.current)
      throw new Error("The destination composer is unavailable. Reopen the selection in the active session.");
    receiver.current(request);
  }, [scope.machineId, scope.sessionId]);
  const bridge = useMemo(() => ({ register, transfer }), [register, transfer]);
  return <Context value={bridge}>{children}</Context>;
}
export function useComposerTransfer() { return use(Context); }
