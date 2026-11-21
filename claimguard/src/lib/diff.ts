/**
 * Minimal word-level diff (LCS) with no runtime dependency.
 * Used by the side-by-side Corrected Answer view and the Markdown/JSON exports.
 */

export type DiffOp = "equal" | "insert" | "delete";

export interface DiffToken {
  op: DiffOp;
  value: string;
}

const TOKEN_RE = /(\s+|[^\s]+)/g;

function tokenize(text: string): string[] {
  return text.match(TOKEN_RE) ?? [];
}

export function diffWords(before: string, after: string): DiffToken[] {
  const a = tokenize(before);
  const b = tokenize(after);

  // LCS table. Claim texts are short (a few hundred tokens), so O(n*m) is fine.
  const rows = a.length + 1;
  const cols = b.length + 1;
  const lcs: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) lcs[i][j] = lcs[i + 1][j + 1] + 1;
      else lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffToken[] = [];
  const push = (op: DiffOp, value: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.value += value;
    else out.push({ op, value });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("equal", a[i]);
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push("delete", a[i]);
      i += 1;
    } else {
      push("insert", b[j]);
      j += 1;
    }
  }
  while (i < a.length) {
    push("delete", a[i]);
    i += 1;
  }
  while (j < b.length) {
    push("insert", b[j]);
    j += 1;
  }
  return out;
}

export interface DiffStats {
  inserted: number;
  deleted: number;
  unchanged: number;
  /** 0-100 share of tokens that survived unchanged. */
  similarity: number;
}

export function diffStats(tokens: DiffToken[]): DiffStats {
  let inserted = 0;
  let deleted = 0;
  let unchanged = 0;
  for (const t of tokens) {
    const words = t.value.trim().split(/\s+/).filter(Boolean).length;
    if (t.op === "insert") inserted += words;
    else if (t.op === "delete") deleted += words;
    else unchanged += words;
  }
  const total = inserted + deleted + unchanged;
  return {
    inserted,
    deleted,
    unchanged,
    similarity: total === 0 ? 100 : Math.round((unchanged / total) * 100),
  };
}

/** Renders a diff as GitHub-flavoured Markdown for the exportable audit report. */
export function diffToMarkdown(tokens: DiffToken[]): string {
  return tokens
    .map((t) => {
      if (t.op === "insert") return `**${t.value.trim()}**`;
      if (t.op === "delete") return `~~${t.value.trim()}~~`;
      return t.value;
    })
    .join("")
    .replace(/\s+([.,;:])~\~/g, "$1~~");
}
