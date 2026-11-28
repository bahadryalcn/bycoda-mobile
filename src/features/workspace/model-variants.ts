/**
 * Effort variants and upstream groups of a model list, mobile side only.
 *
 * Some providers list one model per reasoning effort ("Gemini 4 Hydrogen (High)", "(Low)", ...).
 * Current Hosts already group Antigravity families into one model with a Reasoning setting; older
 * Hosts still send the per-effort ids, so the picker folds them into one row here.
 * Only a trailing effort token folds: "(Preview)" or "(Beta)" stays part of the model's name.
 */

/** Effort tokens from the lowest to the highest; their index is the effort rank. */
const EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
type EffortToken = (typeof EFFORT_ORDER)[number];

/** Canonical English labels, the keys of the localized setting labels. */
const EFFORT_LABEL: Record<EffortToken, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};

function effortToken(text: string): EffortToken | undefined {
  const normal = text.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (normal === "extra high" || normal === "x high") return "xhigh";
  return (EFFORT_ORDER as readonly string[]).includes(normal) ? (normal as EffortToken) : undefined;
}

/** Position on the effort scale, or -1 for a label that is not an effort. */
export function effortRank(label: string): number {
  const token = effortToken(label);
  return token ? EFFORT_ORDER.indexOf(token) : -1;
}

/** "XHigh" → "Extra High"; a non-effort label is returned as it is. */
export function effortLabel(label: string): string {
  const token = effortToken(label);
  return token ? EFFORT_LABEL[token] : label;
}

/** "Gemini 4 Hydrogen (High)" → { family: "Gemini 4 Hydrogen", variant: "High" }; undefined unless the suffix is an effort. */
export function effortVariant(name: string): { family: string; variant: string } | undefined {
  const match = /^(.*\S)\s*\(([^()]{1,24})\)$/.exec(name.trim());
  if (!match || !effortToken(match[2]!)) return undefined;
  return { family: match[1]!, variant: match[2]!.trim() };
}

export type FoldedVariant<T> = { item: T; /** Canonical effort label: "Low", "Extra High". */ label: string; rank: number };

export type FoldedRow<T> = {
  /** The model itself, or the family's first variant in the Host's order. */
  item: T;
  /** Model name; for a family the shared name without the effort. */
  label: string;
  /** Two or more effort variants of one model, lowest effort first. */
  variants?: FoldedVariant<T>[];
};

/**
 * One row per model: effort variants of one family fold into a single row when at least two of
 * them sit in the list. A lone "(High)" model keeps its full name. Rows keep the Host's order, a
 * family at the place of its first variant.
 */
export function foldVariants<T>(items: readonly T[], nameOf: (item: T) => string): FoldedRow<T>[] {
  const families = new Map<string, { family: string; members: T[] }>();
  for (const item of items) {
    const parsed = effortVariant(nameOf(item));
    if (!parsed) continue;
    const key = parsed.family.toLocaleLowerCase();
    const entry = families.get(key) ?? { family: parsed.family, members: [] };
    entry.members.push(item);
    families.set(key, entry);
  }
  const rows: FoldedRow<T>[] = [];
  const placed = new Set<string>();
  for (const item of items) {
    const name = nameOf(item);
    const parsed = effortVariant(name);
    const family = parsed ? families.get(parsed.family.toLocaleLowerCase()) : undefined;
    if (!parsed || !family || family.members.length < 2) {
      rows.push({ item, label: name });
      continue;
    }
    const key = parsed.family.toLocaleLowerCase();
    if (placed.has(key)) continue;
    placed.add(key);
    const variants = family.members
      .map((member, order) => {
        const variant = effortVariant(nameOf(member))!.variant;
        return { item: member, label: effortLabel(variant), rank: effortRank(variant), order };
      })
      .sort((a, b) => a.rank - b.rank || a.order - b.order)
      .map(({ order: _order, ...variant }) => variant);
    rows.push({ item, label: family.family, variants });
  }
  return rows;
}

/**
 * The family and effort of `name` when `foldVariants` would fold it among `items` (two or more
 * variants of that family are listed); a lone "(High)" model keeps its full name.
 */
export function foldedVariant<T>(name: string, items: readonly T[], nameOf: (item: T) => string) {
  const parsed = effortVariant(name);
  if (!parsed) return undefined;
  const key = parsed.family.toLocaleLowerCase();
  const siblings = items.filter((item) => effortVariant(nameOf(item))?.family.toLocaleLowerCase() === key).length;
  return siblings >= 2 ? parsed : undefined;
}

/**
 * The variant to open when a folded family is picked: the one with the effort in use, otherwise
 * the family's first variant in the Host's order (the row's own item).
 */
export function variantFor<T>(row: FoldedRow<T>, effort: string | undefined): T {
  if (!row.variants || !effort) return row.item;
  const rank = effortRank(effort);
  return row.variants.find((variant) => rank >= 0 && variant.rank === rank)?.item ?? row.item;
}

/** Providers whose catalogue mixes upstream vendors in one list ("Anthropic · claude-opus-4-8"). */
const MULTI_UPSTREAM = new Set(["opencode", "hermes"]);

/**
 * Upstream vendor of a model inside a multi-provider harness: the catalogue's `provider` field, or
 * the part before " · " in Hermes and OpenCode names. `label` is the model part of the name.
 */
export function upstreamOf(
  harness: string,
  name: string,
  provider?: { name: string },
): { group?: string; label: string } {
  if (provider?.name) {
    const prefix = `${provider.name} · `;
    return { group: provider.name, label: name.startsWith(prefix) ? name.slice(prefix.length) || name : name };
  }
  if (!MULTI_UPSTREAM.has(harness)) return { label: name };
  const split = name.indexOf(" · ");
  if (split <= 0) return { label: name };
  const group = name.slice(0, split).trim();
  const label = name.slice(split + 3).trim();
  return group && label ? { group, label } : { label: name };
}
