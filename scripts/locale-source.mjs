import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const unwrap = (node) => {
  while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
};

/** Pure extraction entry point used by the regression tests and filesystem scan. */
export function localeMessagesFromSources(sources) {
  const messages = {};
  const files = new Map(sources.map(({ fileName, text }) => [path.resolve(fileName), text]));
  const options = { noResolve: true, jsx: ts.JsxEmit.Preserve };
  const host = ts.createCompilerHost(options);
  const readSource = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, ...rest) => {
    const text = files.get(path.resolve(fileName));
    return text === undefined ? readSource(fileName, languageVersion, ...rest) :
      ts.createSourceFile(fileName, text, languageVersion, true);
  };
  // Contextual types identify explicitly named offline [tr, en] tuples, including
  // nested LegalSection paragraphs. Imports are not needed or evaluated.
  const program = ts.createProgram([...files.keys()], options, host);
  const checker = program.getTypeChecker();
  function pair(turkish, english) {
    if (turkish && english && ts.isStringLiteralLike(turkish) && ts.isStringLiteralLike(english))
      messages[english.text] = turkish.text;
  }

  function initializer(node, seen = new Set()) {
    node = unwrap(node);
    if (!node || !ts.isIdentifier(node)) return node;
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol || seen.has(symbol)) return undefined;
    seen.add(symbol);
    const declaration = symbol.valueDeclaration;
    return declaration && ts.isVariableDeclaration(declaration) ? initializer(declaration.initializer, seen) : undefined;
  }

  // Resolve only literal tuple containers that are actually spread into copy/tr.
  // Status maps and offline titles use copy(...table[key]); unrelated records and
  // query-key/token arrays are never candidates merely because of their length.
  function consumedTuples(expression) {
    const node = initializer(expression);
    if (!node) return [];
    if (ts.isArrayLiteralExpression(node)) return [node];
    if (ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)) {
      const container = initializer(node.expression);
      if (!container) return [];
      const key = ts.isPropertyAccessExpression(node) ? node.name.text :
        ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : undefined;
      if (ts.isObjectLiteralExpression(container)) return container.properties.flatMap((property) => {
        if (!ts.isPropertyAssignment(property)) return [];
        const name = ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name) ? property.name.text : undefined;
        return key === undefined || name === key ? consumedTuples(property.initializer) : [];
      });
      if (ts.isArrayLiteralExpression(container)) return container.elements.flatMap(consumedTuples);
    }
    return [];
  }

  function mappedPair(turkish, english) {
    if (!turkish || !english || !ts.isIdentifier(turkish) || !ts.isIdentifier(english)) return;
    const a = checker.getSymbolAtLocation(turkish)?.valueDeclaration;
    const b = checker.getSymbolAtLocation(english)?.valueDeclaration;
    if (!a || !b || !ts.isBindingElement(a) || !ts.isBindingElement(b) || a.parent !== b.parent || !ts.isArrayBindingPattern(a.parent)) return;
    const binding = a.parent;
    const parameter = binding.parent;
    const callback = parameter.parent;
    if (!ts.isParameter(parameter) || !ts.isArrowFunction(callback) || callback.parameters[0] !== parameter) return;
    const call = callback.parent;
    if (!ts.isCallExpression(call) || call.arguments[0] !== callback || !ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== "map") return;
    const rows = initializer(call.expression.expression);
    if (!rows || !ts.isArrayLiteralExpression(rows)) return;
    const trIndex = binding.elements.indexOf(a);
    const enIndex = binding.elements.indexOf(b);
    for (const row of rows.elements) {
      const tuple = initializer(row);
      if (tuple && ts.isArrayLiteralExpression(tuple)) pair(tuple.elements[trIndex], tuple.elements[enIndex]);
    }
  }

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (name === "copy" || name === "tr") {
        const [first, second] = node.arguments;
        if (first && ts.isSpreadElement(first)) {
          for (const tuple of consumedTuples(first.expression)) {
            if (tuple.elements.length === 2) name === "copy" ? pair(...tuple.elements) : pair(tuple.elements[1], tuple.elements[0]);
          }
        } else {
          const [turkish, english] = name === "copy" ? [first, second] : [second, first];
          pair(turkish, english);
          mappedPair(turkish, english);
        }
      }
    }
    if (ts.isArrayLiteralExpression(node) && node.elements.length === 2) {
      const type = checker.getContextualType(node);
      if (type && checker.isTupleType(type)) {
        const labels = type.target.labeledElementDeclarations;
        const types = checker.getTypeArguments(type);
        if (labels?.length === 2 && labels[0]?.name?.getText() === "tr" &&
          labels[1]?.name?.getText() === "en" && types.every((element) => element.flags & ts.TypeFlags.String)) pair(...node.elements);
      }
    }
    ts.forEachChild(node, visit);
  }
  for (const source of program.getSourceFiles()) if (files.has(path.resolve(source.fileName))) visit(source);
  return Object.fromEntries(Object.entries(messages).sort(([a], [b]) => a.localeCompare(b)));
}

/** Extract copy(tr, en), legacy tr(en, tr), and explicitly consumed/typed tables. */
export function localeSource() {
  const sources = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
      sources.push({ fileName: file, text: readFileSync(file, "utf8") });
    }
  }
  walk(path.join(root, "src"));
  walk(path.join(root, "app"));
  return localeMessagesFromSources(sources);
}
