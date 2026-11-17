import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";

/** A typeset formula: SVG markup plus its size in ex units (1ex = 0.5em) and baseline drop below the text baseline. */
export type MathSvg = { svg: string; widthEx: number; heightEx: number; depthEx: number };

export const MATH_CACHE_LIMIT = 120;
const cache = new Map<string, MathSvg | null>();
let engine: { adaptor: ReturnType<typeof liteAdaptor>; document: ReturnType<typeof mathjax.document> } | null = null;

function ensureEngine() {
  if (engine) return engine;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  // formatError rethrows so a parse error reaches the caller and falls back to monospace text.
  const document = mathjax.document("", {
    InputJax: new TeX({
      formatError: (_jax: unknown, error: Error) => {
        throw error;
      },
    }),
    OutputJax: new SVG({ fontCache: "none" }),
  });
  engine = { adaptor, document };
  return engine;
}

/** Pure parse of MathJax's container markup into the SVG plus metrics. */
export function parseMathjaxSvg(html: string): MathSvg | null {
  const svg = /<svg\b[^>]*>[\s\S]*<\/svg>/.exec(html)?.[0];
  if (!svg) return null;
  const width = Number(/\swidth="([\d.]+)ex"/.exec(svg)?.[1]);
  const height = Number(/\sheight="([\d.]+)ex"/.exec(svg)?.[1]);
  const align = Number(/vertical-align:\s*(-?[\d.]+)ex/.exec(svg)?.[1] ?? 0);
  if (!(width > 0) || !(height > 0)) return null;
  return { svg: svg.replace(/(<svg\b[^>]*?)\sstyle="[^"]*"/, "$1"), widthEx: width, heightEx: height, depthEx: -align };
}

/** Typesets TeX to SVG; null on a parse error. Cached per (tex, display) in a bounded LRU. */
export function renderMathSvg(tex: string, display: boolean): MathSvg | null {
  const key = `${display ? "d" : "i"}:${tex}`;
  if (cache.has(key)) {
    const hit = cache.get(key)!;
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  let result: MathSvg | null = null;
  try {
    const { adaptor, document } = ensureEngine();
    result = parseMathjaxSvg(adaptor.outerHTML(document.convert(tex, { display, em: 16, ex: 8, containerWidth: 1_000_000 })));
  } catch {
    result = null;
  }
  cache.set(key, result);
  if (cache.size > MATH_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return result;
}

export function mathCacheSize() {
  return cache.size;
}
