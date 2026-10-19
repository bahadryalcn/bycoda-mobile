import { useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { uiStyles } from "@/ui/styles";
import { useHostClient } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine, useMachines } from "@/state/machines";
import type { HostProject } from "@/domain/types";
import { Body, Button, Disclosure, Field, IconButton, MutationState, Notice, Row, Screen } from "@/ui/primitives";
import { RemoteFrame } from "@/ui/remote-frame";
import { ActionField } from "@/ui/action-field";
import { ActionMenu } from "@/ui/overflow-menu";
import Keyboard from "lucide-react-native/icons/keyboard";
import { useCopy } from "@/ui/copy";
import { colors } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import type { BrowserState } from "./types";

type BrowserScope = {
  client: NonNullable<ReturnType<typeof useHostClient>>;
  projectId: string;
  active: boolean;
  latest?: BrowserState;
  releasedLeaseId?: string;
  releasing?: Promise<void>;
};

// A quick leave/reopen must wait for the previous screen's late claim to be released.
const browserCleanupByHost = new Map<string, Promise<void>>();

/** Called after an in-flight request settles, including a claim that outlived its screen. */
function releaseBrowserLease(scope: BrowserScope): Promise<void> {
  const leaseId = scope.latest?.leaseId;
  if (!leaseId || scope.releasedLeaseId === leaseId) return scope.releasing ?? Promise.resolve();
  scope.releasedLeaseId = leaseId;
  scope.releasing = scope.client.request("browser.release", {
    projectId: scope.projectId, leaseId,
  }, { retry: false }).then(() => {}, () => {});
  return scope.releasing;
}

/** One serialized request path preserves the shared browser's control lease. */
export function BrowserScreen({ project }: { project: HostProject }) {
  useMobileTheme();
  const copy = useCopy();
  const client = useHostClient();
  const machine = useActiveMachine();
  const action = useAsyncAction<BrowserState>();
  const [browserState, setState] = useState<BrowserState>();
  const [browserFrame, setFrame] = useState<BrowserState>();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [now, setNow] = useState(Date.now());
  const scopeRef = useRef<BrowserScope | undefined>(undefined);
  const pending = useRef<Promise<BrowserState | undefined> | undefined>(undefined);
  const cleanup = useRef(Promise.resolve());
  const [actionScope, setActionScope] = useState<BrowserScope>();
  const current = (scope: BrowserScope) => scope.active && scopeRef.current === scope &&
    useMachines.getState().activeId === scope.client.machine.id;
  // Hide previous-host data on the render that changes scope, before effects run.
  const activeScope = scopeRef.current;
  const visibleScope = activeScope?.client === client && activeScope?.projectId === project.id
    ? activeScope : undefined;
  const state = visibleScope ? browserState : undefined;
  const frame = visibleScope ? browserFrame : undefined;
  const apply = (scope: BrowserScope, value: BrowserState) => {
    const previousNavigation = scope.latest?.navigationId;
    scope.latest = value;
    if (!current(scope)) return;
    if (previousNavigation !== value.navigationId) setFrame(undefined);
    setState(value);
    setNow(Date.now());
    if (value.data) setFrame(value);
  };
  const requestForScope = (scope: BrowserScope, method: string, params: Record<string, unknown> = {}, capture = false) => {
    if (!current(scope) || pending.current) return;
    setActionScope(scope);
    const execution = action.run(async () => {
      try {
        const result = await scope.client.request<BrowserState>(method, {
          projectId: scope.projectId, leaseId: scope.latest?.leaseId, ...params,
        }, { retry: false });
        apply(scope, result);
        if (capture && result.open && current(scope)) {
          const screenshot = await scope.client.request<BrowserState>("browser.frame", { projectId: scope.projectId }, { retry: false });
          apply(scope, screenshot);
        }
        return result;
      } catch (error) {
        if (current(scope) && ["auth", "identity"].includes((error as { kind?: string })?.kind ?? "")) {
          scope.latest = undefined;
          setState(undefined);
          setFrame(undefined);
        }
        throw error;
      } finally {
        if (!current(scope)) await releaseBrowserLease(scope);
      }
    });
    pending.current = execution;
    void execution.finally(() => {
      if (pending.current === execution) pending.current = undefined;
    });
  };
  const request = (method: string, params: Record<string, unknown> = {}, capture = false) => {
    const scope = scopeRef.current;
    if (scope?.client === client && scope?.projectId === project.id) requestForScope(scope, method, params, capture);
  };
  useEffect(() => {
    setState(undefined);
    setFrame(undefined);
    setUrl("");
    setText("");
    if (!client) {
      scopeRef.current = undefined;
      return;
    }
    const scope: BrowserScope = { client, projectId: project.id, active: true };
    const hostKey = client.machine.environmentId || client.endpoint;
    scopeRef.current = scope;
    // A replaced screen releases its lease before this scope reads or claims it.
    void Promise.all([cleanup.current, browserCleanupByHost.get(hostKey)]).then(() => {
      if (current(scope)) requestForScope(scope, "browser.status");
    });
    return () => {
      scope.active = false;
      if (scopeRef.current === scope) scopeRef.current = undefined;
      cleanup.current = Promise.resolve(pending.current).then(() => releaseBrowserLease(scope));
      const released = cleanup.current;
      browserCleanupByHost.set(hostKey, released);
      void released.finally(() => {
        if (browserCleanupByHost.get(hostKey) === released) browserCleanupByHost.delete(hostKey);
      });
    };
  }, [client, project.id]);
  useEffect(() => {
    if (!state?.controlling) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state?.controlling]);
  const controlling = !!state?.controlling && !!state.leaseId && (state.leaseExpiresAt ?? 0) > now;
  const busy = action.isPending;
  const input = (params: Record<string, unknown>) => {
    if (controlling && !busy) request("browser.input", params, true);
  };
  return (
    <Screen
      title={copy("Tarayıcı", "Browser")}
      subtitle={[machine?.name, project.name].filter(Boolean).join(" · ")}
      actions={
        <IconButton label={copy("Ekranı yenile", "Refresh screen")} disabled={busy} onPress={() => request(state?.open ? "browser.frame" : "browser.status")}>
          <RefreshCw size={22} strokeWidth={2} color={colors.accent} />
        </IconButton>
      }
    >
      <Stack.Screen options={{ title: copy("Tarayıcı", "Browser") }} />
      <Body muted style={uiStyles.caption}>{copy("Bu tarayıcı seçili bilgisayarda paylaşılır.", "This browser is shared on the selected computer.")}</Body>
      {state?.runtime && !state.runtime.installed ? <Notice message={copy("Tarayıcıyı önce bilgisayardaki bycoda’dan kur.", "Set up the browser in bycoda on your computer first.")} /> : null}
      <Row>
        <Button label={controlling ? copy("Kontrolü bırak", "Release control") : copy("Kontrolü al", "Take control")} tone={controlling ? "quiet" : "primary"} disabled={busy || !state || state.runtime?.installed === false} onPress={() => request(controlling ? "browser.release" : "browser.claim")} />
      </Row>
      <ActionField label={copy("Adres", "URL")} value={url} placeholder={state?.url ?? "https://"}
        autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={setUrl}
        actionLabel={copy("Aç", "Open")} actionDisabled={!controlling || busy || !url.trim()}
        onAction={() => request("browser.open", { url: url.trim() }, true)} />
      {state?.url ? <Body muted numberOfLines={2}>{state.url}</Body> : null}
      <MutationState mutation={actionScope === visibleScope ? action : {}} />
      {frame?.data ? <RemoteFrame
        uri={`data:${frame.mimeType ?? "image/jpeg"};base64,${frame.data}`}
        label={copy("Tarayıcı ekranı", "Browser screen")}
        width={frame.width ?? 1280}
        height={frame.height ?? 720}
        disabled={!controlling || busy}
        onPress={(point) => input({ kind: "click", ...point })}
      /> : null}
      {state?.open ? <>
        <Row>
          <IconButton label={copy("Yukarı kaydır", "Scroll up")} disabled={!controlling || busy} onPress={() => input({ kind: "scroll", y: -500 })}><ArrowUp size={20} color={colors.muted} /></IconButton>
          <IconButton label={copy("Aşağı kaydır", "Scroll down")} disabled={!controlling || busy} onPress={() => input({ kind: "scroll", y: 500 })}><ArrowDown size={20} color={colors.muted} /></IconButton>
          <ActionMenu label={copy("Klavye", "Keyboard")} trigger={<Keyboard size={20} color={colors.muted} />}
            actions={["Tab", "Enter", "Escape"].map((key) => ({
              key, label: key, disabled: !controlling || busy, onPress: () => input({ kind: "key", key }),
            }))} />
        </Row>
        <Disclosure label={copy("Metin", "Text")}>
          <Field label={copy("Metin", "Text")} value={text} maxLength={4096} multiline onChangeText={setText} />
          <Button label={copy("Metni yaz", "Type text")} disabled={!controlling || busy || !text} onPress={() => input({ kind: "text", text })} />
        </Disclosure>
      </> : null}
    </Screen>
  );
}
