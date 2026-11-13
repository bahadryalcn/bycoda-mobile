import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useActiveMachine } from "@/state/machines";
import { hostKey } from "@/state/host-request";
import { Body, Button, Notice, Row, Screen } from "@/ui/primitives";
import { PrivateContentAccessProvider } from "@/ui/private-access";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { friendlyProviderFailure } from "@/ui/error-message";
import { space } from "@/ui/tokens";
import { UsageLimits } from "../tools/usage-limits";
import type { UsageLimitsReport } from "../tools/usage-limits-model";
import { ModelPicker } from "./model-picker";
import type { ProviderChoice } from "./provider-choices";
import type { AgentModel } from "../../../../src/features/sessions/model/models";

const modes = ["Demo", "Worst", "Empty", "Removed", "Quota", "Error"] as const;
type Mode = typeof modes[number];
const noAccess = { allowed: false, check: () => false };
const fixtureAccess = { allowed: true, check: () => true };

/** Only imported by the existing __DEV__ workspace route. No Host writes or real query cache. */
export function UiCoherenceStressScreen({ surface, header }: { surface: "models" | "limits"; header: ReactNode }) {
  const [mode, setMode] = useState<Mode>("Demo");
  return <Screen title="UI coherence fixtures">
    {header}
    <Body muted>Isolated data. No Host requests, account changes or messages.</Body>
    <Row>{modes.map(value => <Button key={value} label={value} selected={mode === value} onPress={() => setMode(value)} />)}</Row>
    {surface === "models" ? <ModelScenario key={mode} mode={mode} /> : <LimitsScenario key={mode} mode={mode} />}
  </Screen>;
}

function ModelScenario({ mode }: { mode: Mode }) {
  const [open, setOpen] = useState(false);
  const [accountKey, setAccountKey] = useState(mode === "Removed" ? "claude:gone" : "claude:research");
  const [model, setModel] = useState(mode === "Empty" ? "" : "claude:fixture-0");
  const [settings, setSettings] = useState<Record<string, string>>({ effort: "medium" });
  const copy = useCopy();
  const choices: ProviderChoice[] = mode === "Empty" ? [] : [{ key: "claude:research", provider: "claude", accountId: "research", label: mode === "Worst" ? "Aleksandra Wiśniewska-Kowalczyk İstanbul araştırma hesabı العربية 🧪" : "Research account" }];
  const unavailable = mode === "Removed" && !choices.some(choice => choice.key === accountKey);
  const choice = unavailable ? { key: accountKey, provider: "claude" as const, label: "Account unavailable" } : choices.find(choice => choice.key === accountKey);
  const models: AgentModel[] = mode === "Empty" ? [] : Array.from({ length: mode === "Worst" ? 12 : 1 }, (_, index) => ({ id: `claude:fixture-${index}`, harness: "claude", name: mode === "Worst" ? `Northwind research inference profile İstanbul العربية 🧪 ${index + 1}` : "Claude Sonnet", settings: [{ id: "effort", label: "Reasoning", kind: "select", value: "medium", options: [{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }] }] }));
  return <PrivateContentAccessProvider value={fixtureAccess}>
    <Row><Button label="Open model picker" onPress={() => setOpen(true)} /></Row>
    <Body>Selected fixture account: {choice?.label ?? "None"}</Body>
    <ModelPicker visible={open} onClose={() => setOpen(false)} choices={choices} choice={choice} models={models} model={model} settings={settings} unavailableAccount={unavailable}
      notice={mode === "Quota" ? <Notice tone="warning" message={friendlyProviderFailure("You've hit your weekly limit", copy)} /> : unavailable ? <Notice tone="warning" message="The saved account is unavailable. Choose an available account to change the model." /> : mode === "Error" ? <Notice tone="danger" message="The model catalog could not be read. Existing selection is kept." /> : undefined}
      onChooseProvider={next => setAccountKey(next.key)} onChange={(next, values) => { setModel(next); setSettings(values); }} />
  </PrivateContentAccessProvider>;
}

function LimitsScenario({ mode }: { mode: Mode }) {
  const machine = useActiveMachine();
  const { colors } = useMobileTheme();
  const [cache] = useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const sampledAt = 1794564000000;
    const account = { id: "research", label: mode === "Worst" ? "Aleksandra Wiśniewska-Kowalczyk İstanbul araştırma hesabı العربية 🧪" : "Research account", color: colors.accent };
    const accounts = mode === "Worst" ? [account, { ...account, id: "research-personal", label: "Aleksandra Wiśniewska-Kowalczyk İstanbul kişisel hesabı العربية 🧪" }] : [account];
    const reading = { usedPercent: mode === "Quota" ? 100 : 75, leftPercent: mode === "Quota" ? 0 : 25, regainPercent: 75, windowMinutes: 300, resetsAt: mode === "Empty" ? null : sampledAt + 3600000, timeLeftPercent: null, pace: null };
    const report: UsageLimitsReport = { environmentId: "isolated-fixture", sampledAt, source: "host-provider-api", providers: mode === "Empty" ? [] : [{ provider: "claude", accounts: accounts.map((entry, index) => ({ ...entry, status: mode === "Error" ? "error" : "ok", error: mode === "Error" ? "Fixture reading unavailable" : null, resetCredits: index === 0 ? 0 : 2 })), cards: mode === "Error" ? [] : ["session", "weekly"].map(kind => {
      const window = kind === "weekly" ? { ...reading, windowMinutes: 10080, resetsAt: sampledAt + 3 * 86400000 } : reading;
      return { key: kind, kind: kind as "session" | "weekly", model: null, best: window, accounts: accounts.map(entry => ({ ...entry, reading: window })) };
    }) }] };
    client.setQueryData(hostKey(machine?.id ?? null, ["usage-limits", { method: "usage.limits.read", params: {} }]), report);
    return client;
  });
  return <PrivateContentAccessProvider value={noAccess}><QueryClientProvider client={cache}><View style={{ gap: space.sm }}><UsageLimits /></View></QueryClientProvider></PrivateContentAccessProvider>;
}
