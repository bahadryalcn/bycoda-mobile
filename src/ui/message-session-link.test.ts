import { describe, expect, it } from "vitest";
import { parseMessage, type MessageNode } from "./message-model";
import { linkOnlyItem } from "./message-link-item";
import { messageSessionLink, messageSessionRoute } from "./message-session-link";

const links = (nodes: MessageNode[]): MessageNode[] =>
  nodes.flatMap((node) => (node.type === "link" ? [node] : links(node.children)));

describe("messageSessionLink", () => {
  it("recognizes app and web session references", () => {
    const app = "bycoda://session/v1/host/env%2E1/s%201?turn=t";
    const web = "https://link.bycoda.codes/session/v1/native/store/profile/session";
    expect(messageSessionLink(app)).toBe(app);
    expect(messageSessionLink(` <${web}> `)).toBe(web);
    expect(messageSessionRoute(app)).toEqual({
      pathname: "/session-reference",
      params: { link: app },
    });
  });

  it("ignores other app links, other hosts and malformed values", () => {
    for (const href of [
      "bycoda://send",
      "bycoda://session/s?projectId=p&machineId=m",
      "https://link.bycoda.codes/other",
      "https://evil.test/session/v1/host/e/s",
      "https://link.bycoda.codes.evil.test/session/v1/host/e/s",
      "bycoda://session/v1/host/e/s\nx",
      "bycoda://session/v1/" + "a".repeat(4096),
    ])
      expect(messageSessionLink(href), href).toBeNull();
  });

  it("keeps session hrefs exact through Markdown parsing", () => {
    const app = "bycoda://session/v1/host/env%2E1/s%201?turn=t";
    const web = "https://link.bycoda.codes/session/v1/host/e/s";
    const hrefs = links(parseMessage(`See [session](${app}) and ${web}`, true)).map(
      (node) => node.attrs.href,
    );
    expect(hrefs).toEqual([app, web]);
    expect(hrefs.map((href) => messageSessionLink(href!))).toEqual([app, web]);
  });

  it("does not turn a session link into an external source card", () => {
    const list = parseMessage("- [Earlier session](https://link.bycoda.codes/session/v1/host/e/s)", true)[0]!;
    expect(linkOnlyItem(list.children[0]!)).toBeNull();
  });
});
