/** Keep only what a numeric field can hold: digits, plus one decimal separator when allowed. */
export function sanitizeNumberText(text: string, decimal = false): string {
  if (!decimal) return text.replace(/\D/g, "");
  const cleaned = text.replace(",", ".").replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  return dot < 0 ? cleaned : `${cleaned.slice(0, dot + 1)}${cleaned.slice(dot + 1).replace(/\./g, "")}`;
}

/** Fixed-length numeric code: digits only, trimmed to `length`. */
export function sanitizeCode(text: string, length: number): string {
  return text.replace(/\D/g, "").slice(0, length);
}
