import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { Badge, Body, Button, Disclosure, Field, QueryState, Row, SelectField, Stack } from "@/ui/primitives";
import { ProviderState } from "../../inbox/issue-record-row";
import { useCopy } from "@/ui/copy";
import { INBOX_RECORD_CACHE_MS, useInboxRead } from "../../inbox/provider-queries";
import { PrChecksSection } from "./checks-section";
import type { InboxItemInput, InboxWriteCommand } from "../../inbox/provider-protocol";
import { isInboxPrivateFailure } from "../../inbox/provider-model";
import { providerStateLabel, providerStateTone } from "../../inbox/provider-labels";
import { prCheckBucket } from "../model/checks";

/** While a check is still running, the open page asks again this often. */
export const PENDING_CHECKS_REFRESH_MS = 25_000;

type Confirm = (command: InboxWriteCommand, description?: string) => void;
const cached = { gcTime: INBOX_RECORD_CACHE_MS };
const reviewersRequest = (input: InboxItemInput) => ({ action: "reviewers" as const, input: { ...input, mode: "list" as const, logins: [] } });
const labelsRequest = (input: InboxItemInput) => ({ action: "labels" as const, input: { ...input, mode: "list" as const, names: [] } });

/** Writes use the detail owner's scope lease, single flight and uncertain-result hold. */
export function PullRequestMetadata({ input, canRead, disabled, onCommand }: { input: InboxItemInput; canRead: boolean; disabled: boolean; onCommand: (command: InboxWriteCommand) => void }) {
  const copy = useCopy();
  const checks = useInboxRead({ action: "checks", input }, canRead, cached);
  // Reviewers and labels are read when their section is first opened; until then the headers show
  // what an earlier visit already read (a disabled read still returns its cached value).
  const reviewersCached = useInboxRead(reviewersRequest(input), false, cached);
  const labelsCached = useInboxRead(labelsRequest(input), false, cached);
  useRefreshPendingChecks(checks, canRead);
  const privateFailure = isInboxPrivateFailure(checks.error);
  const lease = useMemo(() => ({ active: false }), [canRead, disabled, privateFailure]);
  // Retire row callbacks when metadata access or write availability changes.
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  // The reads share one access failure: report it once, compactly.
  if (!canRead || privateFailure) {
    return <Stack><QueryState size="compact" query={{ ...checks, data: undefined }} /></Stack>;
  }
  // A label or reviewer change is reversible with one tap, so it runs at once, the way the desktop
  // runs its reversible pull request actions; only merge and close ask first.
  const confirm: Confirm = (command) => {
    if (disabled || !lease.active) return;
    onCommand(command);
  };
  const reviewerCount = reviewersCached.data ? reviewersCached.data.reviewRequests.length + reviewersCached.data.latestReviews.length : undefined;
  const labelCount = labelsCached.data?.labels.length;
  return <Stack>
    <PrChecksSection checks={checks} />
    <Disclosure label={copy("İnceleyenler", "Reviewers")} detail={reviewerCount === undefined ? undefined : String(reviewerCount)}>
      <PrReviewers input={input} disabled={disabled} confirm={confirm} />
    </Disclosure>
    <Disclosure label={copy("Etiketler", "Labels")} detail={labelCount === undefined ? undefined : String(labelCount)}>
      <PrLabels input={input} disabled={disabled} confirm={confirm} />
    </Disclosure>
  </Stack>;
}

function PrReviewers({ input, disabled, confirm }: { input: InboxItemInput; disabled: boolean; confirm: Confirm }) {
  const copy = useCopy();
  const reviewers = useInboxRead(reviewersRequest(input), true, cached);
  const [login, setLogin] = useState("");
  // A requested reviewer appears in the refreshed list: the field is done and clears itself.
  useEffect(() => {
    if (login && reviewers.data?.reviewRequests.some((reviewer) => reviewer.login?.toLowerCase() === login.toLowerCase())) setLogin("");
  }, [reviewers.data]);
  if (isInboxPrivateFailure(reviewers.error)) return <QueryState size="compact" query={{ ...reviewers, data: undefined }} />;
  return <>
    <QueryState size="compact" loading="inline" query={reviewers} />
    {reviewers.data?.reviewRequests.map((reviewer, index) => <Row key={`${reviewer.login ?? reviewer.name}:${index}`}>
      <Body>{reviewer.login ?? reviewer.name}</Body>
      {reviewer.login ? <Button tone="quiet" disabled={disabled || !!reviewers.error || reviewers.isFetching} label={copy("İnceleyeni kaldır", "Remove reviewer")} accessibilityLabel={copy("{p0} adlı inceleyeni kaldır", "Remove reviewer {p0}", { p0: reviewer.login })} onPress={() => confirm({ action: "reviewers", input: { ...input, mode: "remove", logins: [reviewer.login!], confirm: "CHANGE_PR_REVIEWERS" } }, copy("İnceleyeni kaldır: {p0}", "Remove reviewer: {p0}", { p0: reviewer.login! }))} /> : null}
    </Row>)}
    {reviewers.data?.latestReviews.map((review, index) => <Row key={`${review.author.login}:${index}`}><Body>{review.author.login}</Body><ProviderState label={providerStateLabel(review.state, copy)} tone={providerStateTone(review.state)} /></Row>)}
    <Field label={copy("GitHub kullanıcı adı", "GitHub username")} value={login} maxLength={100} editable={!disabled} onChangeText={setLogin}
      autoCapitalize="none" autoCorrect={false} />
    <Button label={copy("İnceleme iste", "Request review")} disabled={disabled || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(login) || !reviewers.data || !!reviewers.error || reviewers.isFetching}
      onPress={() => confirm({ action: "reviewers", input: { ...input, mode: "request", logins: [login], confirm: "CHANGE_PR_REVIEWERS" } }, copy("İnceleme iste: {p0}", "Request review from: {p0}", { p0: login }))} />
  </>;
}

function PrLabels({ input, disabled, confirm }: { input: InboxItemInput; disabled: boolean; confirm: Confirm }) {
  const copy = useCopy();
  const labels = useInboxRead(labelsRequest(input), true, cached);
  const [label, setLabel] = useState("");
  // An added label appears in the refreshed list: the selection is done and clears itself.
  useEffect(() => {
    if (label && labels.data?.labels.some((current) => current.name === label)) setLabel("");
  }, [labels.data]);
  if (isInboxPrivateFailure(labels.error)) return <QueryState size="compact" query={{ ...labels, data: undefined }} />;
  return <>
    <QueryState size="compact" loading="inline" query={labels} />
    {labels.data?.labels.map(current => <Row key={current.name}><Badge label={current.name} />
      <Button label={copy("Etiketi kaldır", "Remove label")} tone="quiet" disabled={disabled || !!labels.error || labels.isFetching}
        accessibilityLabel={copy("{p0} etiketini kaldır", "Remove label {p0}", { p0: current.name })}
        onPress={() => confirm({ action: "labels", input: { ...input, mode: "remove", names: [current.name], confirm: "CHANGE_PR_LABELS" } }, copy("Etiketi kaldır: {p0}", "Remove label: {p0}", { p0: current.name }))} />
    </Row>)}
    <SelectField label={copy("Depo etiketi", "Repository label")} value={label} disabled={disabled || !labels.data || !!labels.error || labels.isFetching}
      options={(labels.data?.available ?? []).filter(current => !labels.data?.labels.some(applied => applied.name === current.name))
        .map(current => ({ value: current.name, label: current.name }))} onChange={setLabel} />
    <Button label={copy("Etiket ekle", "Add label")} disabled={disabled || !label || !labels.data?.available.some(current => current.name === label) || !!labels.error || labels.isFetching}
      onPress={() => confirm({ action: "labels", input: { ...input, mode: "add", names: [label], confirm: "CHANGE_PR_LABELS" } }, copy("Etiket ekle: {p0}", "Add label: {p0}", { p0: label }))} />
    {labels.data?.truncated ? <Body muted>{copy("Depo etiketlerinin bir bölümü gösteriliyor.", "Part of the repository labels are shown.")}</Body> : null}
  </>;
}

/** Pending checks refresh on their own while the record is open and the app is active; settled checks stop. */
function useRefreshPendingChecks(checks: { data?: { checks: { state: string }[] }; isFetching: boolean; refetch: () => unknown }, canRead: boolean) {
  const pending = !!checks.data?.checks.some((check) => prCheckBucket(check.state) === "pending");
  const latest = useRef(checks); latest.current = checks;
  useEffect(() => {
    if (!pending || !canRead) return;
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && !latest.current.isFetching) void latest.current.refetch();
    }, PENDING_CHECKS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [pending, canRead]);
}
