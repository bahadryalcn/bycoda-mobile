import { useCallback, useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { MobilePairingCodeError } from "../../../../src/integrations/mobile-pairing";
import { discoverMachine, RemoteHostError } from "@/remote/transport";
import { credentials, useMachines } from "@/state/machines";
import { assertAppAccess } from "@/state/security";
import { useCopy } from "@/ui/copy";
import type { Computer } from "../account/contracts";
import { useAccount } from "../account/ui/account-context";
import { flushWorkspaceDrafts } from "../workspace/draft-guard";
import {
  accountPairingMessage,
  AccountPairingError,
  assertPinUnchanged,
  needsNewComputerConfirmation,
  requestAccountPairingCode,
} from "./account-pairing";
import { connectComputer } from "./computer-connection";
import {
  pairingClaimId,
  pairingErrorMessage,
  PairingFailure,
  pairingRouteIsPublic,
} from "./pairing-code";
import { newProofSeed, proofKeyOf } from "@/remote/device-proof";
import { redeemMobilePairingCode } from "./pairing-redeem";
import { pairingPhoneName } from "./phone-name";
import { phoneInstallId } from "./install-id";
import { leaveTo } from "@/ui/navigation";


export type AccountPairingState =
  | { phase: "idle" }
  | { phase: "waiting"; computer: Computer; sas: string | null }
  | { phase: "confirm"; computer: Computer; name: string; sas: string | null }
  | { phase: "connecting"; computer: Computer }
  | { phase: "error"; computer: Computer; message: string };

/** One-tap connect through the account: request, owner approval, then the normal redeem path. */
export function useAccountPairing() {
  const copy = useCopy();
  const { runtime } = useAccount();
  const [state, setState] = useState<AccountPairingState>({ phase: "idle" });
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const decision = useRef<((confirmed: boolean) => void) | null>(null);
  // Set synchronously so a second tap in the same frame cannot start another request before state updates.
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  const update = (next: AccountPairingState, controller: AbortController) => {
    if (mounted.current && request.current === controller) setState(next);
  };

  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
    inFlight.current = false;
    setState({ phase: "idle" });
  }, []);

  /** Answers the "connect to new computer" step; cancel and unmount abort it instead. */
  const confirm = useCallback(() => decision.current?.(true), []);

  const start = useCallback(
    async (computer: Computer) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const controller = new AbortController();
      request.current = controller;
      const { signal } = controller;
      setState({ phase: "waiting", computer, sas: null });
      let sas: string | null = null;
      try {
        assertAppAccess();
        const phoneDeviceId = await runtime?.deviceId();
        if (!runtime || !phoneDeviceId) throw new AccountPairingError("unavailable");
        const code = await requestAccountPairingCode({
          client: runtime.client,
          phoneDeviceId,
          computer,
          signal,
          onCode: (value) => {
            sas = value;
            update({ phase: "waiting", computer, sas }, controller);
          },
        });
        assertAppAccess();
        assertPinUnchanged(code, useMachines.getState().machines);
        if (needsNewComputerConfirmation(code, useMachines.getState().machines)) {
          const confirmed = await new Promise<boolean>((resolve) => {
            decision.current = resolve;
            signal.addEventListener("abort", () => resolve(false), { once: true });
            update({ phase: "confirm", computer, name: code.name, sas }, controller);
          });
          decision.current = null;
          if (!confirmed || signal.aborted) throw new AccountPairingError("cancelled");
          assertAppAccess();
        }
        update({ phase: "connecting", computer }, controller);
        const claimId = pairingClaimId(await Crypto.getRandomBytesAsync(32));
        // The phone key exists before the credential does; it is persisted with the credential.
        const proofSeed = newProofSeed();
        const redeemed = await redeemMobilePairingCode(code, claimId, pairingPhoneName(), {
          signal,
          assertAccess: assertAppAccess,
          proofKey: proofKeyOf(proofSeed),
          previousProofSeed: await credentials.pairedProofSeed(code.environmentId),
          installId: phoneInstallId(code.environmentId),
        });
        if (signal.aborted) throw new AccountPairingError("cancelled");
        await connectComputer(
          {
            name: code.name,
            endpoint: code.endpoint,
            lanKey: code.lanKey,
            credential: redeemed.token,
            expectedEnvironmentId: code.environmentId,
            proofSeed,
            ...(pairingRouteIsPublic(code) ? { public: true as const } : {}),
          },
          {
            discover: (endpoint, credential, currentSignal, lanKey, environmentId, seed) =>
              discoverMachine(endpoint, credential, {
                signal: currentSignal,
                lanKey,
                environmentId,
                proofSeed: seed,
              }),
            flushDrafts: flushWorkspaceDrafts,
            getMachines: () => useMachines.getState().machines,
            saveMachine: (machine, credential, seed) =>
              useMachines.getState().saveMachine(machine, credential, seed),
            createId: () => Crypto.randomUUID(),
            assertAccess: assertAppAccess,
            signal,
          },
        );
        if (request.current === controller) request.current = null;
        if (mounted.current) setState({ phase: "idle" });
        // Home is already beneath the Computers page: return to it instead of stacking a second one.
        leaveTo("/");
      } catch (error) {
        if (signal.aborted && request.current !== controller) return;
        const message =
          error instanceof AccountPairingError
            ? accountPairingMessage(error, copy)
            : error instanceof PairingFailure ||
                error instanceof MobilePairingCodeError ||
                error instanceof RemoteHostError
              ? pairingErrorMessage(error, copy)
              : accountPairingMessage(error, copy);
        update({ phase: "error", computer, message }, controller);
      } finally {
        if (request.current === controller || request.current === null) inFlight.current = false;
      }
    },
    [runtime, copy],
  );

  return { state, start, cancel, confirm };
}
