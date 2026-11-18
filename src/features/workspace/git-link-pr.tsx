import { useRef, useState } from "react";
import { Body, ErrorNotice, FormActions, Input, Sheet, Stack } from "@/ui/primitives";
import { PullRequestStateBadge } from "./pull-request-state-badge";
import { useCopy } from "@/ui/copy";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import type { HostSessionSummary } from "./wire";
import type { GitScope } from "./git-types";
import {
  parsePullRequestInput,
  pickLinkSession,
  pullRequestStateLabel,
  type LinkedPullRequest,
} from "./git-link-pr-model";

export const LINK_PR_CAPABILITY = "pullRequests.link.v1";

/** The session a link attaches to and the pull request it already follows; absent on Hosts without the capability. */
export function useLinkedPullRequest({ projectId, cwd, root }: GitScope) {
  const supported = !!useActiveMachine()?.capabilities?.includes(LINK_PR_CAPABILITY);
  const sessions = useHostQuery<HostSessionSummary[]>(
    ["sessions", projectId],
    "sessions.list",
    { projectId },
    { enabled: supported },
  );
  const session = pickLinkSession(sessions.data, cwd ?? root);
  const linked = useHostQuery<{ watches: LinkedPullRequest[] }>(
    ["pr-linked", projectId, session?.id],
    "pullRequests.linked",
    { projectId, sessionId: session?.id },
    { enabled: supported && !!session },
  );
  return {
    supported,
    session,
    linked: linked.data?.watches[0] as LinkedPullRequest | undefined,
    refetch: linked.refetch,
  };
}

export function GitLinkPullRequestSheet({
  visible,
  projectId,
  link,
  onClose,
}: {
  visible: boolean;
  projectId: string;
  link: ReturnType<typeof useLinkedPullRequest>;
  onClose: () => void;
}) {
  const copy = useCopy();
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<LinkedPullRequest | null>(null);
  const pending = useRef(false);
  const linkMutation = useHostMutation<LinkedPullRequest>("pullRequests.link", [
    "pr-linked",
    projectId,
  ]);
  const unlinkMutation = useHostMutation<{ removed: boolean }>("pullRequests.unlink", [
    "pr-linked",
    projectId,
  ]);
  const parsed = parsePullRequestInput(text);
  const current = result ?? link.linked;
  const busy = linkMutation.isPending || unlinkMutation.isPending;
  const invalid = touched && !parsed.ok;
  // The project owner keeps this sheet mounted, so closing retains the unsent URL.
  const close = () => {
    if (!pending.current && !busy) onClose();
  };
  const submit = async () => {
    if (pending.current || busy) return;
    setTouched(true);
    if (!parsed.ok || !link.session) return;
    pending.current = true;
    const submitted = text;
    try {
      setResult(
        await linkMutation.mutateAsync({ projectId, sessionId: link.session.id, ...parsed.target }),
      );
      setText((latest) => (latest === submitted ? "" : latest));
      setTouched(false);
    } catch {
      /* shown by the notice below */
    } finally {
      pending.current = false;
    }
  };
  const unlink = async () => {
    if (pending.current || busy || !current || !link.session) return;
    pending.current = true;
    try {
      await unlinkMutation.mutateAsync({
        projectId,
        sessionId: link.session.id,
        watchId: current.watchId,
      });
      setResult(null);
      await link.refetch();
    } catch {
      /* shown by the notice below */
    } finally {
      pending.current = false;
    }
  };
  return (
    <Sheet
      visible={visible}
      size="form"
      title={copy("Pull request bağla", "Link pull request")}
      dismissible={!busy}
      onClose={close}
    >
      <Stack>
        {link.session ? (
          <Body muted>{copy("Oturum: {p0}", "Session: {p0}", { p0: link.session.title })}</Body>
        ) : null}
        {current ? (
          <Stack>
            <Body>{`#${current.number}`}</Body>
            <PullRequestStateBadge
              state={current.state}
              label={pullRequestStateLabel(current.state, copy)}
            />
            <FormActions
              submitLabel={copy("Bağlantıyı kaldır", "Unlink")}
              tone="quiet"
              disabled={busy}
              busy={unlinkMutation.isPending}
              onSubmit={() => {
                void unlink();
              }}
            />
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
          error={
            invalid
              ? copy(
                  "github.com pull request bağlantısı veya numara gir.",
                  "Enter a github.com pull request link or a number.",
                )
              : undefined
          }
          editable={!busy}
          onSubmitEditing={() => {
            void submit();
          }}
        />
        <ErrorNotice error={linkMutation.error ?? unlinkMutation.error} />
        <FormActions
          submitLabel={copy("Bağla", "Link")}
          cancelLabel={copy("Kapat", "Close")}
          onCancel={close}
          onSubmit={() => {
            void submit();
          }}
          busy={linkMutation.isPending}
          disabled={!link.session || busy}
          cancelDisabled={busy}
        />
      </Stack>
    </Sheet>
  );
}
