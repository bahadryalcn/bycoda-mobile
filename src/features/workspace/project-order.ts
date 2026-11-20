import type { DirectorySection } from "./project-directory";

import { emptyProjectOrder, normalizeProjectOrder, type ProjectOrder } from "@/state/project-directory-preferences";

export { emptyProjectOrder, normalizeProjectOrder, type ProjectOrder };

/** Saved ids first (unknown ones ignored), anything new keeps its incoming position after them. */
export function applySavedOrder<T>(items: readonly T[], idOf: (item: T) => string, saved: readonly string[] | undefined): T[] {
  if (!saved?.length) return [...items];
  const rank = new Map(saved.map((id, index) => [id, index]));
  const known = items.filter((item) => rank.has(idOf(item)));
  const fresh = items.filter((item) => !rank.has(idOf(item)));
  return [...known.sort((a, b) => rank.get(idOf(a))! - rank.get(idOf(b))!), ...fresh];
}

export function moveId(list: readonly string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  return next;
}

/** Orders grouped sections and their projects, or the single flat section, by the saved order. */
export function applyCustomOrder(sections: readonly DirectorySection[], order: ProjectOrder, grouped: boolean): DirectorySection[] {
  if (!grouped) {
    return sections.map((section) => ({ ...section, data: applySavedOrder(section.data, (project) => project.id, order.flat) }));
  }
  return applySavedOrder(sections, (section) => section.key, order.groups)
    .map((section) => ({ ...section, data: applySavedOrder(section.data, (project) => project.id, order.projects[section.key]) }));
}

/** Snapshot of what is on screen, so switching to custom keeps the order the person saw. */
export function orderFromSections(sections: readonly DirectorySection[], grouped: boolean): ProjectOrder {
  if (!grouped) return { groups: [], projects: {}, flat: sections.flatMap((section) => section.data.map((project) => project.id)) };
  return {
    groups: sections.map((section) => section.key),
    projects: Object.fromEntries(sections.map((section) => [section.key, section.data.map((project) => project.id)])),
    flat: [],
  };
}

export type ProjectOrderMove = { scope: "groups" | "flat" | { group: string }; from: number; to: number };

/**
 * The one-slot move a Move up/down action issues, in the same shape a drag reports. Null at either
 * end of the list (or for a stale index) so the boundary is enforced in one place.
 */
export function neighbourMove(scope: ProjectOrderMove["scope"], index: number, length: number, delta: -1 | 1): ProjectOrderMove | null {
  const to = index + delta;
  if (index < 0 || index >= length || to < 0 || to >= length) return null;
  return { scope, from: index, to };
}

/** Applies one drag to a snapshot of the visible order; everything not dragged keeps its place. */
export function moveInOrder(current: ProjectOrder, move: ProjectOrderMove): ProjectOrder {
  if (move.scope === "groups") return { ...current, groups: moveId(current.groups, move.from, move.to) };
  if (move.scope === "flat") return { ...current, flat: moveId(current.flat, move.from, move.to) };
  return { ...current, projects: { ...current.projects, [move.scope.group]: moveId(current.projects[move.scope.group] ?? [], move.from, move.to) } };
}
