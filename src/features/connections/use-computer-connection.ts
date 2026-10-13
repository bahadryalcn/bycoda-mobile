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
import { connectComputer } from "./computer-connection";
import {
  pairingClaimId,
  pairingErrorMessage,
  parseMobilePairingCode,
  PairingFailure,
} from "./pairing-code";
import { redeemMobilePairingCode } from "./pairing-redeem";
import { ConnectionRecoveryError } from "./recovery";
import type {
  ConnectionDraft,
  ConnectionEntryState,
  ComputerConnectionInput,
} from "./connection-types";
import type { MobileMachine } from "@/remote/types";

const emptyDraft: ConnectionDraft = { name: "", endpoint: "", token: "", target: null };
const phoneName = "Bycoda phone";

export function useComputerConnection() {
  const copy = useCopy();
  const form = useFormDraft<ConnectionDraft>(emptyDraft);
  const operation = useAsyncAction<{ message?: string }>();
  const [entry, setEntry] = useState<ConnectionEntryState>({ kind: "choices" });
  const [connectionMode, setConnectionMode] = useState<"lan" | "tailscale">("lan");
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const foreground = useRef(AppState.currentState === "active");
  const access = useSecurity((state) => state.status);

  const assertAccess = () => {
    assertAppAccess();
    if (
      !mounted.current ||
      (process.env.EXPO_OS !== "web" && (!foreground.current || AppState.currentState !== "active"))
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
    const clear = () => {
      generation.current++;
      request.current?.abort();
      form.patch({ token: "" });
      setEntry((current) => (current.kind === "scan" ? current : { kind: "choices" }));
      operation.reset();
    };
    const changed = AppState.addEventListener("change", (state) => {
      foreground.current = state === "active";
      if (!foreground.current) clear();
    });
    const blurred =
      process.env.EXPO_OS === "android"
        ? AppState.addEventListener("blur", () => {
            foreground.current = false;
            clear();
          })
        : null;
    const returned =
      process.env.EXPO_OS === "android"
        ? AppState.addEventListener("focus", () => {
            foreground.current = AppState.currentState === "active";
          })
        : null;
    return () => {
      changed.remove();
      blurred?.remove();
      returned?.remove();
    };
  }, [form.patch, operation.reset]);

  useEffect(() => {
    if (access === "unlocked") return;
    generation.current++;
    request.current?.abort();
    form.patch({ token: "" });
    // Permission dialogs can lock the app. Resume the secret-free scanner after unlock.
    setEntry((current) => (current.kind === "scan" ? current : { kind: "choices" }));
    operation.reset();
  }, [access, form.patch, operation.reset]);

  const cancel = () => {
    generation.current++;
    request.current?.abort();
    form.reset(emptyDraft);
    setEntry({ kind: "choices" });
    operation.reset();
  };

  const begin = (
    kind: "choices" | "methods" | "scan" | "paste" | "manual",
    mode = connectionMode,
  ) => {
    assertAccess();
    generation.current++;
    request.current?.abort();
    form.reset({ ...emptyDraft, target: { kind: "new" } });
    setConnectionMode(mode);
    setEntry({ kind });
    operation.reset();
  };

  const edit = (machine: MobileMachine) => {
    assertAccess();
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
      const code = parseMobilePairingCode(raw);
      if (Boolean(code.lanKey) !== (connectionMode === "lan")) {
        throw new Error(
          copy(
            "Kod seçtiğin bağlantı türüne ait değil. Bilgisayarda aynı bağlantı türünü seçip yeni bir kod oluştur.",
            "This code uses a different connection method. Select the same method on your computer and create a new code.",
          ),
        );
      }
      const claimId = pairingClaimId(await Crypto.getRandomBytesAsync(32));
      assertAccess();
      if (attempt !== generation.current) throw new PairingFailure("aborted");
      setEntry({ kind: "preview", code, claimId });
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
      discover: (endpoint, credential, currentSignal, lanKey, environmentId) =>
        discoverMachine(endpoint, credential, { signal: currentSignal, lanKey, environmentId }),
      flushDrafts: flushWorkspaceDrafts,
      getMachines: () => useMachines.getState().machines,
      saveMachine: (machine, credential) => useMachines.getState().saveMachine(machine, credential),
      createId: () => Crypto.randomUUID(),
      assertAccess,
      signal,
    });
  };

  const connect = async () =>
    operation.run(async () => {
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
          const redeemed = await redeemMobilePairingCode(entry.code, entry.claimId, phoneName, {
            signal: controller.signal,
            assertAccess,
          });
          check();
          await finish(
            {
              name: entry.code.name,
              endpoint: entry.code.endpoint,
              lanKey: entry.code.lanKey,
              credential: redeemed.token,
              expectedEnvironmentId: entry.code.environmentId,
            },
            controller.signal,
          );
        } else if (entry.kind === "manual") {
          const existing = useMachines
            .getState()
            .machines.find((machine) => machine.id === editingId);
          const credential =
            existing?.lanKey && !form.values.token.trim()
              ? ((await credentials.get(existing.id, existing)) ?? "")
              : form.values.token;
          check();
          await finish(
            {
              name: form.values.name,
              endpoint: form.values.endpoint,
              credential,
              editingId,
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
        form.reset(emptyDraft);
        setEntry({ kind: "choices" });
        router.replace("/");
        return { message: copy("Bilgisayar bağlandı.", "Computer connected.") };
      } catch (error) {
        if (
          error instanceof PairingFailure ||
          error instanceof MobilePairingCodeError ||
          (error instanceof RemoteHostError &&
            (entry.kind === "preview" || error.kind === "identity"))
        ) {
          throw new Error(pairingErrorMessage(error, copy));
        }
        throw error;
      } finally {
        if (request.current === controller) request.current = null;
      }
    });

  const recover = async (action: () => Promise<void>, message: string) =>
    operation.run(async () => {
      try {
        await action();
      } catch (error) {
        throw error instanceof ConnectionRecoveryError
          ? new Error(
              copy(
                "Bilgisayar seçilemedi. Kaydedilmiş bağlantıları yeniden yükleyip tekrar dene.",
                "Computer selection is unavailable. Reload saved connections and try again.",
              ),
            )
          : error;
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
  };
}
