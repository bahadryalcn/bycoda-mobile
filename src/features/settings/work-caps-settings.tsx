import { useRef, useState } from "react";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { Body, Button, Disclosure, FormActions, Notice, NumberField, QueryState, SelectField, Stack } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import type { RemoteProvider } from "@/domain/types";
import { ModelRoutingGetResultSchema, ModelRoutingSaveResultSchema, type ModelRoutingState } from "../../../../src/shared/model/host-contracts/model-routing";
import { workCapFields as fields, parseWorkCapFields as parsedFields, type WorkCapFields as Fields } from "./work-caps-model";
export function WorkCapsSettings({ current, enabled }: { current(): boolean; enabled: boolean }) {
  const copy = useCopy(), machine = useActiveMachine();
  const supported = enabled && machine?.capabilities?.includes("models.routing.v1") === true;
  const query = useHostQuery<ModelRoutingState>(["modelRouting"], "modelRouting.get", {}, { enabled: supported,
    queryFn: async (client, signal) => {
      if (!current()) throw new Error("Computer connection changed.");
      const result = ModelRoutingGetResultSchema.parse(await client.request("modelRouting.get", {}, { signal }));
      if (!current()) throw new Error("Computer connection changed.");
      return result.state;
    } });
  return <Disclosure label={copy("Token ve maliyet sınırları", "Token and cost caps")}>
    {!supported ? <Notice message={copy("Work sınırları için bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer for Work caps.")} /> : <>
      <QueryState query={query} />
      {query.data && current() ? <WorkCapsEditor initial={query.data} current={current} providers={machine?.providers ?? []} onReload={async () => { const result = await query.refetch(); if (!result.data || result.isError) throw result.error; return result.data; }} /> : null}
    </>}
  </Disclosure>;
}
function WorkCapsEditor({ initial, current, providers, onReload }: { initial: ModelRoutingState; current(): boolean; providers: RemoteProvider[]; onReload(): Promise<ModelRoutingState> }) {
  const copy = useCopy();
  const [opening, setOpening] = useState(initial), [scope, setScope] = useState("total"), [edits, setEdits] = useState<Record<string, Fields>>({});
  const [held, setHeld] = useState(false), [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const save = useHostMutation("modelRouting.save", ["modelRouting"]);
  const dirty = Object.keys(edits).length > 0;
  useSheetGuard({ dirty, pending: busy });
  const caps = opening.workCaps;
  const value = edits[scope] ?? fields(scope === "total" ? caps?.total : caps?.providers?.[scope as RemoteProvider]);
  const valid = Object.values(edits).every(value => parsedFields(value) !== undefined);
  const submit = async () => {
    if (pending.current || held || !dirty || !valid || !current()) return;
    pending.current = true; setBusy(true);
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
      if (result.state.version <= version) throw new Error("Work caps were not confirmed.");
      for (const [key, value] of Object.entries(edits)) {
        const expected = parsedFields(value)!;
        const received = key === "total" ? result.state.workCaps?.total : result.state.workCaps?.providers?.[key as RemoteProvider];
        if (received?.daily?.tokens !== expected.daily?.tokens || received?.daily?.costUsd !== expected.daily?.costUsd || received?.monthly?.tokens !== expected.monthly?.tokens || received?.monthly?.costUsd !== expected.monthly?.costUsd)
          throw new Error("Work caps were not confirmed.");
      }
      setOpening(result.state); setEdits({});
    } catch { if (current()) setHeld(true); }
    finally { pending.current = false; if (current()) setBusy(false); }
  };
  const reload = async () => {
    if (pending.current || !current()) return;
    pending.current = true; setBusy(true);
    try { const state = await onReload(); if (current()) { setOpening(state); setEdits({}); setHeld(false); } }
    catch { if (current()) setHeld(true); }
    finally { pending.current = false; if (current()) setBusy(false); }
  };
  const labels: Record<keyof Fields, string> = { dailyTokens: copy("Günlük token", "Daily tokens"), monthlyTokens: copy("Aylık token", "Monthly tokens"), dailyCost: copy("Günlük maliyet (USD)", "Daily cost (USD)"), monthlyCost: copy("Aylık maliyet (USD)", "Monthly cost (USD)") };
  return <Stack>
    <Body muted>{copy("Work için takvim sınırları. Boş veya 0 = sınırsız. Sağlayıcı ve toplam sınırları birlikte uygulanır.", "Calendar caps for Work. Empty or 0 = unlimited. Provider and total caps both apply.")}</Body>
    <SelectField label={copy("Kapsam", "Scope")} value={scope} disabled={busy || held}
      options={[{ value: "total", label: copy("Toplam", "Total") }, ...[...new Set([...providers, ...Object.keys(caps?.providers ?? {})])].map(value => ({ value, label: value }))]} onChange={setScope} />
    {(Object.keys(labels) as (keyof Fields)[]).map(key => <NumberField key={key} label={labels[key]} value={value[key]} decimal={key.endsWith("Cost")} editable={!busy && !held}
      onChangeText={text => setEdits(previous => ({ ...previous, [scope]: { ...value, [key]: text } }))} />)}
    {!valid ? <Notice tone="warning" message={copy("Tokenlar güvenli tam sayı, maliyetler sıfır veya pozitif sayı olmalıdır.", "Tokens must be safe integers; costs must be zero or positive numbers.")} /> : null}
    {held ? <Notice tone="warning" message={copy("Kaydetme doğrulanamadı veya ayarlar değişti. Tekrar göndermeden güncel ayarları yükleyin; bu düzenlemeleri sıfırlar.", "Save was not confirmed or settings changed. Load current settings before sending again; this resets these edits.")} /> : null}
    <FormActions submitLabel={copy("Work sınırlarını kaydet", "Save Work caps")} busy={busy} disabled={held || !dirty || !valid || !current()} onSubmit={() => void submit()} />
    {held ? <Button label={copy("Güncel ayarları yükle", "Load current settings")} busy={busy} disabled={busy} onPress={() => void reload()} /> : null}
  </Stack>;
}
