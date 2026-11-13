import type { WorkCalendarCaps } from "../../../../src/shared/model/host-contracts/model-routing";

export type WorkCapFields = { dailyTokens: string; monthlyTokens: string; dailyCost: string; monthlyCost: string };
export const workCapFields = (caps?: WorkCalendarCaps): WorkCapFields => ({ dailyTokens: String(caps?.daily?.tokens ?? ""), monthlyTokens: String(caps?.monthly?.tokens ?? ""), dailyCost: String(caps?.daily?.costUsd ?? ""), monthlyCost: String(caps?.monthly?.costUsd ?? "") });
export function parseWorkCapFields(value: WorkCapFields): WorkCalendarCaps | undefined {
  for (const [key, text] of Object.entries(value)) {
    if (text === "") continue;
    const number = Number(text);
    if (!/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(number) || number < 0 || (key.endsWith("Tokens") && !Number.isSafeInteger(number))) return undefined;
  }
  const optional = (value: string) => value === "" ? undefined : Number(value);
  return { daily: { tokens: optional(value.dailyTokens), costUsd: optional(value.dailyCost) }, monthly: { tokens: optional(value.monthlyTokens), costUsd: optional(value.monthlyCost) } };
}
