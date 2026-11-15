import { describe, expect, it } from "vitest";
import { messageNodeText, parseMessage, type MessageNode } from "./message-model";
import { taskListItem } from "./message-task";

const items = (markdown: string): MessageNode[] =>
  parseMessage(markdown, true).find((node) => node.type.endsWith("_list"))!.children;
const text = (nodes: MessageNode[]) => nodes.map(messageNodeText).join("|");

describe("taskListItem", () => {
  it("reads checked and open markers and strips them from the text", () => {
    const [done, open, upper] = items("- [x] done\n- [ ] open\n- [X] **upper** case");
    expect(taskListItem(done!)).toMatchObject({ checked: true });
    expect(text(taskListItem(done!)!.children)).toBe("done");
    expect(taskListItem(open!)).toMatchObject({ checked: false });
    expect(text(taskListItem(open!)!.children)).toBe("open");
    expect(text(taskListItem(upper!)!.children)).toBe("**upper** case");
  });

  it("works in ordered lists and keeps nested blocks", () => {
    const [item] = items("1. [x] parent\n   - child");
    const task = taskListItem(item!)!;
    expect(task.checked).toBe(true);
    expect(task.children.map((node) => node.type)).toEqual(["paragraph", "bullet_list"]);
  });

  it("accepts a marker followed by a line break", () => {
    const task = taskListItem(items("- [ ]\n  next line")[0]!)!;
    expect(task.checked).toBe(false);
    expect(text(task.children)).toBe("next line");
  });

  it("keeps a following file link intact", () => {
    const task = taskListItem(items("- [x] [app](src/app.ts)")[0]!)!;
    const link = task.children[0]!.children[0]!.children.find((node) => node.type === "link")!;
    expect(link.attrs.href).toBe("src/app.ts");
    expect(messageNodeText(link)).toBe("app");
  });

  it("leaves ordinary items and bare markers untouched", () => {
    for (const markdown of ["- plain", "- [x]", "- [y] other", "- text [x] later", "- [x]done"])
      expect(taskListItem(items(markdown)[0]!), markdown).toBeNull();
  });
});
