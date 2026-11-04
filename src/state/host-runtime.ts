import type {
  CredentialBinding,
  HostSocketNative,
  NativeCredentialHandle,
} from "../../modules/bycoda-host-socket/src/types";
import { requireCredentialBinding, selectMobileHostTransport } from "../remote/lan-ws";
import { requireMobileTlsBootstrap } from "../remote/lan-ws";
import { registerHostWsRuntimeProvider } from "../remote/ws-runtime-port";
import { RemoteHostError } from "../remote/host-error";
import type { HostDescriptor, MobileMachine } from "../remote/types";
import {
  HostWsError,
  MobileHostWsConnection,
  type AppliedHostEvent,
  type HostWsRequestOptions,
} from "../remote/ws-connection";

export type MobileHostRuntimeState =
  | "idle"
  | "connecting"
  | "ready"
  | "backoff"
  | "blocked"
  | "suspended"
  | "closed";
export type MobileHostRuntimeLease = {
  supports(method: string): boolean;
  request<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: HostWsRequestOptions,
  ): Promise<T>;
  subscribe(handler: AppliedHostEvent): () => void;
  state(): MobileHostRuntimeState;
  onState(handler: (state: MobileHostRuntimeState) => void): () => void;
  release(): void;
};
type Runtime = {
  binding: CredentialBinding;
  refs: number;
  state: MobileHostRuntimeState;
  credential?: NativeCredentialHandle;
  connection?: MobileHostWsConnection;
  attempt: number;
  fence: number;
  timer?: ReturnType<typeof setTimeout>;
  stable?: ReturnType<typeof setTimeout>;
  events: Set<AppliedHostEvent>;
  states: Set<(state: MobileHostRuntimeState) => void>;
};

/** One app-scoped retry owner. Native code performs exactly one attempt. */
export class MobileHostRuntimeRegistry {
  private runtimes = new Map<string, Runtime>();
  private generation = 0;
  private active = true;
  private accessEpoch = 0;
  private accessConfigured = false;
  private closed = false;
  private invalidation: Promise<void> = Promise.resolve();
  constructor(
    private readonly native: HostSocketNative | null,
    private readonly clientId: string,
    private readonly assertAccess: () => void,
    private readonly random: () => number = Math.random,
    private readonly observer?: (machineId: string, state: MobileHostRuntimeState) => void,
  ) {}

  retain(input: CredentialBinding, capabilities: readonly string[]): MobileHostRuntimeLease | null {
    if (selectMobileHostTransport(capabilities, this.native !== null) === "legacy-http")
      return null;
    if (this.closed) throw new HostWsError("cancelled");
    this.assertAccess();
    const binding = requireCredentialBinding(input);
    if (!this.accessConfigured || binding.accessEpoch > this.accessEpoch)
      this.setAccess(this.active, Math.max(binding.accessEpoch, this.accessEpoch));
    const key = binding.environmentId;
    let runtime = this.runtimes.get(key);
    if (
      runtime &&
      JSON.stringify({ ...runtime.binding, accessEpoch: 0 }) !==
        JSON.stringify({ ...binding, accessEpoch: 0 })
    )
      throw new HostWsError("identity");
    if (!runtime) {
      if (this.runtimes.size >= 16) throw new HostWsError("overload");
      runtime = {
        binding,
        refs: 0,
        state: "idle",
        attempt: 0,
        fence: 0,
        events: new Set(),
        states: new Set(),
      };
      this.runtimes.set(key, runtime);
    }
    if (runtime.refs >= 64) throw new HostWsError("overload");
    runtime.refs++;
    if (runtime.refs === 1 && runtime.state !== "blocked") void this.connect(runtime);
    const owned = runtime;
    const ownedEvents = new Set<AppliedHostEvent>();
    const ownedStates = new Set<(state: MobileHostRuntimeState) => void>();
    let released = false;
    return {
      supports: (method) =>
        !released && owned.state === "ready" && !!owned.connection?.supports(method),
      request: <T>(
        method: string,
        params: Record<string, unknown> = {},
        options: HostWsRequestOptions = {},
      ) => {
        this.assertAccess();
        if (released || owned.state !== "ready" || !owned.connection)
          return Promise.reject(new HostWsError("network"));
        // Requests never wait in a hidden reconnect outbox. The initiating UI
        // retains an unsent draft and the owner explicitly retries it.
        return owned.connection.request<T>(method, params, options);
      },
      subscribe: (handler) => {
        if (released || owned.events.size >= 64) throw new HostWsError("overload");
        owned.events.add(handler);
        ownedEvents.add(handler);
        return () => {
          owned.events.delete(handler);
          ownedEvents.delete(handler);
        };
      },
      state: () => owned.state,
      onState: (handler) => {
        if (released || owned.states.size >= 64) throw new HostWsError("overload");
        owned.states.add(handler);
        ownedStates.add(handler);
        return () => {
          owned.states.delete(handler);
          ownedStates.delete(handler);
        };
      },
      release: () => {
        if (released) return;
        released = true;
        for (const handler of ownedEvents) owned.events.delete(handler);
        for (const handler of ownedStates) owned.states.delete(handler);
        owned.refs--;
        if (!owned.refs) {
          const blocked = owned.state === "blocked";
          this.stop(owned);
          this.setState(owned, blocked ? "blocked" : "idle");
        }
      },
    };
  }
  private setState(runtime: Runtime, state: MobileHostRuntimeState): void {
    runtime.state = state;
    try {
      this.observer?.(runtime.binding.machineId, state);
    } catch {
      /* Observation does not own connection policy. */
    }
    for (const handler of runtime.states) {
      try {
        handler(state);
      } catch {
        /* A view observer cannot change transport ownership. */
      }
    }
  }
  private stop(runtime: Runtime): void {
    runtime.fence++;
    clearTimeout(runtime.timer);
    clearTimeout(runtime.stable);
    runtime.timer = undefined;
    runtime.stable = undefined;
    runtime.connection?.close();
    runtime.connection = undefined;
  }
  private async connect(runtime: Runtime): Promise<void> {
    if (this.closed || !runtime.refs) return;
    if (!this.active) {
      this.setState(runtime, "suspended");
      return;
    }
    this.stop(runtime);
    const fence = runtime.fence;
    this.setState(runtime, "connecting");
    try {
      try {
        await this.invalidation;
      } catch {
        throw new HostWsError("authentication");
      }
      if (runtime.fence !== fence || !this.active || !runtime.refs) return;
      this.assertAccess();
      const binding = {
        ...runtime.binding,
        accessEpoch: Math.max(this.accessEpoch, runtime.binding.accessEpoch),
      };
      let credential = runtime.credential;
      if (!credential) {
        try {
          credential = await this.native!.acquireCredential(binding);
        } catch {
          throw new HostWsError("authentication");
        }
      }
      if (runtime.fence !== fence || !this.active || !runtime.refs) return;
      runtime.credential = credential;
      const connection = new MobileHostWsConnection(
        this.native!,
        binding,
        credential,
        ++this.generation,
        this.clientId,
        async (event, assertDeliveryCurrent) => {
          const assertCurrent = () => {
            assertDeliveryCurrent();
            this.assertAccess();
            if (!this.active || runtime.fence !== fence) throw new HostWsError("cancelled");
          };
          assertCurrent();
          const consumers = [...runtime.events];
          const results = await Promise.all(
            consumers.map((handler) => handler(event, assertCurrent)),
          );
          if (runtime.fence !== fence) return false;
          assertCurrent();
          return results.some(Boolean);
        },
        (error) => {
          if (runtime.fence === fence) this.failed(runtime, error);
        },
        () => {
          this.assertAccess();
          if (!this.active || runtime.fence !== fence) throw new HostWsError("cancelled");
        },
      );
      runtime.connection = connection;
      await connection.start();
      if (runtime.fence !== fence || !this.active || !runtime.refs) {
        connection.close();
        return;
      }
      this.setState(runtime, "ready");
      runtime.stable = setTimeout(() => {
        if (runtime.fence === fence && runtime.state === "ready") runtime.attempt = 0;
      }, 30_000);
    } catch (error) {
      if (runtime.fence === fence)
        this.failed(runtime, error instanceof HostWsError ? error : new HostWsError("network"));
    }
  }
  private failed(runtime: Runtime, error: HostWsError): void {
    this.stop(runtime);
    if (this.closed || !runtime.refs) return;
    if (!this.active) {
      this.setState(runtime, "suspended");
      return;
    }
    if (["authentication", "identity", "schema", "tls"].includes(error.category)) {
      runtime.credential = undefined;
      this.setState(runtime, "blocked");
      return;
    }
    this.setState(runtime, "backoff");
    const cap = Math.min(30_000, 250 * 2 ** Math.min(runtime.attempt++, 16));
    runtime.timer = setTimeout(
      () => {
        runtime.timer = undefined;
        void this.connect(runtime);
      },
      Math.floor(Math.max(0, Math.min(1, this.random())) * cap),
    );
  }
  /** App lock/background closes sockets and invalidates native handles immediately. */
  setAccess(active: boolean, epoch: number): void {
    if (!Number.isSafeInteger(epoch) || epoch < this.accessEpoch) throw new HostWsError("identity");
    if (this.accessConfigured && active === this.active && epoch === this.accessEpoch) return;
    this.accessConfigured = true;
    this.active = active;
    this.accessEpoch = epoch;
    for (const runtime of this.runtimes.values()) {
      this.stop(runtime);
      runtime.credential = undefined;
      this.setState(runtime, active ? "idle" : "suspended");
    }
    // Resume only after native invalidation settles; an old completion cannot
    // invalidate a newly acquired handle from the resumed generation.
    this.invalidation = this.invalidation
      .catch(() => undefined)
      .then(() => this.native?.setAccess(active, epoch))
      .then(() => undefined);
    void this.invalidation
      .catch(() => undefined)
      .then(() => {
        if (!this.closed && this.active && this.accessEpoch === epoch)
          for (const runtime of this.runtimes.values())
            if (runtime.refs) void this.connect(runtime);
      });
  }
  invalidateMachine(machineId: string): void {
    for (const [key, runtime] of this.runtimes)
      if (runtime.binding.machineId === machineId) {
        this.stop(runtime);
        runtime.credential = undefined;
        this.setState(runtime, "closed");
        this.runtimes.delete(key);
      }
    this.invalidation = this.invalidation
      .catch(() => undefined)
      .then(() => this.native?.invalidateCredentials(machineId))
      .then(() => undefined);
  }
  close(): void {
    this.closed = true;
    for (const runtime of this.runtimes.values()) {
      this.stop(runtime);
      this.setState(runtime, "closed");
    }
    this.runtimes.clear();
    this.invalidation = this.invalidation
      .catch(() => undefined)
      .then(() => this.native?.invalidateCredentials())
      .then(() => undefined);
    void this.invalidation.catch(() => undefined);
  }
}

let appRegistry: MobileHostRuntimeRegistry | undefined;
let appAccessEpoch = Date.now();
type Installation = { registry: MobileHostRuntimeRegistry; dispose(): void };
let installation: Promise<Installation> | undefined;
let installationRefs = 0;
/** Install once in the app's existing security/lifecycle composition. */
export async function installMobileHostRuntime(
  options: { onState?: (machineId: string, state: MobileHostRuntimeState) => void } = {},
): Promise<Installation> {
  installationRefs++;
  const current = (installation ??= createMobileHostRuntime(options));
  let owned: Installation;
  try {
    owned = await current;
  } catch (error) {
    installationRefs--;
    if (installation === current) installation = undefined;
    throw error;
  }
  let released = false;
  return {
    registry: owned.registry,
    dispose: () => {
      if (released) return;
      released = true;
      if (--installationRefs === 0) {
        owned.dispose();
        if (installation === current) installation = undefined;
      }
    },
  };
}
async function createMobileHostRuntime(options: {
  onState?: (machineId: string, state: MobileHostRuntimeState) => void;
}): Promise<Installation> {
  const [
    { nativeHostSocket },
    { AppState },
    { useSecurity, isAppAccessAllowed, assertAppAccess },
    { useMachines },
  ] = await Promise.all([
    import("../../modules/bycoda-host-socket"),
    import("react-native"),
    import("./security"),
    import("./machines"),
  ]);
  if (appRegistry) throw new Error("The mobile Host runtime is already installed.");
  const native = nativeHostSocket();
  const registry = new MobileHostRuntimeRegistry(
    native,
    `app-${Math.random().toString(36).slice(2, 18)}`,
    assertAppAccess,
    Math.random,
    options.onState,
  );
  appRegistry = registry;
  let epoch = ++appAccessEpoch,
    active = isAppAccessAllowed() && AppState.currentState === "active";
  registry.setAccess(active, epoch);
  const bootstrap = new Map<string, Promise<unknown>>();
  const resolvedBootstrap = new Map<string, HostDescriptor>();
  const credentialGenerations = new Map<string, number>();
  const bootstrapKey = (machine: MobileMachine) =>
    JSON.stringify([machine.id, machine.endpoint, machine.environmentId, machine.lanKey]);
  const remember = (machine: MobileMachine, descriptor: HostDescriptor) => {
    if (descriptor.environmentId !== machine.environmentId)
      throw new RemoteHostError(
        machine.id,
        "identity",
        "Host identity changed. Pair this computer again.",
      );
    const key = bootstrapKey(machine),
      previous = resolvedBootstrap.get(key);
    const currentTls = (descriptor as HostDescriptor & { mobileTls?: unknown }).mobileTls;
    let normalizedTls = currentTls;
    const oldTls = (previous as (HostDescriptor & { mobileTls?: unknown }) | undefined)?.mobileTls;
    if (currentTls !== undefined) {
      let next;
      try {
        next = requireMobileTlsBootstrap(currentTls, machine.environmentId);
      } catch {
        throw new RemoteHostError(
          machine.id,
          "identity",
          "The authenticated Host WSS trust material is invalid.",
        );
      }
      normalizedTls = next;
      if (oldTls !== undefined) {
        const old = requireMobileTlsBootstrap(oldTls, machine.environmentId);
        if (
          next.caGeneration < old.caGeneration ||
          (next.caGeneration === old.caGeneration && next.caSpkiPin !== old.caSpkiPin)
        )
          throw new RemoteHostError(
            machine.id,
            "identity",
            "The paired Host CA generation changed unexpectedly. Pair this computer again.",
          );
      }
    }
    if (
      previous &&
      JSON.stringify([oldTls, [...new Set(previous.capabilities)].sort()]) !==
        JSON.stringify([normalizedTls, [...new Set(descriptor.capabilities)].sort()])
    )
      registry.invalidateMachine(machine.id);
    const saved = {
      ...descriptor,
      providers: [...descriptor.providers],
      capabilities: [...descriptor.capabilities],
      ...(normalizedTls === undefined ? {} : { mobileTls: normalizedTls }),
    } as HostDescriptor;
    resolvedBootstrap.set(key, saved);
    bootstrap.set(key, Promise.resolve(saved));
  };
  const removeProvider = registerHostWsRuntimeProvider({
    remember,
    async acquire(machine, readBootstrap, assertAccess) {
      assertAccess();
      if (!native)
        throw new RemoteHostError(
          machine.id,
          "unsupported",
          "Update the native mobile app to use this Host socket.",
        );
      const key = bootstrapKey(machine);
      let pending = bootstrap.get(key);
      if (!pending) {
        if (bootstrap.size >= 16)
          throw new RemoteHostError(
            machine.id,
            "network",
            "Too many Host bootstrap requests are active.",
          );
        pending = readBootstrap();
        bootstrap.set(key, pending);
        void pending.catch(() => {
          if (bootstrap.get(key) === pending) bootstrap.delete(key);
        });
      }
      const descriptor = (await pending) as HostDescriptor & { mobileTls?: unknown };
      assertAccess();
      if (!resolvedBootstrap.has(key)) remember(machine, descriptor);
      if (selectMobileHostTransport(descriptor.capabilities ?? [], true) === "legacy-http")
        throw new RemoteHostError(
          machine.id,
          "unsupported",
          "Refresh this computer's capabilities before reconnecting.",
        );
      let binding: CredentialBinding;
      const credentialGeneration = credentialGenerations.get(machine.id) ?? 1;
      if (descriptor.mobileTls !== undefined) {
        let trusted;
        try {
          trusted = requireMobileTlsBootstrap(descriptor.mobileTls, machine.environmentId);
        } catch {
          throw new RemoteHostError(
            machine.id,
            "identity",
            "The authenticated Host WSS trust material is invalid.",
          );
        }
        binding = {
          machineId: machine.id,
          environmentId: machine.environmentId,
          endpoint: trusted.endpoint,
          credentialGeneration,
          accessEpoch: epoch,
          tls: {
            version: trusted.version,
            environmentId: trusted.environmentId,
            caGeneration: trusted.caGeneration,
            caCertificatePem: trusted.caCertificatePem,
            caSpkiPin: trusted.caSpkiPin,
          },
        };
      } else {
        // Only ordinary HTTPS can inherit normal public-CA WSS trust. Private
        // LAN pairing never manufactures a TLS anchor from its X25519 key.
        const endpoint = new URL(machine.endpoint);
        if (machine.lanKey || endpoint.protocol !== "https:") {
          bootstrap.delete(key);
          resolvedBootstrap.delete(key);
          throw new RemoteHostError(
            machine.id,
            "unsupported",
            "This computer's paired WSS listener is not available yet.",
          );
        }
        endpoint.protocol = "wss:";
        endpoint.pathname = "/ws";
        binding = {
          machineId: machine.id,
          environmentId: machine.environmentId,
          endpoint: endpoint.toString(),
          credentialGeneration,
          accessEpoch: epoch,
        };
      }
      const lease = registry.retain(binding, descriptor.capabilities ?? []);
      if (!lease)
        throw new RemoteHostError(
          machine.id,
          "unsupported",
          "This computer has not enabled the native Host socket.",
        );
      try {
        assertAccess();
        return lease;
      } catch (error) {
        lease.release();
        throw error;
      }
    },
  });
  const access = () => {
    const next = isAppAccessAllowed() && AppState.currentState === "active";
    if (next !== active) {
      active = next;
      epoch = ++appAccessEpoch;
      registry.setAccess(next, epoch);
    }
  };
  const security = useSecurity.subscribe(access);
  const lifecycle = AppState.addEventListener("change", access);
  let machines = new Map(
    useMachines
      .getState()
      .machines.map((machine) => [
        machine.id,
        JSON.stringify([machine.endpoint, machine.environmentId, machine.lanKey]),
      ]),
  );
  const machineState = useMachines.subscribe((state) => {
    const next = new Map(
      state.machines.map((machine) => [
        machine.id,
        JSON.stringify([machine.endpoint, machine.environmentId, machine.lanKey]),
      ]),
    );
    for (const [id, previous] of machines)
      if (
        next.get(id) !== previous ||
        state.connectionPending ||
        state.storageError ||
        !state.hydrated
      ) {
        credentialGenerations.set(id, (credentialGenerations.get(id) ?? 1) + 1);
        for (const key of bootstrap.keys())
          if ((JSON.parse(key) as string[])[0] === id) {
            bootstrap.delete(key);
            resolvedBootstrap.delete(key);
          }
        registry.invalidateMachine(id);
      }
    machines = next;
  });
  return {
    registry,
    dispose: () => {
      removeProvider();
      security();
      lifecycle.remove();
      machineState();
      bootstrap.clear();
      resolvedBootstrap.clear();
      registry.close();
      if (appRegistry === registry) appRegistry = undefined;
    },
  };
}
