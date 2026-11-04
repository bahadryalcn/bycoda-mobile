import type { useCopy } from "@/ui/copy";

/** One value/label mapping for the preference editor and its current-value row. */
export function chatTextSizeOptions(copy: ReturnType<typeof useCopy>) {
  return [
    { value: "compact" as const, label: copy("Küçük", "Small") },
    { value: "standard" as const, label: copy("Normal", "Standard") },
    { value: "large" as const, label: copy("Büyük", "Large") },
  ];
}
