/**
 * Small, line-level edits to book.yaml that keep everything else (comments,
 * order, the rest of the file) exactly as written.
 */
export type BookKind = "fiction" | "nonfiction";
export type Byline = "own-name" | "pen-name";

export interface BookIdentity { kind: BookKind; byline: Byline }

function topLevel(yaml: string, key: string): string | undefined {
  return yaml.match(new RegExp(`^${key}:[ \\t]*["']?([^"'#\\n]*?)["']?[ \\t]*(?:#.*)?$`, "m"))?.[1]?.trim();
}

/** What the book declares (with bookkit's defaults; `companion.kind` still counts). */
export function readIdentity(yaml: string): BookIdentity {
  const nested = yaml.match(/^companion:[^\n]*\n(?:(?:[ \t]+[^\n]*|)\n)*?[ \t]+kind:[ \t]*(\w+)/m)?.[1];
  const kind = (topLevel(yaml, "kind") ?? nested ?? "fiction") as BookKind;
  const byline = (topLevel(yaml, "byline") ?? "own-name") as Byline;
  return { kind: kind === "nonfiction" ? "nonfiction" : "fiction", byline: byline === "pen-name" ? "pen-name" : "own-name" };
}

/** Set a top-level key: replace its line, or add it after `language`/`author`/`title`. */
export function setTopLevel(yaml: string, key: string, value: string, afterKeys = ["language", "author", "title", "slug"]): string {
  const line = `${key}: ${value}`;
  const existing = new RegExp(`^${key}:.*$`, "m");
  if (existing.test(yaml)) return yaml.replace(existing, line);
  for (const after of afterKeys) {
    const m = yaml.match(new RegExp(`^${after}:.*$`, "m"));
    if (m) { const at = m.index! + m[0].length; return yaml.slice(0, at) + "\n" + line + yaml.slice(at); }
  }
  return line + "\n" + yaml;
}

/** Declare kind and byline; a `companion.kind` is kept in step so bookkit sees one answer. */
export function setIdentity(yaml: string, identity: Partial<BookIdentity>): string {
  let out = yaml;
  if (identity.kind) {
    out = setTopLevel(out, "kind", identity.kind);
    out = out.replace(/^(companion:[^\n]*\n(?:(?:[ \t]+[^\n]*|)\n)*?[ \t]+kind:[ \t]*)\w+/m, `$1${identity.kind}`);
  }
  if (identity.byline) out = setTopLevel(out, "byline", identity.byline, ["kind", "language", "author", "title", "slug"]);
  return out;
}
