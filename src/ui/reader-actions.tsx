import type { PropsWithChildren, ReactNode } from "react";
import { Body, Button, ErrorText, Row } from "./primitives";
import { useCopy } from "./copy";
import { space } from "./tokens";

type ReaderActionAreaProps = PropsWithChildren<{
  page: number; pages: number; onPage(page: number): void;
  navigationDisabled?: boolean; error?: unknown; status?: ReactNode;
}>;

/** One reachable reader action area; wide layouts fit one row and narrow layouts wrap by group. */
export function ReaderActionArea({ page, pages, onPage, navigationDisabled, error, status, children }: ReaderActionAreaProps) {
  const copy = useCopy();
  return <>
    <Row style={{ justifyContent: "space-between", gap: space.sm, minWidth: 0, maxWidth: "100%" }}>
      <Row style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
        {children}
      </Row>
      {pages > 1 ? <Row style={{ flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
        <Button label={copy("Geri", "Back")} tone="quiet" disabled={navigationDisabled || page === 0} onPress={() => onPage(page - 1)} />
        <Body>{page + 1} / {pages}</Body>
        <Button label={copy("Sonraki", "Next")} tone="quiet" disabled={navigationDisabled || page + 1 >= pages} onPress={() => onPage(page + 1)} />
      </Row> : null}
    </Row>
    {status}
    <ErrorText error={error} />
  </>;
}

/** Source readers retain their prepared full-payload copy action in the shared region. */
export function ReaderActions({ copyLabel, onCopy, busy, disabled, children, ...region }: ReaderActionAreaProps & {
  copyLabel: string; onCopy(): void; busy?: boolean; disabled?: boolean;
}) {
  return <ReaderActionArea {...region}>
    <Button label={copyLabel} tone="quiet" busy={busy} disabled={disabled} onPress={onCopy} />
    {children}
  </ReaderActionArea>;
}
