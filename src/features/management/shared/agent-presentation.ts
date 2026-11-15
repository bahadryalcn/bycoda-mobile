import { providerName } from "../../workspace/provider-choices";

/** Routing IDs stay untouched; records display the provider once with its public name. */
export function agentPresentation(harness: string, model: string) {
  const prefix = `${harness}:`;
  const shown = model.startsWith(prefix) ? model.slice(prefix.length) : model;
  return [providerName(harness), shown].filter(Boolean).join(" · ");
}
