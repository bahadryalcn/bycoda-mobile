import { describe, expect, it } from "vitest";
import { isInlineMath, latexToText } from "./message-math";
import { parseMessage, messageNodeText, type MessageNode } from "./message-model";

const flat = (nodes: MessageNode[]): MessageNode[] => nodes.flatMap((node) => [node, ...flat(node.children)]);
const BS = "\\";

describe("latex text", () => {
  it("converts symbols, scripts, fractions and roots", () => {
    expect(latexToText("E = mc^2")).toBe("E = mc²");
    expect(latexToText(`${BS}alpha_1 + ${BS}beta ${BS}le ${BS}frac{a+b}{2}`)).toBe("α₁ + β ≤ (a+b)/2");
    expect(latexToText(`${BS}sqrt{x^2+1}`)).toBe("√(x²+1)");
    expect(latexToText(`${BS}sum_{i=1}^{n} x_i`)).toBe("∑ᵢ₌₁ⁿ xᵢ");
  });
  it("only treats price-like text as math when it is not", () => {
    expect(isInlineMath("x+1", " ")).toBe(true);
    expect(isInlineMath(" x", undefined)).toBe(false);
    expect(isInlineMath("5 and ", undefined)).toBe(false);
    expect(isInlineMath("5", "0")).toBe(false);
  });
});

describe("math in messages", () => {
  it("parses inline and block math into math nodes", () => {
    const nodes = flat(parseMessage(`Euler: $e^{i${BS}pi}+1=0$ done\n\n$$\nx = ${BS}frac{1}{2}\n$$\n`));
    expect(nodes.find((node) => node.type === "math_inline")?.text).toBe(`e^{i${BS}pi}+1=0`);
    expect(nodes.find((node) => node.type === "math_block")?.text).toBe(`x = ${BS}frac{1}{2}`);
  });
  it("leaves prices and code alone", () => {
    const nodes = flat(parseMessage("It costs $5 and $6 total, `$x$` too"));
    expect(nodes.some((node) => node.type.startsWith("math"))).toBe(false);
    expect(messageNodeText(nodes[0]!)).toContain("$5 and $6");
  });
});
