import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AccountApiError, type Device } from "../contracts";
import { createAccountRuntime } from "../model/account-runtime";
import { accountConfig } from "../model/config";
import { deviceRegistration } from "../model/device-registration";
import { readDeviceInfo } from "../model/device-info";
import { secureDeviceIdStore, securePushMarkStore } from "../model/device-store";
import { useAccountHostPushDedupe, useAccountPushSync } from "../model/push-account";
import { useAccountPushReads } from "../model/push-read";
import { useAccountAccess } from "../model/account-access";
import { AccountContext, type AccountAuth, type AccountState } from "./account-context";

/**
 * Turns a sign-in provider into the app-wide account state: builds the API client (device header,
 * revoked-device handling), registers this phone after sign-in and signs out cleanly.
 */
export function AccountSession({
  auth,
  fetchImpl,
  mockSignIn,
  children,
}: PropsWithChildren<{ auth: AccountAuth; fetchImpl?: typeof fetch; mockSignIn?: () => void }>) {
  const queries = useQueryClient();
  const authRef = useRef(auth);
  authRef.current = auth;
  const [device, setDevice] = useState<Device | null>(null);
  const [registerError, setRegisterError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const status = !auth.loaded ? "loading" : auth.signedIn ? "signedIn" : "signedOut";

  // Authentication changes fence Host work before passive effects or new screen reads run.
  useLayoutEffect(() => {
    useAccountAccess.setState({ status });
    // SDK revocation/sign-out can bypass our button; no later login may inherit this account's cache.
    if (status !== "signedIn") {
      void queries.cancelQueries({ queryKey: ["account"] }).catch(() => undefined);
      queries.removeQueries({ queryKey: ["account"] });
    }
    return () => { useAccountAccess.setState({ status: "loading" }); };
  }, [status, queries]);

  const runtime = useMemo(
    () =>
      createAccountRuntime({
        baseUrl: accountConfig.apiUrl,
        getToken: () => authRef.current.getToken(),
        fetch: fetchImpl ?? ((input, init) => fetch(input, init)),
        store: secureDeviceIdStore,
        // Local data, drafts and pairings stay; only the account session ends.
        onDeviceRevoked: async () => {
          useAccountAccess.setState({ status: "signedOut" });
          setDevice(null);
          await securePushMarkStore.clear().catch(() => undefined);
          queries.removeQueries({ queryKey: ["account"] });
          await authRef.current.signOut().catch(() => undefined);
        },
      }),
    [fetchImpl, queries],
  );

  useEffect(() => {
    if (!auth.loaded || !auth.signedIn) {
      setDevice(null);
      return;
    }
    let cancelled = false;
    setRegisterError(null);
    runtime
      .registerDevice((id) => deviceRegistration(readDeviceInfo(), id))
      .then((registered) => {
        if (!cancelled) setDevice(registered);
      })
      .catch((error: unknown) => {
        // device_revoked already signed this phone out inside the runtime.
        if (cancelled || (error instanceof AccountApiError && error.code === "device_revoked")) return;
        // Diagnostics keep the server's reason; the account screen shows the owner-facing message.
        console.warn("Device registration failed", error instanceof AccountApiError ? `${error.status} ${error.code}: ${error.message} (${error.requestId})` : String(error));
        // TEMP-DIAG: token claims only (never the token).
        void authRef.current.getToken().then((t) => {
          if (!t) return console.warn("TEMP-DIAG token: none");
          try {
            const c = JSON.parse(globalThis.atob(t.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
            console.warn("TEMP-DIAG token", JSON.stringify({ iss: c.iss, azp: c.azp, aud: c.aud, exp: c.exp, iat: c.iat, now: Math.floor(Date.now() / 1000), sid: !!c.sid, v: c.v }));
          } catch (e) { console.warn("TEMP-DIAG token parse", String(e)); }
        }, (e) => console.warn("TEMP-DIAG getToken failed", String(e)));
        setRegisterError(error instanceof Error ? error : new Error(String(error)));
      });
    return () => {
      cancelled = true;
    };
  }, [auth.loaded, auth.signedIn, runtime, attempt]);

  useAccountPushSync(auth.signedIn ? runtime : null, device);
  useAccountHostPushDedupe(auth.signedIn ? runtime : null, device);
  useAccountPushReads(auth.signedIn ? runtime : null, device);

  const signOut = useCallback(async () => {
    useAccountAccess.setState({ status: "signedOut" });
    try {
      await runtime.releaseDevice();
      await securePushMarkStore.clear().catch(() => undefined);
      setDevice(null);
      queries.removeQueries({ queryKey: ["account"] });
      await authRef.current.signOut();
    } catch (error) {
      useAccountAccess.setState({ status: authRef.current.signedIn ? "signedIn" : "signedOut" });
      throw error;
    }
  }, [runtime, queries]);

  const value = useMemo<AccountState>(
    () => ({
      status,
      config: accountConfig,
      runtime,
      device,
      registerError,
      retryRegistration: () => setAttempt((count) => count + 1),
      signOut,
      mockSignIn,
    }),
    [auth.loaded, auth.signedIn, runtime, device, registerError, signOut, mockSignIn],
  );
  return <AccountContext value={value}>{children}</AccountContext>;
}
