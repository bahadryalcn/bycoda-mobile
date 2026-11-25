import { createContext, use, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

/**
 * A page opened inside a project panel (Git history, stashes, management, a diff, a file, a folder
 * level) has no stack route of its own. The project route keeps its one native header and lends it
 * to the innermost page: the page registers a title and its back action here, and the project
 * screen shows exactly that title and one back control. Pages never draw a second back or title.
 */
type Subpage = { id: number; title: string; back: () => void };
type Registry = { add: (page: Subpage) => void; remove: (id: number) => void };

const SubpageRegistry = createContext<Registry | null>(null);
let nextId = 1;

/** Owned by the project screen: the innermost registered page, and the scope that receives registrations. */
export function useProjectSubpageHost() {
  const [pages, setPages] = useState<Subpage[]>([]);
  const registry = useMemo<Registry>(() => ({
    add: (page) => setPages((current) => [...current.filter((value) => value.id !== page.id), page]),
    remove: (id) => setPages((current) => current.filter((value) => value.id !== id)),
  }), []);
  return { subpage: pages.at(-1), registry };
}

export function ProjectSubpageScope({ registry, children }: PropsWithChildren<{ registry: Registry }>) {
  return <SubpageRegistry.Provider value={registry}>{children}</SubpageRegistry.Provider>;
}

/** Registers the page while `title` is non-null. `onBack` may change every render; the header calls the latest. */
export function useProjectSubpage(title: string | null, onBack: () => void) {
  const registry = use(SubpageRegistry);
  const latest = useRef(onBack);
  latest.current = onBack;
  const id = useRef(0);
  if (!id.current) id.current = nextId++;
  useEffect(() => {
    if (!registry || title === null) return;
    const page = { id: id.current, title, back: () => latest.current() };
    registry.add(page);
    return () => registry.remove(page.id);
  }, [registry, title]);
}
