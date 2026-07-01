/**
 * Extract definitions and references from source files via tree-sitter.
 *
 * Returns lightweight records: each definition is [name, kind], and each file carries
 * the set of identifier *references* it makes. The ranker uses defs+refs to build a
 * dependency graph. web-tree-sitter loads prebuilt `.wasm` grammars, so this
 * generalizes beyond any single language.
 *
 * NOTE: grammar `.wasm` files give the most accurate parse (see `loadLanguage`). When
 * they are unavailable, `parseFile` falls back to a keyword-based regex extractor
 * (`parseFileHeuristic`) so the repo map still works offline (notably for this TS repo).
 */

import { promises as fs } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import ignore, { type Ignore } from "ignore";

// node types that denote a "definition" across common tree-sitter grammars
const DEF_NODE_TYPES = new Set([
  "function_definition",
  "function_declaration",
  "method_definition",
  "class_definition",
  "class_declaration",
  "type_declaration",
  "interface_declaration",
  "struct_specifier",
]);
const NAME_FIELDS = ["name", "declarator"];

export const EXT_LANG: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".rb": "ruby",
  ".c": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".h": "c",
  ".hpp": "cpp",
};

export interface FileSymbols {
  file: string;
  defs: [string, string][]; // [name, kind]
  refs: Set<string>; // identifiers referenced
}

// Cache of loaded grammars, keyed by language name.
const grammarCache = new Map<string, unknown>();

/**
 * Load (and cache) a tree-sitter grammar for `lang`. Returns null if web-tree-sitter
 * or the grammar `.wasm` is unavailable — callers degrade gracefully.
 * TODO(phase 2): ship/resolve grammar wasm paths (e.g. tree-sitter-<lang>.wasm).
 */
async function loadLanguage(lang: string): Promise<unknown | null> {
  if (grammarCache.has(lang)) return grammarCache.get(lang)!;
  try {
    const { optionalImport } = await import("../util/optional.js");
    const Parser = (await optionalImport("web-tree-sitter")).default;
    await Parser.init();
    const grammarPath = process.env.AITL_GRAMMAR_DIR
      ? join(process.env.AITL_GRAMMAR_DIR, `tree-sitter-${lang}.wasm`)
      : `tree-sitter-${lang}.wasm`;
    const Language = await Parser.Language.load(grammarPath);
    grammarCache.set(lang, { Parser, Language });
    return grammarCache.get(lang)!;
  } catch {
    grammarCache.set(lang, null);
    return null;
  }
}

// Keyword-based definition patterns: [regex, kind]. Covers TS/JS plus common
// keywords for python/go/rust/c-family, so the heuristic fallback is broadly useful.
const HEURISTIC_DEFS: [RegExp, string][] = [
  [/(?:^|\s)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g, "function"],
  [/(?:^|\s)(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g, "class"],
  [/(?:^|\s)(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g, "interface"],
  [/(?:^|\s)(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/g, "type"],
  [/(?:^|\s)(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/g, "enum"],
  // exported/top-level arrow functions: const NAME = (..) => / = async (..) =>
  [/(?:^|\s)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^;{]*\)|[A-Za-z_$][\w$]*)\s*=>/g, "const"],
  [/(?:^|\s)def\s+([A-Za-z_$][\w$]*)\s*\(/g, "function"], // python
  [/(?:^|\s)func\s+(?:\([^)]*\)\s*)?([A-Za-z_$][\w$]*)\s*\(/g, "function"], // go
  [/(?:^|\s)fn\s+([A-Za-z_$][\w$]*)/g, "function"], // rust
];

const JS_KEYWORDS = new Set([
  "const", "let", "var", "function", "class", "interface", "type", "enum", "return", "if",
  "else", "for", "while", "switch", "case", "break", "continue", "new", "await", "async",
  "import", "export", "default", "from", "as", "extends", "implements", "this", "super",
  "true", "false", "null", "undefined", "void", "typeof", "instanceof", "in", "of", "try",
  "catch", "finally", "throw", "yield", "static", "public", "private", "protected", "readonly",
]);

/**
 * Lightweight regex extractor used when a tree-sitter grammar is unavailable.
 * Pulls keyword-based definitions and all referenced identifiers — enough for the
 * PageRank ranker (which only keeps refs that match definitions elsewhere).
 */
async function parseFileHeuristic(path: string): Promise<FileSymbols> {
  const fsym: FileSymbols = { file: path, defs: [], refs: new Set() };
  let src: string;
  try {
    src = await fs.readFile(path, "utf-8");
  } catch {
    return fsym;
  }
  // Strip block/line comments so commented-out code doesn't pollute defs/refs.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const seen = new Set<string>();
  for (const [re, kind] of HEURISTIC_DEFS) {
    re.lastIndex = 0;
    for (const m of code.matchAll(re)) {
      const name = m[1];
      if (name && !seen.has(name)) {
        seen.add(name);
        fsym.defs.push([name, kind]);
      }
    }
  }
  for (const m of code.matchAll(/[A-Za-z_$][\w$]*/g)) {
    if (!JS_KEYWORDS.has(m[0])) fsym.refs.add(m[0]);
  }
  return fsym;
}

function nodeName(node: any, src: string): string | null {
  for (const f of NAME_FIELDS) {
    const child = node.childForFieldName(f);
    if (child) return src.slice(child.startIndex, child.endIndex);
  }
  return null;
}

export async function parseFile(path: string): Promise<FileSymbols> {
  const lang = EXT_LANG[extname(path)];
  const fsym: FileSymbols = { file: path, defs: [], refs: new Set() };
  if (!lang) return fsym;

  const loaded = (await loadLanguage(lang)) as { Parser: any; Language: any } | null;
  // No tree-sitter grammar wired up → fall back to the regex heuristic instead of giving up.
  if (loaded === null) return parseFileHeuristic(path);

  const parser = new loaded.Parser();
  parser.setLanguage(loaded.Language);
  const src = await fs.readFile(path, "utf-8");
  const tree = parser.parse(src);

  const walk = (node: any): void => {
    if (DEF_NODE_TYPES.has(node.type)) {
      const name = nodeName(node, src);
      if (name) fsym.defs.push([name, node.type]);
    }
    if (["identifier", "type_identifier", "field_identifier"].includes(node.type)) {
      fsym.refs.add(src.slice(node.startIndex, node.endIndex));
    }
    for (const child of node.children) walk(child);
  };
  walk(tree.rootNode);
  return fsym;
}

/**
 * Load `<root>/.gitignore` (if present) into an `ignore()` matcher so the walk skips
 * anything git ignores (e.g. `dist/`, `logs/`). Returns null when there is no
 * `.gitignore` — callers then fall back to the baseline `.git`/`node_modules` skip.
 */
async function loadIgnore(root: string): Promise<Ignore | null> {
  try {
    const spec = await fs.readFile(join(root, ".gitignore"), "utf-8");
    return ignore().add(spec);
  } catch {
    return null; // no .gitignore → only the baseline skip applies
  }
}

/**
 * Recursively collect source files under `dir`. Skips `.git`/`node_modules` (baseline,
 * covers the no-`.gitignore` case) and anything the `ignore()` matcher rejects, matched
 * on the path relative to `root` (where `.gitignore` lives). `ignore` wants POSIX-style,
 * root-relative paths, and a trailing "/" so directory patterns like `dist/` match.
 */
async function walkDir(dir: string, root: string, exts: Set<string>, ig: Ignore | null): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const full = join(dir, e.name);
    const rel = relative(root, full).split(sep).join("/"); // POSIX, root-relative
    if (ig && rel && ig.ignores(e.isDirectory() ? `${rel}/` : rel)) continue;
    if (e.isDirectory()) out.push(...(await walkDir(full, root, exts, ig)));
    else if (e.isFile() && exts.has(extname(e.name))) out.push(full);
  }
  return out;
}

async function walkSources(root: string, exts: Set<string>): Promise<string[]> {
  const ig = await loadIgnore(root);
  return walkDir(root, root, exts, ig);
}

export async function parseTree(root: string, exts?: string[]): Promise<FileSymbols[]> {
  const extSet = new Set(exts ?? Object.keys(EXT_LANG));
  const files = await walkSources(root, extSet);
  return Promise.all(files.map(parseFile));
}
