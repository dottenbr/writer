// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { bookExtensions } from "./editor-extensions";
import { markdownToHtml, docToMarkdown, nodeToMarkdown, splitDocument, joinDocument, setFrontMatterField, type JSONNode } from "./markdown-doc";

function load(body: string) {
  const parsed = markdownToHtml(body);
  const editor = new Editor({ extensions: bookExtensions(""), content: parsed.html });
  const json = editor.getJSON() as JSONNode;
  const canonical = (json.content ?? []).map(nodeToMarkdown);
  return { editor, parsed, original: { canonical, blocks: parsed.blocks, prefix: parsed.prefix } };
}

const CHAPTER = `---
chapter: 1
title: "Solder Paste"
status: revised
---

# Chapter 1
The refrigerator door had been open all night.

I saw the *green* light from the corridor before I reached the **production** room.[^1]

“The paste refrigerator was open.”

* * *

> | ὅταν προσεύχησθε · *hotan proseuchēsthe*
> | *cum oratis*

- **Role:** narrator; owner of Heller_Elektronik (*Chs. 1–2, 5*).
- **Voice:** precise.

| Decision | Choice |
|---|---|
| Tense | past |

05:24.

[^1]: A note with a [link](https://example.com).
`;

describe("markdown document bridge", () => {
  it("splits front matter and title and joins them back", () => {
    const split = splitDocument(CHAPTER);
    expect(split.metadata.title).toBe("Solder Paste");
    expect(split.title).toBe("Chapter 1");
    expect(joinDocument(split, split.body)).toBe(CHAPTER);
  });

  it("round-trips an untouched document byte for byte", () => {
    const split = splitDocument(CHAPTER);
    const { editor, parsed, original } = load(split.body);
    expect(parsed.lossless).toBe(true);
    expect(docToMarkdown(editor.getJSON() as JSONNode, original)).toBe(split.body);
  });

  it("changes only the edited paragraph", () => {
    const split = splitDocument(CHAPTER);
    const { editor, original } = load(split.body);
    editor.view.dispatch(editor.state.tr.insertText("Yes. ", 1));
    const out = docToMarkdown(editor.getJSON() as JSONNode, original);
    expect(out).toContain("Yes. The refrigerator door had been open all night.\n\n");
    expect(out.replace("Yes. ", "")).toBe(split.body);
  });

  it("serializes new formatting as clean Markdown", () => {
    const { editor } = load("");
    editor.commands.setContent("<h2>Scene</h2><p>She said <em>no</em> and <strong>left</strong> 5 * 3_x.</p><ul><li><p>one</p></li></ul><hr>");
    expect(docToMarkdown(editor.getJSON() as JSONNode)).toBe("## Scene\n\nShe said *no* and **left** 5 \\* 3_x.\n\n- one\n\n* * *\n");
  });

  it("keeps soft line breaks as newlines", () => {
    const { editor, original } = load("Line one\nline two\n");
    editor.view.dispatch(editor.state.tr.insertText("A ", 1));
    expect(docToMarkdown(editor.getJSON() as JSONNode, original)).toBe("A Line one\nline two\n");
  });

  it("updates one front matter key and keeps the others", () => {
    expect(setFrontMatterField(CHAPTER, "status", "drafted").split("\n").slice(0, 5).join("\n"))
      .toBe('---\nchapter: 1\ntitle: "Solder Paste"\nstatus: drafted\n---');
    expect(setFrontMatterField("---\na: 1\n---\n\nBody\n", "title", "It's: here")).toBe("---\na: 1\ntitle: \"It's: here\"\n---\n\nBody\n");
  });

  it("flags link definitions as not safely editable", () => {
    expect(markdownToHtml("Text [a][x].\n\n[x]: https://example.com\n").lossless).toBe(false);
  });
});
