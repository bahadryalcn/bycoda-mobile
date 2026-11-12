import { useCallback, useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { MobilePairingCodeError } from "../../../../src/integrations/mobile-pairing";
import { discoverMachine, RemoteHostError } from "@/remote/transport";
import { useMachines } from "@/state/machines";
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
import { pairingClaimId, pairingErrorMessage, PairingFailure } from "./pairing-code";
import { redeemMobilePairingCode } from "./pairing-redeem";

const phoneName = "Bycoda phone";

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
    setState({ phase: "idle" });
  }, []);

  /** Answers the "connect to new computer" step; cancel and unmount abort it instead. */
  const confirm = useCallback(() => decision.current?.(true), []);

  const start = useCallback(
    async (computer: Computer) => {
      request.current?.abort();
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
        const redeemed = await redeemMobilePairingCode(code, claimId, phoneName, {
          signal,
          assertAccess: assertAppAccess,
        });
        if (signal.aborted) throw new AccountPairingError("cancelled");
        await connectComputer(
          {
            name: code.name,
            endpoint: code.endpoint,
            lanKey: code.lanKey,
            credential: redeemed.token,
            expectedEnvironmentId: code.environmentId,
          },
          {
            discover: (endpoint, credential, currentSignal, lanKey, environmentId) =>
              discoverMachine(endpoint, credential, { signal: currentSignal, lanKey, environmentId }),
            flushDrafts: flushWorkspaceDrafts,
            getMachines: () => useMachines.getState().machines,
            saveMachine: (machine, credential) =>
              useMachines.getState().saveMachine(machine, credential),
            createId: () => Crypto.randomUUID(),
            assertAccess: assertAppAccess,
            signal,
          },
        );
        if (request.current === controller) request.current = null;
        if (mounted.current) setState({ phase: "idle" });
        router.replace("/");
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
      }
    },
    [runtime, copy],
  );

  return { state, start, cancel, confirm };
}
