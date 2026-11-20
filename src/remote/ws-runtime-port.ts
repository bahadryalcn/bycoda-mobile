import type { AppliedHostEvent, HostWsRequestOptions } from "./ws-connection";
import type { HostDescriptor, MobileMachine } from "./types";

export interface HostWsConsumer {
  supports(method: string): boolean;
  request<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: HostWsRequestOptions,
  ): Promise<T>;
  subscribe(handler: AppliedHostEvent): () => void;
  /** Native credential handle and `/ws-tunnel` endpoint for the phone tunnel; absent until connected. */
  tunnelCredential?(): { credential: string; endpoint: string } | undefined;
  state(): string;
  onState(handler: (state: string) => void): () => void;
  release(): void;
}
export interface HostWsRuntimeProvider {
  acquire(
    machine: MobileMachine,
    bootstrap: () => Promise<HostDescriptor>,
    assertAccess: () => void,
  ): Promise<HostWsConsumer>;
  /** Called only after the existing authenticated descriptor reader succeeds. */
  remember(machine: MobileMachine, descriptor: HostDescriptor): void;
}
let provider: HostWsRuntimeProvider | undefined;
const listeners = new Set<() => void>();
export const getHostWsRuntimeProvider = () => provider;
export function observeHostWsRuntimeProvider(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function registerHostWsRuntimeProvider(next: HostWsRuntimeProvider): () => void {
  if (provider) throw new Error("The mobile Host socket provider is already registered.");
  provider = next;
  for (const listener of listeners) listener();
  return () => {
    if (provider === next) {
      provider = undefined;
      for (const listener of listeners) listener();
    }
  };
}
