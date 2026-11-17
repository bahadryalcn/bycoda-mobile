import { describe, expect, it } from "vitest";
import { MATH_CACHE_LIMIT, mathCacheSize, parseMathjaxSvg, renderMathSvg } from "./message-math-svg";
import { parseMessage, type MessageNode } from "./message-model";

const BS = "\\";
const flat = (nodes: MessageNode[]): MessageNode[] => nodes.flatMap((node) => [node, ...flat(node.children)]);

describe("math svg", () => {
  it("typesets a formula to an svg with metrics", () => {
    const math = renderMathSvg(`${BS}frac{a}{b}+${BS}sqrt{x}`, false);
    expect(math?.svg.startsWith("<svg")).toBe(true);
    expect(math!.widthEx).toBeGreaterThan(0);
    expect(math!.svg).toContain("currentColor");
  });
  it("returns null on a parse error", () => {
    expect(renderMathSvg(`${BS}frac{`, false)).toBeNull();
    expect(renderMathSvg(`${BS}notacommand`, true)).toBeNull();
  });
  it("keeps the cache bounded and returns the same entry for the same key", () => {
    const first = renderMathSvg("x^2", false);
    expect(renderMathSvg("x^2", false)).toBe(first);
    for (let index = 0; index < MATH_CACHE_LIMIT + 10; index++) renderMathSvg(`y_${index}`, false);
    expect(mathCacheSize()).toBeLessThanOrEqual(MATH_CACHE_LIMIT);
  });
  it("rejects markup without an svg", () => {
    expect(parseMathjaxSvg("<span>no</span>")).toBeNull();
  });
});

describe("math delimiters", () => {
  it("accepts \\( \\) inline and \\[ \\] block/inline display", () => {
    const nodes = flat(parseMessage(`See ${BS}(a+b${BS}) and ${BS}[c${BS}] here\n\n${BS}[\nx=1\n${BS}]\n`));
    expect(nodes.filter((node) => node.type === "math_inline").map((node) => node.text)).toEqual(["a+b"]);
    expect(nodes.find((node) => node.type === "math_display")?.text).toBe("c");
    expect(nodes.find((node) => node.type === "math_block")?.text).toBe("x=1");
  });
  it("leaves code spans with delimiters literal", () => {
    const nodes = flat(parseMessage(`\`${BS}(x${BS})\``));
    expect(nodes.some((node) => node.type.startsWith("math"))).toBe(false);
  });
});
