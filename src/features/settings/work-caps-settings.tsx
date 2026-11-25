import { useRef, useState } from "react";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { errorMessage } from "@/ui/error-message";
import { RemoteHostError } from "@/remote/host-error";
import { Button, Disclosure, FormActions, Notice, QueryState, SelectField, Stack } from "@/ui/primitives";
import { LimitPresets } from "@/ui/limit-presets";
import { useLocale } from "@/i18n";
import { useSheetGuard } from "@/ui/sheet-guard";
import { providerName } from "../workspace/provider-choices";
import type { RemoteProvider } from "@/domain/types";
import { ModelRoutingGetResultSchema, ModelRoutingSaveResultSchema, type ModelRoutingState } from "../../../../src/shared/model/host-contracts/model-routing";
import { workCapFields as fields, parseWorkCapFields as parsedFields, type WorkCapFields as Fields } from "./work-caps-model";
const TOKEN_PRESETS = ["0", "100000", "500000", "1000000", "5000000", "10000000"] as const;
const COST_PRESETS = ["0", "5", "10", "25", "50", "100", "250"] as const;
export function WorkCapsSettings({ current, enabled }: { current(): boolean; enabled: boolean }) {
  const copy = useCopy(), machine = useActiveMachine();
  const supported = enabled && machine?.capabilities?.includes("models.routing.v1") === true;
  const query = useHostQuery<ModelRoutingState>(["modelRouting"], "modelRouting.get", {}, { enabled: supported,
    queryFn: async (client, signal) => {
      if (!current()) throw new Error(copy("Bilgisayar bağlantısı değişti.", "Computer connection changed."));
      const result = ModelRoutingGetResultSchema.parse(await client.request("modelRouting.get", {}, { signal }));
      if (!current()) throw new Error(copy("Bilgisayar bağlantısı değişti.", "Computer connection changed."));
      return result.state;
    } });
  return <Disclosure label={copy("Token ve maliyet sınırları", "Token and cost caps")}>
    {!supported ? <Notice message={copy("Work sınırları için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer for Work caps.")} /> : <>
      <QueryState query={query} />
      {query.data && current() ? <WorkCapsEditor initial={query.data} current={current} providers={machine?.providers ?? []} onReload={async () => { const result = await query.refetch(); if (!result.data || result.isError) throw result.error; return result.data; }} /> : null}
    </>}
  </Disclosure>;
}
/** A stale version (the Host says so) or a write that may have landed locks the form until reload; other failures keep the draft editable. */
export function locksUntilReload(error: unknown) {
  return error instanceof RemoteHostError && (error.uncertain || error.kind === "timeout" || /changed; reload before saving/.test(error.message));
}
/** A reply that cannot be verified may hide a landed write, so it holds the draft like an uncertain save. */
export function holdsUnconfirmedSave(error: unknown) {
  return !(error instanceof RemoteHostError) || locksUntilReload(error);
}
/** Only Host errors carry copy this app can show; anything else is reduced to the generic outcome. */
export function failureText(error: unknown, copy: ReturnType<typeof useCopy>) {
  return errorMessage(error instanceof RemoteHostError ? error : undefined, copy);
}
function WorkCapsEditor({ initial, current, providers, onReload }: { initial: ModelRoutingState; current(): boolean; providers: RemoteProvider[]; onReload(): Promise<ModelRoutingState> }) {
  const copy = useCopy(), locale = useLocale();
  const [opening, setOpening] = useState(initial), [scope, setScope] = useState("total"), [edits, setEdits] = useState<Record<string, Fields>>({});
  const [held, setHeld] = useState(false), [busy, setBusy] = useState(false), [failure, setFailure] = useState<string>();
  const pending = useRef(false);
  const save = useHostMutation("modelRouting.save", ["modelRouting"]);
  const dirty = Object.keys(edits).length > 0;
  useSheetGuard({ dirty, pending: busy });
  const caps = opening.workCaps;
  const value = edits[scope] ?? fields(scope === "total" ? caps?.total : caps?.providers?.[scope as RemoteProvider]);
  const valid = Object.values(edits).every(value => parsedFields(value) !== undefined);
  const submit = async () => {
    if (pending.current || held || !dirty || !valid || !current()) return;
    pending.current = true; setBusy(true); setFailure(undefined);
    try {
      const workCaps = { ...opening.workCaps, providers: { ...opening.workCaps?.providers } };
      for (const [key, value] of Object.entries(edits)) {
        const parsed = parsedFields(value)!;
        if (key === "total") workCaps.total = parsed;
        else workCaps.providers[key as RemoteProvider] = parsed;
      }
      const { version, updatedAt: _updatedAt, ...draft } = opening;
      const result = ModelRoutingSaveResultSchema.parse(await save.mutateAsync({ expectedVersion: version, draft: { ...draft, workCaps } }));
      if (!current()) return;
      // Not confirmed: the Host may hold other caps than the draft, so the edits wait for a reload.
      const confirmed = Object.entries(edits).every(([key, value]) => {
        const expected = parsedFields(value)!;
        const received = key === "total" ? result.state.workCaps?.total : result.state.workCaps?.providers?.[key as RemoteProvider];
        return received?.daily?.tokens === expected.daily?.tokens && received?.daily?.costUsd === expected.daily?.costUsd && received?.monthly?.tokens === expected.monthly?.tokens && received?.monthly?.costUsd === expected.monthly?.costUsd;
      });
      if (result.state.version <= version || !confirmed) { setHeld(true); return; }
      setOpening(result.state); setEdits({});
    } catch (error) {
      if (!current()) return;
      if (locksUntilReload(error)) setHeld(true);
      else setFailure(failureText(error, copy));
    } finally { pending.current = false; if (current()) setBusy(false); }
  };
  const reload = async () => {
    if (pending.current || !current()) return;
    pending.current = true; setBusy(true); setFailure(undefined);
    try { const state = await onReload(); if (current()) { setOpening(state); setEdits({}); setHeld(false); } }
    catch (error) { if (current()) setFailure(failureText(error, copy)); }
    finally { pending.current = false; if (current()) setBusy(false); }
  };
  const labels: Record<keyof Fields, string> = { dailyTokens: copy("Günlük token", "Daily tokens"), monthlyTokens: copy("Aylık token", "Monthly tokens"), dailyCost: copy("Günlük maliyet (USD)", "Daily cost (USD)"), monthlyCost: copy("Aylık maliyet (USD)", "Monthly cost (USD)") };
  return <Stack>
    <SelectField label={copy("Kapsam", "Scope")} value={scope} disabled={busy || held}
      hint={copy("Sağlayıcı ve toplam sınırlar birlikte uygulanır.", "Provider and total caps both apply.")}
      options={[{ value: "total", label: copy("Toplam", "Total") }, ...[...new Set([...providers, ...Object.keys(caps?.providers ?? {})])].map(value => ({ value, label: providerName(value) }))]} onChange={setScope} />
    {(Object.keys(labels) as (keyof Fields)[]).map(key => {
      const cost = key.endsWith("Cost"), text = value[key];
      return <LimitPresets key={`${scope}:${key}`} label={labels[key]} customLabel={labels[key]} unit={cost ? "USD" : undefined}
        values={cost ? COST_PRESETS : TOKEN_PRESETS} value={text === "" ? "0" : text} disabled={busy || held}
        invalid={text !== "" && !/^\d+(?:\.\d+)?$/.test(text)}
        format={preset => preset === "0" ? copy("Sınırsız", "Unlimited") : cost ? `$${new Intl.NumberFormat(locale).format(Number(preset))}` : new Intl.NumberFormat(locale, { notation: "compact" }).format(Number(preset))}
        onChange={next => setEdits(previous => ({ ...previous, [scope]: { ...value, [key]: next } }))} />;
    })}
    {!valid ? <Notice tone="warning" message={copy("Tokenlar güvenli tam sayı, maliyetler sıfır veya pozitif sayı olmalıdır.", "Tokens must be safe integers; costs must be zero or positive numbers.")} /> : null}
    {failure ? <Notice tone="danger" message={failure} /> : null}
    {held ? <Notice tone="warning" message={copy("Kaydetme doğrulanamadı veya ayarlar değişti. Tekrar göndermeden güncel ayarları yükleyin; bu düzenlemeleri sıfırlar.", "Save was not confirmed or settings changed. Load current settings before sending again; this resets these edits.")} /> : null}
    <FormActions placement="inline" submitLabel={copy("Sınırları kaydet", "Save limits")} busy={busy} disabled={held || !dirty || !valid || !current()} onSubmit={() => void submit()} />
    {held ? <Button label={copy("Güncel ayarları yükle", "Load current settings")} busy={busy} disabled={busy} onPress={() => void reload()} /> : null}
  </Stack>;
}
