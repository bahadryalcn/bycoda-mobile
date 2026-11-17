/**
 * LaTeX to readable Unicode. shortcut: no typesetting engine is installed, so math renders as
 * monospace Unicode text (Greek, operators, super/subscripts, fractions as a/b); upgrade by
 * rendering the source with a KaTeX/MathJax WebView once a dependency is approved.
 */
const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ",
  upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ",
  Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠",
  approx: "≈", equiv: "≡", sim: "∼", propto: "∝", infty: "∞", partial: "∂", nabla: "∇", sum: "∑", prod: "∏",
  int: "∫", oint: "∮", forall: "∀", exists: "∃", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", supset: "⊃",
  cup: "∪", cap: "∩", emptyset: "∅", land: "∧", lor: "∨", neg: "¬", to: "→", rightarrow: "→", leftarrow: "←",
  Rightarrow: "⇒", Leftarrow: "⇐", leftrightarrow: "↔", Leftrightarrow: "⇔", mapsto: "↦", ldots: "…", cdots: "⋯",
  dots: "…", degree: "°", angle: "∠", perp: "⊥", parallel: "∥", ll: "≪", gg: "≫", circ: "∘", star: "⋆",
  quad: "  ", qquad: "    ", ",": " ", ";": " ", ":": " ", "!": "", " ": " ", "{": "{", "}": "}", "%": "%", "$": "$", "&": "&", "#": "#", "_": "_",
};
const SUPER: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", i: "ᵢ", j: "ⱼ", n: "ₙ", x: "ₓ" };

/** Reads one brace group or one token starting at `index`; returns its source and the next index. */
function argument(src: string, index: number): [string, number] {
  while (src[index] === " ") index++;
  if (src[index] === "{") {
    let depth = 0;
    for (let cursor = index; cursor < src.length; cursor++) {
      if (src[cursor] === "{") depth++;
      else if (src[cursor] === "}" && --depth === 0) return [src.slice(index + 1, cursor), cursor + 1];
    }
    return [src.slice(index + 1), src.length];
  }
  if (src[index] === "\\") {
    const name = /^\\([A-Za-z]+|.)/.exec(src.slice(index));
    if (name) return [name[0], index + name[0].length];
  }
  return [src.slice(index, index + 1), index + 1];
}

function script(table: Record<string, string>, marker: string, body: string) {
  const chars = [...body];
  return chars.every((char) => table[char]) ? chars.map((char) => table[char]).join("") : `${marker}${chars.length > 1 ? `(${body})` : body}`;
}

export function latexToText(source: string): string {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (char === "\\") {
      const match = /^\\([A-Za-z]+|[^A-Za-z])/.exec(source.slice(index))!;
      const name = match[1]!;
      index += match[0].length;
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const [top, afterTop] = argument(source, index);
        const [bottom, afterBottom] = argument(source, afterTop);
        index = afterBottom;
        const wrap = (text: string) => (/^[\w.]+$/.test(text) ? text : `(${text})`);
        out += `${wrap(latexToText(top))}/${wrap(latexToText(bottom))}`;
      } else if (name === "sqrt") {
        const [body, next] = argument(source, index);
        index = next;
        const text = latexToText(body);
        out += /^\w$/.test(text) ? `√${text}` : `√(${text})`;
      } else if (["text", "mathrm", "mathbf", "mathit", "mathbb", "mathcal", "operatorname", "textbf", "boldsymbol", "vec", "hat", "bar"].includes(name)) {
        const [body, next] = argument(source, index);
        index = next;
        out += latexToText(body);
      } else if (name === "left" || name === "right") {
        const [delimiter, next] = argument(source, index);
        index = next;
        out += delimiter === "." ? "" : latexToText(delimiter);
      } else if (name === "\\") out += "\n";
      else out += SYMBOLS[name] ?? (/^[A-Za-z]+$/.test(name) ? name : name);
    } else if (char === "^" || char === "_") {
      const [body, next] = argument(source, index + 1);
      index = next;
      const text = latexToText(body);
      out += char === "^" ? script(SUPER, "^", text) : script(SUB, "_", text);
    } else if (char === "{" || char === "}") index++;
    else {
      out += char;
      index++;
    }
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

/** `$..$` content check: pandoc-style, so prices like "$5 and $6" stay literal text. */
export function isInlineMath(content: string, next: string | undefined): boolean {
  return content.length > 0 && !/^\s|\s$/.test(content) && !(next !== undefined && /\d/.test(next));
}
