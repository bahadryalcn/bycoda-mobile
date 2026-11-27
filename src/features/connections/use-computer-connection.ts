import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { MobilePairingCodeError } from "../../../../src/integrations/mobile-pairing";
import { discoverMachine, RemoteHostError } from "@/remote/transport";
import { useAsyncAction } from "@/state/actions";
import { useFormDraft } from "@/state/form-draft";
import { credentials, useMachines } from "@/state/machines";
import { assertAppAccess, useSecurity } from "@/state/security";
import { useCopy } from "@/ui/copy";
import { flushWorkspaceDrafts } from "../workspace/draft-guard";
import { LONG_AWAY_MS } from "@/state/app-resume";
import { duringSystemPrompt } from "@/state/system-prompt";
import { pairingPhoneName } from "./phone-name";
import { phoneInstallId } from "./install-id";
import { connectComputer } from "./computer-connection";
import { pairingCodeExpired } from "./connection-lifecycle";
import {
  pairingClaimId,
  pairingErrorMessage,
  pairingNeedsNewCode,
  parseDesktopPairingCode,
  PairingFailure,
  pairingRouteIsPublic,
} from "./pairing-code";
import { newProofSeed, proofKeyOf } from "@/remote/device-proof";
import { redeemMobilePairingCode } from "./pairing-redeem";
import { ConnectionRemovalError } from "./recovery";
import { selectionError } from "./use-switch-computer";
import type {
  ConnectionDraft,
  ConnectionEntryState,
  ComputerConnectionInput,
} from "./connection-types";
import type { MobileMachine } from "@/remote/types";
import { leaveTo } from "@/ui/navigation";

const emptyDraft: ConnectionDraft = { name: "", endpoint: "", token: "", target: null };
/** "inactive" is a system sheet over the app (permission, Control Center, Face ID), not a stay away. */
const visible = (state: string | null | undefined) => state === "active" || state === "inactive";

export function useComputerConnection(returnToPreviousAfterConnect = false) {
  const copy = useCopy();
  const form = useFormDraft<ConnectionDraft>(emptyDraft);
  const operation = useAsyncAction<{ message?: string }>();
  const [entry, setEntry] = useState<ConnectionEntryState>({ kind: "choices" });
  const [connectionMode, setConnectionMode] = useState<"lan" | "tailscale">("lan");
  const request = useRef<AbortController | null>(null);
  const rejectedClaim = useRef<string | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const foreground = useRef(visible(AppState.currentState));
  const leftAt = useRef<number | null>(null);
  /** The typed device key was cleared after a long stay away; the form says so once. */
  const [tokenCleared, setTokenCleared] = useState(false);
  const access = useSecurity((state) => state.status);
  const typedToken = useRef("");
  typedToken.current = form.values.token;

  const assertAccess = () => {
    assertAppAccess();
    if (
      !mounted.current ||
      (process.env.EXPO_OS !== "web" && (!foreground.current || !visible(AppState.currentState)))
    ) {
      throw new PairingFailure("access");
    }
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (process.env.EXPO_OS === "web") return;
    // Reason: going to the background (Wi-Fi, VPN, Tailscale settings) aborts pending work. A system
    // sheet ("inactive": the local network permission, Control Center, Face ID) does not. The typed
    // secret survives a short trip to copy the address and key; a long stay away clears it. The scanned
    // code and form text stay; the redeem ticket is re-checked for expiry before use.
    const changed = AppState.addEventListener("change", (state) => {
      foreground.current = visible(state);
      if (state === "background") {
        leftAt.current ??= Date.now();
        generation.current++;
        request.current?.abort();
        operation.reset();
      } else if (state === "active" && leftAt.current !== null) {
        const away = Date.now() - leftAt.current;
        leftAt.current = null;
        if (away >= LONG_AWAY_MS && typedToken.current) {
          form.patch({ token: "" });
          setTokenCleared(true);
        }
      }
    });
    return () => changed.remove();
  }, [form.patch, operation.reset]);

  useEffect(() => {
    if (access === "unlocked") return;
    generation.current++;
    request.current?.abort();
    // The lock drops only the typed secret. The step (scanner, preview, manual or edit form) and the
    // typed address stay, so unlocking resumes the same flow; the ticket is re-checked before use.
    form.patch({ token: "" });
    if (typedToken.current) setTokenCleared(true);
    operation.reset();
  }, [access, form.patch, operation.reset]);

  const cancel = () => {
    generation.current++;
    request.current?.abort();
    setTokenCleared(false);
    form.reset(emptyDraft);
    setEntry({ kind: "choices" });
    operation.reset();
  };

  /** Opening a step while the app is locked or covered reports it instead of throwing into a press handler. */
  const allowed = () => {
    try {
      assertAccess();
      return true;
    } catch (error) {
      void operation.run(async () => {
        throw new Error(pairingErrorMessage(error instanceof PairingFailure ? error : new PairingFailure("access"), copy));
      }).catch(() => undefined);
      return false;
    }
  };

  const begin = (
    kind: "choices" | "scan" | "paste" | "manual",
    mode = connectionMode,
  ) => {
    if (!allowed()) return;
    setTokenCleared(false);
    generation.current++;
    request.current?.abort();
    form.reset({ ...emptyDraft, target: { kind: "new" } });
    setConnectionMode(mode);
    setEntry({ kind });
    operation.reset();
  };

  const edit = (machine: MobileMachine) => {
    if (!allowed()) return;
    setTokenCleared(false);
    generation.current++;
    request.current?.abort();
    setConnectionMode(machine.lanKey ? "lan" : "tailscale");
    form.reset({
      name: machine.name,
      endpoint: machine.endpoint,
      token: "",
      target: { kind: "existing", id: machine.id },
    });
    setEntry({ kind: "manual" });
    operation.reset();
  };

  const readCode = async (raw: string) => {
    const attempt = generation.current;
    try {
      assertAccess();
      const code = parseDesktopPairingCode(raw);
      const receivedAt = Date.now();
      const claimId = pairingClaimId(await Crypto.getRandomBytesAsync(32));
      assertAccess();
      if (attempt !== generation.current) throw new PairingFailure("aborted");
      // The validated QR payload owns route identity; no extra network-selection step is needed.
      setConnectionMode(code.lanKey ? "lan" : "tailscale");
      setEntry({ kind: "preview", code, claimId, receivedAt });
    } catch (error) {
      throw new Error(
        error instanceof Error &&
          !(error instanceof MobilePairingCodeError) &&
          !(error instanceof PairingFailure)
          ? error.message
          : pairingErrorMessage(error, copy),
      );
    }
  };

  const finish = async (input: ComputerConnectionInput, signal: AbortSignal) => {
    await connectComputer(input, {
      discover: (endpoint, credential, currentSignal, lanKey, environmentId, proofSeed) =>
        discoverMachine(endpoint, credential, {
          signal: currentSignal,
          lanKey,
          environmentId,
          proofSeed,
        }),
      flushDrafts: flushWorkspaceDrafts,
      getMachines: () => useMachines.getState().machines,
      saveMachine: (machine, credential, proofSeed, options) =>
        useMachines.getState().saveMachine(machine, credential, proofSeed, options),
      createId: () => Crypto.randomUUID(),
      assertAccess,
      signal,
    });
  };

  const connect = async () => {
    if (entry.kind === "preview" && rejectedClaim.current === entry.claimId) return;
    // The first local-network connection can raise the iOS Local Network prompt ("inactive"); that
    // sheet must neither lock the app nor cancel the connection.
    return operation.run(() => duringSystemPrompt(async () => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const check = () => {
        assertAccess();
        if (controller.signal.aborted) throw new PairingFailure("aborted");
      };
      try {
        check();
        const editingId =
          form.values.target?.kind === "existing" ? form.values.target.id : undefined;
        if (entry.kind === "preview") {
          if (pairingCodeExpired(entry.code, entry.receivedAt)) throw new PairingFailure("expired");
          // The phone key exists before the credential does; it is persisted with the credential.
          const proofSeed = newProofSeed();
          const redeemed = await redeemMobilePairingCode(entry.code, entry.claimId, pairingPhoneName(), {
            signal: controller.signal,
            assertAccess,
            proofKey: proofKeyOf(proofSeed),
            previousProofSeed: await credentials.pairedProofSeed(entry.code.environmentId),
            installId: phoneInstallId(entry.code.environmentId),
          });
          check();
          await finish(
            {
              name: entry.code.name,
              endpoint: entry.code.endpoint,
              lanKey: entry.code.lanKey,
              credential: redeemed.token,
              expectedEnvironmentId: entry.code.environmentId,
              proofSeed,
              ...(pairingRouteIsPublic(entry.code) ? { public: true as const } : {}),
            },
            controller.signal,
          );
        } else if (entry.kind === "manual") {
          const existing = useMachines
            .getState()
            .machines.find((machine) => machine.id === editingId);
          // Editing keeps the saved key unless a new one is typed, on every route type.
          const credential =
            existing && !form.values.token.trim()
              ? ((await credentials.get(existing.id, existing)) ?? "")
              : form.values.token;
          check();
          // The same saved credential keeps its bound key; a different pasted one starts unbound.
          const saved = existing ? await credentials.get(existing.id, existing) : null;
          const proofSeed =
            existing && saved && saved === credential
              ? ((await credentials.getProofSeed(existing.id, existing)) ?? undefined)
              : undefined;
          check();
          await finish(
            {
              name: form.values.name,
              endpoint: form.values.endpoint,
              credential,
              editingId,
              proofSeed,
              ...(existing?.lanKey
                ? { lanKey: existing.lanKey, expectedEnvironmentId: existing.environmentId }
                : {}),
            },
            controller.signal,
          );
        } else {
          throw new PairingFailure("invalid-response");
        }
        check();
        const edited = !!editingId;
        form.reset(emptyDraft);
        setTokenCleared(false);
        setEntry({ kind: "choices" });
        // Editing returns to the Computers list it was opened from; the active computer stays the same.
        if (edited) return { message: copy("Bağlantı kaydedildi.", "Connection saved.") };
        if (returnToPreviousAfterConnect && router.canGoBack()) router.back();
        // Home is already beneath the Computers page: return to it instead of stacking a second one.
        else leaveTo("/");
        return { message: copy("Bilgisayar bağlandı.", "Computer connected.") };
      } catch (error) {
        if (entry.kind === "manual" && error instanceof RemoteHostError && error.kind === "identity")
          // Manual entry has no pairing code: the address simply belongs to another computer.
          throw new Error(copy(
            "Bu adres başka bir bilgisayara ait. Onu yeni bilgisayar olarak ekle.",
            "This address belongs to a different computer. Add it as a new computer.",
          ));
        if (
          error instanceof PairingFailure ||
          error instanceof MobilePairingCodeError ||
          (error instanceof RemoteHostError &&
            (entry.kind === "preview" || error.kind === "identity"))
        ) {
          const message = pairingErrorMessage(error, copy);
          if (entry.kind === "preview" && !controller.signal.aborted && pairingNeedsNewCode(error)) {
            rejectedClaim.current = entry.claimId;
            setEntry(current => current === entry ? { kind: "rejected-code", message } : current);
          }
          throw new Error(message);
        }
        throw error;
      } finally {
        if (request.current === controller) request.current = null;
      }
    }));
  };

  const recover = async (action: () => Promise<void>, message: string) =>
    operation.run(async () => {
      try {
        await action();
      } catch (error) {
        throw error instanceof ConnectionRemovalError
          ? new Error(copy("Kaydedilmiş bilgisayarlar değişti. Devam etmek için bu incelemeyi yeniden aç.", "Saved computers changed. Reopen this review to continue."))
          : selectionError(error, copy);
      }
      return { message };
    });

  return {
    entry,
    connectionMode,
    form,
    operation,
    busy: operation.isPending,
    begin,
    edit,
    cancel,
    readCode,
    connect,
    recover,
    tokenCleared,
  };
}
