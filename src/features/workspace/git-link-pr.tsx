import { useState } from "react";
import { Badge, Body, ErrorNotice, FormActions, Input, Sheet, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import type { HostSessionSummary } from "./wire";
import type { GitScope } from "./git-types";
import {
  parsePullRequestInput,
  pickLinkSession,
  pullRequestStateLabel,
  pullRequestTone,
  type LinkedPullRequest,
} from "./git-link-pr-model";

export const LINK_PR_CAPABILITY = "pullRequests.link.v1";

/** The session a link attaches to and the pull request it already follows; absent on Hosts without the capability. */
export function useLinkedPullRequest({ projectId, cwd, root }: GitScope) {
  const supported = !!useActiveMachine()?.capabilities?.includes(LINK_PR_CAPABILITY);
  const sessions = useHostQuery<HostSessionSummary[]>(["sessions", projectId], "sessions.list", { projectId }, { enabled: supported });
  const session = pickLinkSession(sessions.data, cwd ?? root);
  const linked = useHostQuery<{ watches: LinkedPullRequest[] }>(["pr-linked", projectId, session?.id], "pullRequests.linked", { projectId, sessionId: session?.id }, { enabled: supported && !!session });
  return { supported, session, linked: linked.data?.watches[0] as LinkedPullRequest | undefined, refetch: linked.refetch };
}

export function GitLinkPullRequestSheet({ visible, projectId, link, onClose }: {
  visible: boolean;
  projectId: string;
  link: ReturnType<typeof useLinkedPullRequest>;
  onClose: () => void;
}) {
  const copy = useCopy();
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<LinkedPullRequest | null>(null);
  const linkMutation = useHostMutation<LinkedPullRequest>("pullRequests.link", ["pr-linked", projectId]);
  const unlinkMutation = useHostMutation<{ removed: boolean }>("pullRequests.unlink", ["pr-linked", projectId]);
  const parsed = parsePullRequestInput(text);
  const current = result ?? link.linked;
  const busy = linkMutation.isPending || unlinkMutation.isPending;
  const invalid = touched && !parsed.ok;
  const close = () => { setText(""); setTouched(false); setResult(null); linkMutation.reset(); unlinkMutation.reset(); onClose(); };
  const submit = async () => {
    setTouched(true);
    if (!parsed.ok || !link.session) return;
    try {
      setResult(await linkMutation.mutateAsync({ projectId, sessionId: link.session.id, ...parsed.target }));
      setText(""); setTouched(false);
    } catch { /* shown by the notice below */ }
  };
  const unlink = async () => {
    if (!current || !link.session) return;
    try {
      await unlinkMutation.mutateAsync({ projectId, sessionId: link.session.id, watchId: current.watchId });
      setResult(null);
      await link.refetch();
    } catch { /* shown by the notice below */ }
  };
  return (
    <Sheet visible={visible} size="form" title={copy("Pull request bağla", "Link pull request")} dismissible={!busy} onClose={close}>
      <Stack>
        {link.session ? <Body muted>{copy("Oturum: {p0}", "Session: {p0}", { p0: link.session.title })}</Body> : null}
        {current ? (
          <Stack>
            <Body>{`#${current.number}`}</Body>
            <Badge label={pullRequestStateLabel(current.state, copy)} tone={pullRequestTone(current.state)} />
            <FormActions submitLabel={copy("Bağlantıyı kaldır", "Unlink")} tone="quiet" busy={unlinkMutation.isPending} onSubmit={() => { void unlink(); }} />
          </Stack>
        ) : null}
        <Input
          label={copy("Bağlantı veya numara", "URL or number")}
          value={text}
          onChangeText={setText}
          placeholder="https://github.com/…/pull/42"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          error={invalid ? copy("github.com pull request bağlantısı veya numara gir.", "Enter a github.com pull request link or a number.") : undefined}
          editable={!busy}
          onSubmitEditing={() => { void submit(); }}
        />
        <ErrorNotice error={linkMutation.error ?? unlinkMutation.error} />
        <FormActions
          submitLabel={copy("Bağla", "Link")}
          cancelLabel={copy("Kapat", "Close")}
          onCancel={close}
          onSubmit={() => { void submit(); }}
          busy={linkMutation.isPending}
          disabled={!link.session}
        />
      </Stack>
    </Sheet>
  );
}
