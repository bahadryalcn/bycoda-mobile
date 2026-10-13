import { useState } from "react";
import { Button, Card, Disclosure, Sheet, Row } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";

import { AccountCard } from "./account-card";
import { AccountForm } from "./account-form";
import type { AccountsPanelProps } from "./types";

export function AccountsPanel({ state, projectId, action, run }: AccountsPanelProps) {
  const copy = useCopy();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Button label={copy("Hesap ekle", "Add account")} tone="primary" onPress={() => setAdding(true)} />
      <Disclosure label={copy("Gönderim ve tarama", "Sending & polling")}>
        <Row>
          <Button
            label={
              state.stopped
                ? copy("Yürütmeyi sürdür", "Resume execution")
                : copy("Tüm sosyal işleri durdur", "Stop all social work")
            }
            busy={action.isPending}
            onPress={() => run("execution.stop", { stopped: !state.stopped })}
          />
          <Button
            label={
              state.pollingEnabled
                ? copy("Gelen kutusu taramasını durdur", "Pause inbox polling")
                : copy("Gelen kutusunu tara", "Enable inbox polling")
            }
            busy={action.isPending}
            onPress={() => run("inbox.polling", { enabled: !state.pollingEnabled })}
          />
          {!state.sendingEnabled && (
            <Button
              label={copy("Dış gönderimlere izin ver", "Authorize external sends")}
              onPress={() =>
                confirmAction(
                  copy("Dış gönderimleri aç", "Enable external sends"),
                  copy(
                    "Bu host, onayladığınız içerikleri ve etkin otomatik kuralları bağlı hesaplarla gönderebilecek.",
                    "This host will be able to send approved content and active automatic rules through connected accounts.",
                  ),
                  copy("İzin ver", "Authorize"),
                  () => run("execution.enable", { confirm: "ENABLE_EXTERNAL_SENDS" }),
                )
              }
            />
          )}
        </Row>
      </Disclosure>
      {state.accounts.map((account) => (
        <AccountCard key={account.id} account={account} state={state} projectId={projectId} />
      ))}
      <Sheet visible={adding} size="form" title={copy("Hesap ekle", "Add account")} onClose={() => setAdding(false)}>
        {adding && <AccountForm projectId={projectId} onClose={() => setAdding(false)} />}
      </Sheet>
    </>
  );
}
