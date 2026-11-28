import { useState } from "react";
import { Disclosure, NavigationGroup, NavigationRow } from "@/ui/primitives";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { GroupHeading } from "@/ui/group-heading";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { shortTime, type UsageLimitsReport } from "../tools/usage-limits-model";
import { accountUsage } from "./account-usage";
import type { PickerAccount } from "./model-picker-model";
import type { UnavailableProviderChoice } from "./provider-choices";

/** Above this many accounts the rest fold behind "Other accounts" so the model list stays near. */
export const ACCOUNT_ROWS_SHOWN = 4;

export type PickerAccountRowsProps = {
  accounts: readonly PickerAccount[];
  /** Signed-out and disabled accounts of the same provider, listed disabled with the reason. */
  unavailable: readonly UnavailableProviderChoice[];
  /** The account whose models are listed below. */
  browsed: string;
  onBrowse: (account: PickerAccount) => void;
  disabled?: boolean;
};

/**
 * The provider's accounts as one group of rows: the browsed account selected, each with its colour
 * mark and, when known, its quota or why it cannot be used. An exhausted account stays selectable
 * (the report can be stale); it is only labelled.
 */
export function PickerAccountRows({ usage, ...props }: PickerAccountRowsProps & { usage?: UsageLimitsReport }) {
  const copy = useCopy();
  const locale = useLocale();
  // Reset times are read once per opened list; the sheet is short-lived.
  const [now] = useState(Date.now);
  const { accounts, unavailable, browsed, onBrowse, disabled } = props;
  const total = accounts.length + unavailable.length;
  const pinned = (key: string, own: boolean) => total <= ACCOUNT_ROWS_SHOWN || own || key === browsed;
  const quota = (account: PickerAccount) => {
    const reading = accountUsage(usage, account.choice.provider, account.choice.accountId, now);
    if (!reading) return undefined;
    if (reading.kind === "left") return copy("%{p0} kaldı", "{p0}% left", { p0: reading.percent });
    return reading.resetsAt !== null && reading.resetsAt > now
      ? copy("Limit doldu · sıfırlanma {p0}", "Limit reached · resets {p0}", { p0: shortTime(reading.resetsAt, now, locale) })
      : copy("Limit doldu", "Limit reached");
  };
  const row = (account: PickerAccount) => {
    const detail = [
      account.own && account.key !== browsed ? copy("Kullanımda", "In use") : undefined,
      quota(account),
    ].filter(Boolean).join(" · ");
    return (
      <NavigationRow
        key={account.key}
        label={account.label}
        {...(detail ? { detail } : {})}
        // "In use · Limit reached · resets …" wraps on a narrow phone.
        detailLines={0}
        icon={<ProviderAccountMark provider={account.choice.provider} color={account.choice.color} />}
        selected={account.key === browsed}
        disabled={disabled}
        onPress={() => onBrowse(account)}
      />
    );
  };
  const missing = (account: UnavailableProviderChoice) => (
    <NavigationRow
      key={account.key}
      label={account.label}
      detail={account.status === "signed-out" ? copy("Oturum kapalı", "Signed out") : copy("Devre dışı", "Disabled")}
      icon={<ProviderAccountMark provider={account.provider} color={account.color} />}
      selected={false}
      disabled
      onPress={() => undefined}
    />
  );
  const shown = accounts.filter((account) => pinned(account.key, account.own));
  const rest = [
    ...accounts.filter((account) => !pinned(account.key, account.own)).map(row),
    ...unavailable.filter((account) => !pinned(account.key, false)).map(missing),
  ];
  return (
    <>
      <GroupHeading title={copy("Hesap", "Account")} />
      <NavigationGroup>
        {shown.map(row)}
        {unavailable.filter((account) => pinned(account.key, false)).map(missing)}
      </NavigationGroup>
      {rest.length ? (
        <Disclosure label={copy("Diğer hesaplar ({p0})", "Other accounts ({p0})", { p0: rest.length })}>
          <NavigationGroup>{rest}</NavigationGroup>
        </Disclosure>
      ) : null}
    </>
  );
}
