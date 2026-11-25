import { useLayoutEffect, useMemo, useState } from "react";
import { Badge, Body, Button, Disclosure, Field, QueryState, Row, SelectField, Stack, StateView } from "@/ui/primitives";
import { ProviderState } from "../../inbox/issue-record-row";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useInboxRead } from "../../inbox/provider-queries";
import type { InboxItemInput, InboxWriteCommand } from "../../inbox/provider-protocol";
import { isInboxPrivateFailure } from "../../inbox/provider-model";
import { providerStateLabel, providerStateTone } from "../../inbox/provider-labels";

/** Writes use the detail owner's scope lease, single flight and uncertain-result hold. */
export function PullRequestMetadata({ input, canRead, disabled, onCommand }: { input: InboxItemInput; canRead: boolean; disabled: boolean; onCommand: (command: InboxWriteCommand) => void }) {
  const copy = useCopy();
  const [login, setLogin] = useState(""), [label, setLabel] = useState("");
  const reviewers = useInboxRead({ action: "reviewers", input: { ...input, mode: "list", logins: [] } }, canRead);
  const labels = useInboxRead({ action: "labels", input: { ...input, mode: "list", names: [] } }, canRead);
  const checks = useInboxRead({ action: "checks", input }, canRead);
  const privateFailure = isInboxPrivateFailure(reviewers.error, labels.error, checks.error);
  const lease = useMemo(() => ({ active: false }), [canRead, disabled, privateFailure]);
  // Retire native confirmation callbacks when metadata access or write availability changes.
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  // The three reads share one access failure: report it once, compactly, from the first read that failed.
  if (!canRead || privateFailure) {
    const failed = [checks, reviewers, labels].find((read) => read.error) ?? checks;
    return <Stack><QueryState size="compact" query={{ ...failed, data: undefined }} /></Stack>;
  }
  const confirm = (command: InboxWriteCommand, description: string) => {
    if (disabled || !lease.active) return;
    confirmAction(copy("Pull request’i güncelle", "Update pull request"), `${input.item.repo} #${input.item.number}\n${description}`, copy("Uygula", "Apply"), () => { if (lease.active) onCommand(command); }, copy("Vazgeç", "Cancel"));
  };
  const checkLabels: Record<string, string> = { pass: copy("Başarılı", "Passed"), fail: copy("Başarısız", "Failed"), pending: copy("Bekliyor", "Pending"), skipping: copy("Atlandı", "Skipped"), cancel: copy("İptal edildi", "Cancelled"), unknown: copy("Bilinmiyor", "Unknown") };
  const checkTones = { pass: "default", fail: "danger", pending: "active" } as const;
  return <Stack>
    <Disclosure label={copy("Kontroller", "Checks")} defaultExpanded>
      <QueryState size="compact" query={checks} />
      {checks.data ? <><Body mono muted>{checks.data.headOid}</Body>
        {checks.data.checks.length === 0 ? <StateView size="compact" title={copy("Kontrol yok", "No checks")} /> : checks.data.checks.map((check, index) => <Row key={`${check.name}:${index}`}><Body>{[check.workflow, check.name].filter(Boolean).join(" · ")}</Body><ProviderState label={checkLabels[check.state] ?? checkLabels.unknown!} tone={checkTones[check.state as keyof typeof checkTones] ?? "default"} /></Row>)}
      </> : null}
    </Disclosure>
    <Disclosure label={copy("İnceleyenler", "Reviewers")}>
      <QueryState size="compact" query={reviewers} />
      {reviewers.data?.reviewRequests.map((reviewer, index) => <Row key={`${reviewer.login ?? reviewer.name}:${index}`}>
        <Body>{reviewer.login ?? reviewer.name}</Body>
        {reviewer.login ? <Button tone="quiet" disabled={disabled || !!reviewers.error || reviewers.isFetching} label={copy("İnceleyeni kaldır", "Remove reviewer")} accessibilityLabel={copy("{p0} adlı inceleyeni kaldır", "Remove reviewer {p0}", { p0: reviewer.login })} onPress={() => confirm({ action: "reviewers", input: { ...input, mode: "remove", logins: [reviewer.login!], confirm: "CHANGE_PR_REVIEWERS" } }, copy("İnceleyeni kaldır: {p0}", "Remove reviewer: {p0}", { p0: reviewer.login! }))} /> : null}
      </Row>)}
      {reviewers.data?.latestReviews.map((review, index) => <Row key={`${review.author.login}:${index}`}><Body>{review.author.login}</Body><ProviderState label={providerStateLabel(review.state, copy)} tone={providerStateTone(review.state)} /></Row>)}
      <Field label={copy("GitHub kullanıcı adı", "GitHub username")} value={login} maxLength={100} editable={!disabled} onChangeText={setLogin} />
      <Button label={copy("İnceleme iste", "Request review")} disabled={disabled || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(login) || !reviewers.data || !!reviewers.error || reviewers.isFetching}
        onPress={() => confirm({ action: "reviewers", input: { ...input, mode: "request", logins: [login], confirm: "CHANGE_PR_REVIEWERS" } }, copy("İnceleme iste: {p0}", "Request review from: {p0}", { p0: login }))} />
    </Disclosure>
    <Disclosure label={copy("Etiketler", "Labels")}>
      <QueryState size="compact" query={labels} />
      {labels.data?.labels.map(current => <Row key={current.name}><Badge label={current.name} />
        <Button label={copy("Etiketi kaldır", "Remove label")} tone="quiet" disabled={disabled || !!labels.error || labels.isFetching}
          accessibilityLabel={copy("{p0} etiketini kaldır", "Remove label {p0}", { p0: current.name })}
          onPress={() => confirm({ action: "labels", input: { ...input, mode: "remove", names: [current.name], confirm: "CHANGE_PR_LABELS" } }, copy("Etiketi kaldır: {p0}", "Remove label: {p0}", { p0: current.name }))} />
      </Row>)}
      <SelectField label={copy("Depo etiketi", "Repository label")} value={label} disabled={disabled || !labels.data || !!labels.error || labels.isFetching}
        options={(labels.data?.available ?? []).map(current => ({ value: current.name, label: current.name }))} onChange={setLabel} />
      <Button label={copy("Etiket ekle", "Add label")} disabled={disabled || !label || !labels.data?.available.some(current => current.name === label) || !!labels.error || labels.isFetching}
        onPress={() => confirm({ action: "labels", input: { ...input, mode: "add", names: [label], confirm: "CHANGE_PR_LABELS" } }, copy("Etiket ekle: {p0}", "Add label: {p0}", { p0: label }))} />
      {labels.data?.truncated ? <Body muted>{copy("Depo etiketlerinin bir bölümü gösteriliyor.", "Part of the repository labels are shown.")}</Body> : null}
    </Disclosure>
  </Stack>;
}
