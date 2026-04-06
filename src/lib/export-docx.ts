import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  PageBreak,
  Header,
  Footer,
  TabStopPosition,
  TabStopType,
  PageNumber,
  NumberFormat,
  convertInchesToTwip,
  Tab,
} from "docx";
import { saveAs } from "file-saver";
import type { Project, ProjectAct } from "../types";
import { formatSectionHeading, deriveChapterNumbers, isChapterType } from "../types";
import type { ExportConfig } from "./export-config";

/* ============================================================
   HTML → DOCX HELPERS
   ============================================================ */

interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function parseInlineHtml(html: string): InlineRun[] {
  const div = document.createElement("div");
  div.innerHTML = html;
  const runs: InlineRun[] = [];

  function walk(node: Node, bold: boolean, italic: boolean, underline: boolean) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) runs.push({ text, bold, italic, underline });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const b = bold || tag === "strong" || tag === "b";
    const i = italic || tag === "em" || tag === "i";
    const u = underline || tag === "u";
    for (const child of Array.from(el.childNodes)) {
      walk(child, b, i, u);
    }
  }

  walk(div, false, false, false);
  return runs;
}

function makeTextRun(r: InlineRun, config: ExportConfig): TextRun {
  return new TextRun({
    text: r.text,
    bold: r.bold,
    italics: r.italic,
    underline: r.underline ? {} : undefined,
    size: config.fontSize * 2, // half-points
    font: config.fontFamily,
  });
}

function lineSpacingValue(multiplier: number): number {
  // docx line spacing in 240ths of a line (240 = single)
  return Math.round(240 * multiplier);
}

function paragraphIndent(config: ExportConfig): { firstLine?: number } | undefined {
  if (config.paragraphStyle === "indent") {
    return { firstLine: convertInchesToTwip(0.5) };
  }
  return undefined;
}

function paragraphSpacing(config: ExportConfig, isFirst: boolean): { before?: number; after?: number; line?: number } {
  const line = lineSpacingValue(config.lineSpacing);
  if (config.paragraphStyle === "spacing") {
    return { after: 200, line };
  }
  // indent style: no extra space, but first paragraph after heading has no indent
  return { after: 0, line };
}

function htmlToDocxParagraphs(html: string, config: ExportConfig): Paragraph[] {
  const container = document.createElement("div");
  container.innerHTML = html;
  const paragraphs: Paragraph[] = [];
  let isFirstAfterBreak = true;
  let hasBodyContent = false;

  for (const node of Array.from(container.children)) {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "h1") {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({
            text: el.textContent?.trim() ?? "",
            bold: true,
            size: config.fontSize * 2 + 12,
            font: config.fontFamily,
          })],
          spacing: { before: 480, after: 240, line: lineSpacingValue(config.lineSpacing) },
        })
      );
      isFirstAfterBreak = true;
      continue;
    }

    if (tag === "h2") {
      if (!config.sceneHeadings) {
        if (!hasBodyContent) {
          // Avoid a redundant scene marker immediately after a chapter heading.
          isFirstAfterBreak = true;
          continue;
        }
        // Replace scene heading with separator
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({
              text: config.sceneSeparator,
              size: config.fontSize * 2,
              font: config.fontFamily,
            })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 400, line: lineSpacingValue(config.lineSpacing) },
          })
        );
        isFirstAfterBreak = true;
        continue;
      }
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({
            text: el.textContent?.trim() ?? "",
            bold: true,
            size: config.fontSize * 2 + 4,
            font: config.fontFamily,
          })],
          spacing: { before: 360, after: 200, line: lineSpacingValue(config.lineSpacing) },
        })
      );
      isFirstAfterBreak = true;
      continue;
    }

    if (tag === "h3") {
      if (!config.sceneHeadings) continue;
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({
            text: el.textContent?.trim() ?? "",
            bold: true,
            size: config.fontSize * 2,
            font: config.fontFamily,
          })],
          spacing: { before: 240, after: 120, line: lineSpacingValue(config.lineSpacing) },
        })
      );
      isFirstAfterBreak = true;
      continue;
    }

    if (tag === "blockquote") {
      const runs = parseInlineHtml(el.innerHTML);
      paragraphs.push(
        new Paragraph({
          children: runs.map(
            (r) =>
              new TextRun({
                text: r.text,
                bold: r.bold,
                italics: true,
                underline: r.underline ? {} : undefined,
                size: config.fontSize * 2,
                font: config.fontFamily,
              })
          ),
          indent: { left: 720 },
          spacing: { before: 200, after: 200, line: lineSpacingValue(config.lineSpacing) },
        })
      );
      isFirstAfterBreak = false;
      if ((el.textContent ?? "").trim().length > 0) {
        hasBodyContent = true;
      }
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const items = el.querySelectorAll("li");
      const hadItems = items.length > 0;
      items.forEach((li, idx) => {
        const prefix = tag === "ol" ? `${idx + 1}. ` : "- ";
        const runs = parseInlineHtml(li.innerHTML);
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: prefix, size: config.fontSize * 2, font: config.fontFamily }),
              ...runs.map((r) => makeTextRun(r, config)),
            ],
            indent: { left: 360 },
            spacing: { after: 60, line: lineSpacingValue(config.lineSpacing) },
          })
        );
      });
      isFirstAfterBreak = false;
      if (hadItems) {
        hasBodyContent = true;
      }
      continue;
    }

    if (tag === "hr") {
      if (!hasBodyContent) {
        // Avoid a redundant scene marker immediately after a chapter heading.
        isFirstAfterBreak = true;
        continue;
      }
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({
            text: config.sceneSeparator,
            size: config.fontSize * 2,
            font: config.fontFamily,
          })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 400, line: lineSpacingValue(config.lineSpacing) },
        })
      );
      isFirstAfterBreak = true;
      continue;
    }

    // Default: paragraph
    const runs = parseInlineHtml(el.innerHTML || el.textContent || "");
    if (runs.length === 0 || runs.every((r) => !r.text.trim())) {
      paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
      isFirstAfterBreak = true;
      continue;
    }

    const indent = paragraphIndent(config);
    const effectiveIndent =
      config.paragraphStyle === "indent" && isFirstAfterBreak
        ? undefined // no indent on first paragraph after heading/break
        : indent;

    paragraphs.push(
      new Paragraph({
        children: runs.map((r) => makeTextRun(r, config)),
        indent: effectiveIndent,
        spacing: paragraphSpacing(config, isFirstAfterBreak),
        alignment: config.paragraphStyle === "indent" ? AlignmentType.LEFT : undefined,
      })
    );
    isFirstAfterBreak = false;
    hasBodyContent = true;
  }

  return paragraphs;
}

/* ============================================================
   TITLE PAGE
   ============================================================ */

function buildTitlePage(project: Project, config: ExportConfig, totalWords: number): Paragraph[] {
  const title = project.brief.title || project.name;
  const subtitle = project.brief.subtitle;
  const paragraphs: Paragraph[] = [];
  const fs = config.fontSize * 2;

  // Word count in top-right (manuscript convention)
  if (config.wordCountOnTitle) {
    const rounded = Math.round(totalWords / 1000) * 1000;
    const wordCountStr = rounded > 0 ? `about ${rounded.toLocaleString()} words` : "";
    if (wordCountStr) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: wordCountStr, size: fs, font: config.fontFamily })],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 0 },
        })
      );
    }
  }

  // Vertical spacing before title (~1/3 down the page)
  const spacerCount = config.wordCountOnTitle ? 7 : 8;
  for (let i = 0; i < spacerCount; i++) {
    paragraphs.push(new Paragraph({ spacing: { after: 200 } }));
  }

  // Title
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: Math.max(fs + 16, 44),
          font: config.fontFamily,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // Subtitle
  if (subtitle) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: subtitle,
            italics: true,
            size: fs + 4,
            font: config.fontFamily,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );
  }

  paragraphs.push(new Paragraph({ spacing: { after: 400 } }));

  // "by" line
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: "by", size: fs, font: config.fontFamily })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // Author
  if (config.author.trim()) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: config.author.trim(),
            size: fs + 4,
            font: config.fontFamily,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
  }

  // Genre / category
  if (project.brief.genre) {
    paragraphs.push(new Paragraph({ spacing: { after: 600 } }));
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: project.brief.genre,
            size: fs,
            font: config.fontFamily,
            italics: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
  }

  // Page break after title page
  paragraphs.push(new Paragraph({ children: [new PageBreak()] }));

  return paragraphs;
}

/* ============================================================
   RUNNING HEADER
   ============================================================ */

function buildHeader(project: Project, config: ExportConfig): Header {
  const authorLast = config.author.trim().split(/\s+/).pop()?.toUpperCase() ?? "";
  const titleWord = (project.brief.title || project.name).split(/\s+/).slice(0, 3).join(" ").toUpperCase();
  const headerText = authorLast ? `${authorLast} / ${titleWord}` : titleWord;

  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: `${headerText}  `,
            size: config.fontSize * 2 - 4,
            font: config.fontFamily,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            size: config.fontSize * 2 - 4,
            font: config.fontFamily,
          }),
        ],
        alignment: AlignmentType.RIGHT,
      }),
    ],
  });
}

/* ============================================================
   DOCX EXPORT
   ============================================================ */

export async function exportManuscriptAsDocx(project: Project, config: ExportConfig) {
  const sortedChapters = [...project.chapters].sort((a, b) => a.number - b.number);
  const chapterNums = deriveChapterNumbers(sortedChapters);
  const actMap = new Map<string, ProjectAct>(project.acts.map((a) => [a.id, a]));

  const totalWords = sortedChapters.reduce((sum, ch) => sum + ch.wordCount, 0);

  // Title page is its own section (no header)
  const titleSection = config.titlePage
    ? buildTitlePage(project, config, totalWords)
    : [];

  // Body paragraphs
  const bodyParagraphs: Paragraph[] = [];
  let lastActId: string | null = null;

  for (let i = 0; i < sortedChapters.length; i++) {
    const ch = sortedChapters[i];

    // Act heading
    if (config.actHeadings && ch.act && ch.act !== lastActId) {
      const act = actMap.get(ch.act);
      if (act) {
        if (i > 0) {
          bodyParagraphs.push(new Paragraph({ children: [new PageBreak()] }));
        }
        bodyParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: act.label,
                bold: true,
                size: config.fontSize * 2 + 8,
                font: config.fontFamily,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 600, after: 400 },
          })
        );
      }
    }
    lastActId = ch.act;

    // Chapter heading
    if (config.chapterHeadings) {
      if (i > 0 && !(config.actHeadings && ch.act && ch.act !== sortedChapters[i - 1]?.act)) {
        bodyParagraphs.push(new Paragraph({ children: [new PageBreak()] }));
      }

      const chTitle = formatSectionHeading(ch.sectionType, chapterNums.get(ch.id) ?? null, ch.title);
      bodyParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: chTitle,
              bold: true,
              size: config.fontSize * 2 + 4,
              font: config.fontFamily,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 400 },
        })
      );
    } else if (i > 0) {
      bodyParagraphs.push(new Paragraph({ children: [new PageBreak()] }));
    }

    // Chapter body
    if (ch.content) {
      bodyParagraphs.push(...htmlToDocxParagraphs(ch.content, config));
    }
  }

  // End mark
  bodyParagraphs.push(new Paragraph({ spacing: { after: 600 } }));
  bodyParagraphs.push(
    new Paragraph({
      children: [new TextRun({
        text: "THE END",
        size: config.fontSize * 2,
        font: config.fontFamily,
      })],
      alignment: AlignmentType.CENTER,
    })
  );

  const pageSize = config.pageFormat === "a4"
    ? { width: 11906, height: 16838 }
    : { width: 12240, height: 15840 };

  const margin = {
    top: convertInchesToTwip(1),
    right: convertInchesToTwip(1),
    bottom: convertInchesToTwip(1),
    left: convertInchesToTwip(1),
  };

  const header = buildHeader(project, config);

  const sections = [];

  // Title page section (no header, no page numbers)
  if (titleSection.length > 0) {
    sections.push({
      properties: {
        page: { size: pageSize, margin },
        titlePage: true,
        pageNumberStart: 0,
        pageNumberFormatType: NumberFormat.DECIMAL,
      },
      headers: {
        default: new Header({ children: [new Paragraph("")] }), // empty header on title
      },
      children: titleSection,
    });
  }

  // Body section with running header
  sections.push({
    properties: {
      page: { size: pageSize, margin },
      pageNumberStart: 1,
      pageNumberFormatType: NumberFormat.DECIMAL,
    },
    headers: { default: header },
    children: bodyParagraphs,
  });

  const doc = new Document({ sections });

  const blob = await Packer.toBlob(doc);
  const authorSlug = (config.author.trim() || "unknown").replace(/\s+/g, "-").toLowerCase();
  const titleSlug = (project.brief.title || project.name).replace(/\s+/g, "-").toLowerCase();
  const dateSlug = new Date().toISOString().slice(0, 10);
  const fileName = `${authorSlug}_${titleSlug}_${dateSlug}.docx`;
  saveAs(blob, fileName);
}

/* ============================================================
   EPUB EXPORT
   ============================================================ */

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildEpubChapterHtml(
  title: string,
  bodyHtml: string,
  config: ExportConfig,
  cssHref: string
): string {
  const separator = escapeXml(config.sceneSeparator);
  const container = document.createElement("div");
  container.innerHTML = bodyHtml;
  let hasBodyContent = false;
  const out: string[] = [];

  for (const node of Array.from(container.children)) {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const hasText = (el.textContent ?? "").trim().length > 0;
    const contributesContent = hasText && !["h2", "h3", "hr"].includes(tag);

    if (tag === "hr") {
      if (!hasBodyContent) continue;
      out.push(`<p class="scene-break">${separator}</p>`);
      continue;
    }

    if (tag === "h2" && !config.sceneHeadings) {
      if (!hasBodyContent) continue;
      out.push(`<p class="scene-break">${separator}</p>`);
      continue;
    }

    out.push(el.outerHTML);
    if (contributesContent) {
      hasBodyContent = true;
    }
  }

  const finalHtml = out.join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="${cssHref}"/>
</head>
<body>
  <section epub:type="chapter">
    <h1>${escapeXml(title)}</h1>
    ${finalHtml}
  </section>
</body>
</html>`;
}

function buildEpubCss(config: ExportConfig): string {
  const indent = config.paragraphStyle === "indent";
  return `body {
  font-family: serif;
  line-height: ${config.lineSpacing};
  margin: 1em;
}
h1 {
  text-align: center;
  font-size: 1.6em;
  margin-top: 25%;
  margin-bottom: 1.5em;
  font-weight: bold;
}
h2 {
  text-align: center;
  font-size: 1.2em;
  margin-top: 1.5em;
  margin-bottom: 1em;
}
p {
  ${indent ? "text-indent: 1.5em;" : ""}
  ${indent ? "margin: 0;" : "margin: 0.5em 0;"}
}
h1 + p, h2 + p, .scene-break + p {
  text-indent: 0;
}
.scene-break {
  text-align: center;
  margin: 1.5em 0;
  text-indent: 0;
}
blockquote {
  font-style: italic;
  margin: 1em 2em;
}
`;
}

export async function exportManuscriptAsEpub(project: Project, config: ExportConfig) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const sortedChapters = [...project.chapters].sort((a, b) => a.number - b.number);
  const chapterNums = deriveChapterNumbers(sortedChapters);
  const title = project.brief.title || project.name;
  const author = config.author.trim() || "Unknown";
  const uuid = crypto.randomUUID();

  // mimetype (must be first, uncompressed)
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // META-INF/container.xml
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  // Stylesheet
  const css = buildEpubCss(config);
  zip.file("OEBPS/style.css", css);

  // Chapter files
  const chapterFiles: { id: string; href: string; title: string }[] = [];

  // Title page
  if (config.titlePage) {
    const totalWords = sortedChapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    const rounded = Math.round(totalWords / 1000) * 1000;
    let titleHtml = `<div class="title-page">
  <p style="text-align:center; margin-top:30%; font-size:2em; font-weight:bold;">${escapeXml(title)}</p>`;
    if (project.brief.subtitle) {
      titleHtml += `\n  <p style="text-align:center; font-style:italic; font-size:1.2em;">${escapeXml(project.brief.subtitle)}</p>`;
    }
    titleHtml += `\n  <p style="text-align:center; margin-top:2em;">by</p>`;
    titleHtml += `\n  <p style="text-align:center; font-size:1.2em;">${escapeXml(author)}</p>`;
    if (config.wordCountOnTitle && rounded > 0) {
      titleHtml += `\n  <p style="text-align:center; margin-top:2em; font-size:0.9em;">about ${rounded.toLocaleString()} words</p>`;
    }
    titleHtml += `\n</div>`;

    const titlePageXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"/><title>Title Page</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${titleHtml}</body>
</html>`;
    zip.file("OEBPS/title.xhtml", titlePageXhtml);
    chapterFiles.push({ id: "title", href: "title.xhtml", title: "Title Page" });
  }

  // Content chapters
  for (let i = 0; i < sortedChapters.length; i++) {
    const ch = sortedChapters[i];
    const chTitle = formatSectionHeading(ch.sectionType, chapterNums.get(ch.id) ?? null, ch.title);
    const fileName = `chapter-${i + 1}.xhtml`;
    const xhtml = buildEpubChapterHtml(chTitle, ch.content || "", config, "style.css");
    zip.file(`OEBPS/${fileName}`, xhtml);
    chapterFiles.push({ id: `ch-${i + 1}`, href: fileName, title: chTitle });
  }

  // content.opf
  const manifest = chapterFiles
    .map((f) => `    <item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`)
    .join("\n");
  const spine = chapterFiles.map((f) => `    <itemref idref="${f.id}"/>`).join("\n");

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifest}
  </manifest>
  <spine>
${spine}
  </spine>
</package>`;
  zip.file("OEBPS/content.opf", opf);

  // nav.xhtml (EPUB 3 table of contents)
  const navItems = chapterFiles
    .map((f) => `      <li><a href="${f.href}">${escapeXml(f.title)}</a></li>`)
    .join("\n");

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="UTF-8"/><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`;
  zip.file("OEBPS/nav.xhtml", nav);

  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
  const titleSlug = title.replace(/\s+/g, "-").toLowerCase();
  const dateSlug = new Date().toISOString().slice(0, 10);
  saveAs(blob, `${titleSlug}_${dateSlug}.epub`);
}

/* ============================================================
   PDF EXPORT (native via jsPDF)
   ============================================================ */

type JsPDFFont = "times" | "courier" | "helvetica";

/** Map config font names to jsPDF built-in font families */
function mapFont(fontFamily: string): JsPDFFont {
  const lower = fontFamily.toLowerCase();
  if (lower.includes("courier")) return "courier";
  if (lower.includes("helvetica") || lower.includes("arial") || lower.includes("sans")) return "helvetica";
  return "times"; // Times New Roman + all serif fonts
}

interface PdfLine {
  type: "text" | "heading" | "separator" | "blank" | "pagebreak";
  text?: string;
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  align?: "left" | "center" | "right";
  indent?: boolean;
  spaceBefore?: number;
  spaceAfter?: number;
}

function htmlToPdfLines(html: string, config: ExportConfig): PdfLine[] {
  const container = document.createElement("div");
  container.innerHTML = html;
  const lines: PdfLine[] = [];
  let isFirstAfterBreak = true;
  let hasBodyContent = false;

  for (const node of Array.from(container.children)) {
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "h1") {
      lines.push({
        type: "heading", text: el.textContent?.trim() ?? "",
        bold: true, fontSize: config.fontSize + 6, align: "left",
        spaceBefore: 12, spaceAfter: 6,
      });
      isFirstAfterBreak = true;
      continue;
    }

    if (tag === "h2") {
      if (!config.sceneHeadings) {
        if (!hasBodyContent) {
          isFirstAfterBreak = true;
          continue;
        }
        lines.push({ type: "separator", text: config.sceneSeparator, spaceBefore: 8, spaceAfter: 8 });
        isFirstAfterBreak = true;
        continue;
      }
      lines.push({
        type: "heading", text: el.textContent?.trim() ?? "",
        bold: true, fontSize: config.fontSize + 2, align: "center",
        spaceBefore: 8, spaceAfter: 4,
      });
      isFirstAfterBreak = true;
      continue;
    }

    if (tag === "h3") {
      if (!config.sceneHeadings) continue;
      lines.push({
        type: "heading", text: el.textContent?.trim() ?? "",
        bold: true, fontSize: config.fontSize, align: "left",
        spaceBefore: 6, spaceAfter: 3,
      });
      isFirstAfterBreak = true;
      continue;
    }

    if (tag === "hr") {
      if (!hasBodyContent) {
        isFirstAfterBreak = true;
        continue;
      }
      lines.push({ type: "separator", text: config.sceneSeparator, spaceBefore: 8, spaceAfter: 8 });
      isFirstAfterBreak = true;
      continue;
    }

    if (tag === "blockquote") {
      const text = el.textContent?.trim() ?? "";
      if (text) {
        lines.push({
          type: "text", text, italic: true,
          indent: false, spaceBefore: 4, spaceAfter: 4,
        });
        hasBodyContent = true;
      }
      isFirstAfterBreak = false;
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const items = el.querySelectorAll("li");
      items.forEach((li, idx) => {
        const prefix = tag === "ol" ? `${idx + 1}. ` : "• ";
        lines.push({
          type: "text", text: prefix + (li.textContent?.trim() ?? ""),
          indent: false, spaceAfter: 1,
        });
      });
      isFirstAfterBreak = false;
      if (items.length > 0) {
        hasBodyContent = true;
      }
      continue;
    }

    // Default: paragraph
    const text = el.textContent?.trim() ?? "";
    if (!text) {
      lines.push({ type: "blank", spaceAfter: config.paragraphStyle === "spacing" ? 4 : 2 });
      isFirstAfterBreak = true;
      continue;
    }

    const shouldIndent =
      config.paragraphStyle === "indent" && !isFirstAfterBreak;

    lines.push({
      type: "text",
      text,
      bold: false,
      italic: false,
      indent: shouldIndent,
      spaceAfter: config.paragraphStyle === "spacing" ? 4 : 0,
    });
    isFirstAfterBreak = false;
    hasBodyContent = true;
  }

  return lines;
}

export async function exportManuscriptAsPdf(project: Project, config: ExportConfig) {
  const { default: jsPDF } = await import("jspdf");

  const isA4 = config.pageFormat === "a4";
  const doc = new jsPDF({
    unit: "pt",
    format: isA4 ? "a4" : "letter",
    putOnlyUsedFonts: true,
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 72; // 1 inch
  const textW = pageW - margin * 2;
  const font = mapFont(config.fontFamily);
  const fs = config.fontSize;
  const leading = fs * config.lineSpacing;
  const indentSize = 36; // ~0.5 inch

  const sortedChapters = [...project.chapters].sort((a, b) => a.number - b.number);
  const chapterNums = deriveChapterNumbers(sortedChapters);
  const actMap = new Map<string, ProjectAct>(project.acts.map((a) => [a.id, a]));
  const title = project.brief.title || project.name;
  const author = config.author.trim();
  const totalWords = sortedChapters.reduce((sum, ch) => sum + ch.wordCount, 0);
  const rounded = Math.round(totalWords / 1000) * 1000;

  let y = margin;
  let pageNum = 0;

  const authorLast = author.split(/\s+/).pop()?.toUpperCase() ?? "";
  const titleShort = title.split(/\s+/).slice(0, 3).join(" ").toUpperCase();
  const headerText = authorLast ? `${authorLast} / ${titleShort}` : titleShort;

  function addHeader() {
    if (pageNum <= 1) return; // skip header on title page / first page
    doc.setFont(font, "normal");
    doc.setFontSize(fs - 2);
    doc.text(`${headerText}   ${doc.getNumberOfPages()}`, pageW - margin, margin - 20, { align: "right" });
  }

  function newPage() {
    doc.addPage();
    pageNum++;
    y = margin;
    addHeader();
  }

  function ensureSpace(needed: number) {
    if (y + needed > pageH - margin) {
      newPage();
    }
  }

  function writeText(
    text: string,
    opts: { bold?: boolean; italic?: boolean; size?: number; align?: "left" | "center" | "right"; indent?: boolean } = {}
  ) {
    const size = opts.size ?? fs;
    const style = opts.bold && opts.italic ? "bolditalic" : opts.bold ? "bold" : opts.italic ? "italic" : "normal";
    doc.setFont(font, style);
    doc.setFontSize(size);

    const align = opts.align ?? "left";
    const firstLineIndent = opts.indent && align === "left" ? indentSize : 0;
    let splitLines: string[] = [];

    if (firstLineIndent > 0) {
      // First-line indent should affect only the first visual line of a paragraph.
      const firstPass = doc.splitTextToSize(text, textW - firstLineIndent) as string[];
      const firstLine = firstPass[0] ?? "";
      const remainder = text.slice(firstLine.length).trimStart();
      splitLines = remainder.length > 0
        ? [firstLine, ...(doc.splitTextToSize(remainder, textW) as string[])]
        : [firstLine];
    } else {
      splitLines = doc.splitTextToSize(text, textW) as string[];
    }
    const lineH = size * config.lineSpacing;

    splitLines.forEach((line, idx) => {
      ensureSpace(lineH);
      // newPage() writes a header in a smaller font; restore body text style per line.
      doc.setFont(font, style);
      doc.setFontSize(size);
      let x = margin + (idx === 0 ? firstLineIndent : 0);
      if (align === "center") x = pageW / 2;
      else if (align === "right") x = pageW - margin;

      doc.text(line, x, y, { align });
      y += lineH;
    });
  }

  // ─── Title page ───
  pageNum = 0;
  if (config.titlePage) {
    // Word count top right
    if (config.wordCountOnTitle && rounded > 0) {
      doc.setFont(font, "normal");
      doc.setFontSize(fs);
      doc.text(`about ${rounded.toLocaleString()} words`, pageW - margin, margin, { align: "right" });
    }

    // Title ~1/3 down the page
    y = pageH * 0.35;
    writeText(title, { bold: true, size: fs * 2, align: "center" });

    if (project.brief.subtitle) {
      y += 4;
      writeText(project.brief.subtitle, { italic: true, size: fs * 1.2, align: "center" });
    }

    y += leading * 2;
    writeText("by", { size: fs, align: "center" });
    y += 4;

    if (author) {
      writeText(author, { size: fs * 1.2, align: "center" });
    }

    if (project.brief.genre) {
      y += leading * 2;
      writeText(project.brief.genre, { italic: true, size: fs, align: "center" });
    }

    newPage();
  } else {
    pageNum = 1;
    addHeader();
  }

  // ─── Chapters ───
  let lastActId: string | null = null;

  for (let i = 0; i < sortedChapters.length; i++) {
    const ch = sortedChapters[i];

    // Act heading
    if (config.actHeadings && ch.act && ch.act !== lastActId) {
      const act = actMap.get(ch.act);
      if (act) {
        if (i > 0) newPage();
        y = pageH * 0.35;
        writeText(act.label, { bold: true, size: fs + 4, align: "center" });
        y += leading * 2;
      }
    }
    lastActId = ch.act;

    // Chapter heading
    if (config.chapterHeadings) {
      if (i > 0 && !(config.actHeadings && ch.act && ch.act !== sortedChapters[i - 1]?.act)) {
        newPage();
      }
      const chTitle = formatSectionHeading(ch.sectionType, chapterNums.get(ch.id) ?? null, ch.title);
      writeText(chTitle, { bold: true, size: fs + 2, align: "center" });
      y += leading;
    } else if (i > 0) {
      newPage();
    }

    // Chapter body
    if (ch.content) {
      const pdfLines = htmlToPdfLines(ch.content, config);
      for (const line of pdfLines) {
        if (line.type === "pagebreak") {
          newPage();
          continue;
        }
        if (line.type === "blank") {
          y += (line.spaceAfter ?? 2);
          continue;
        }
        if (line.spaceBefore) {
          y += line.spaceBefore;
        }
        if (line.type === "separator") {
          ensureSpace(leading);
          writeText(line.text ?? config.sceneSeparator, { align: "center" });
        } else {
          writeText(line.text ?? "", {
            bold: line.bold,
            italic: line.italic,
            size: line.fontSize ?? fs,
            align: line.align ?? "left",
            indent: line.indent,
          });
        }
        if (line.spaceAfter) {
          y += line.spaceAfter;
        }
      }
    }
  }

  // End mark
  y += leading * 2;
  ensureSpace(leading * 2);
  writeText("THE END", { align: "center" });

  // Save
  const authorSlug = (author || "unknown").replace(/\s+/g, "-").toLowerCase();
  const titleSlug = title.replace(/\s+/g, "-").toLowerCase();
  const dateSlug = new Date().toISOString().slice(0, 10);
  doc.save(`${authorSlug}_${titleSlug}_${dateSlug}.pdf`);
}
