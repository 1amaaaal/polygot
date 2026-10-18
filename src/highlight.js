// A deliberately language-neutral highlighter. Real per-language
// highlighting would give the answer away (its colours depend on knowing the
// language), so this only colours things almost every language shares:
// strings, numbers, comments and a handful of common keywords.

const KEYWORDS = [
  "if", "else", "elif", "for", "foreach", "while", "do", "return", "function", "def",
  "fn", "func", "fun", "let", "var", "val", "const", "class", "struct", "enum",
  "end", "then", "in", "import", "from", "use", "using", "module", "public",
  "private", "static", "void", "new", "match", "case", "when", "switch", "try",
  "catch", "throw", "async", "await", "and", "or", "not", "true", "false", "null",
  "nil", "None", "True", "False", "begin", "program", "type", "interface",
];

const TOKEN = new RegExp([
  String.raw`(?<string>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|` + "`(?:\\\\.|[^`\\\\])*`)",
  String.raw`(?<comment>\/\/.*|(?<=^|\s)#(?=\s|$).*|(?<=^|\s)--\s.*)`,
  String.raw`(?<number>\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b)`,
  // Lisp-style names like in-stock are one word, so "-" counts as part of a word.
  String.raw`(?<keyword>(?<![\w-])(?:${KEYWORDS.join("|")})(?![\w-]))`,
].join("|"), "g");

// Comment markers that only count at the start of a line, because mid-line
// they mean something else (`a % b`, `x = 1;`).
const LINE_COMMENT = /^\s*(?:;|%\s|%$|#\s|#$|--|\/\/)/;

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

export function highlightLine(line) {
  if (LINE_COMMENT.test(line)) return `<span class="tok-comment">${escapeHtml(line)}</span>`;
  let html = "";
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const kind = Object.keys(m.groups).find((k) => m.groups[k] !== undefined);
    html += escapeHtml(line.slice(last, m.index));
    html += `<span class="tok-${kind}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return html + escapeHtml(line.slice(last));
}
