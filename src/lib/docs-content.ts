export type AdmonitionKind = "note" | "tip" | "important" | "warning" | "caution";

export type DocBlock =
  | { type: "p"; text: string }
  | { type: "h2"; id: string; text: string }
  | { type: "h3"; id: string; text: string }
  | { type: "callout"; kind: AdmonitionKind; title: string; text: string }
  | { type: "code"; lang: string; filename?: string; code: string }
  | { type: "list"; ordered?: boolean; items: Array<{ title?: string; text: string }> }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "cards"; items: Array<{ badge?: string; title: string; text: string; linkSlug?: string }> };

export interface DocPage {
  slug: string;
  title: string;
  category: string;
  summary: string;
  readingMinutes: number;
  blocks: DocBlock[];
}

export interface DocCategory {
  id: string;
  label: string;
  pages: DocPage[];
}

export const DOC_PAGES: DocPage[] = [
  {
    slug: "introduction",
    title: "Introduction to Bookkit",
    category: "Getting Started",
    summary: "A calm, document-first studio for writing books—backed by lossless plain Markdown, book.yaml, and principled human authorship.",
    readingMinutes: 4,
    blocks: [
      {
        type: "p",
        text: "Bookkit (bookkit.net) is a collaborative book-writing studio built on a single core invariant: a book should feel like one continuous, linked document while you write it, and remain a clean, open plain-file repository (`book.yaml` + Markdown) underneath.",
      },
      {
        type: "callout",
        kind: "tip",
        title: "Free Early-Access Subscription",
        text: "Bookkit is free to use right now during our Founding Author period. You can claim your own `<library>.bookkit.net` subdomain, create custom shelves with house styles, and write unlimited books at no cost.",
      },
      {
        type: "h2",
        id: "core-principles",
        text: "Core Principles",
      },
      {
        type: "cards",
        items: [
          {
            badge: "Studio",
            title: "One Linked Manuscript",
            text: "Write in a continuous, distraction-free manuscript scroll. Click any chapter to make it a live editor while surrounding chapters stay readable in place.",
            linkSlug: "manuscript-editor",
          },
          {
            badge: "Worldbuilding",
            title: "Auto-Linked Story Bible",
            text: "Characters, places, organizations, and motifs are recognized automatically in your prose by name and alias—opening in a non-destructive side panel.",
            linkSlug: "story-bible",
          },
          {
            badge: "Organization",
            title: "Libraries & Shelves",
            text: "Every author or press gets a dedicated library address (`<you>.bookkit.net`) with shelves that group books and share house typography rules.",
            linkSlug: "libraries-and-shelves",
          },
          {
            badge: "Authorship",
            title: "Principled AI Boundaries",
            text: "Every book declares its own AI policy (`human-authored`, `ai-assisted`, or `ai-generated`) in `book.yaml`, enforced on the server and in CLI tooling.",
            linkSlug: "ai-policies",
          },
        ],
      },
      {
        type: "h2",
        id: "how-bookkit-is-organized",
        text: "How Bookkit Is Organized",
      },
      {
        type: "p",
        text: "Unlike folder-bound editors that force you to click between hundreds of tiny sidebar files, or cloud word processors that flatten an 80,000-word novel into an unindexed scroll, Bookkit separates how your book is stored from how you work on it:",
      },
      {
        type: "table",
        headers: ["Layer", "What You See in the Studio", "How It Is Stored in Bookkit"],
        rows: [
          ["Library", "Your home at `<slug>.bookkit.net` with shelves, activity calendar, and team", "`libraries` & `shelves` with subdomain cookie auth"],
          ["Manuscript", "One continuous document with parts, chapters, and inline scene cards", "`manuscript/NN-slug.md` (and optional `draft/NN-slug.md`)"],
          ["Plan", "Chapter cards, reorderable list, scene beat boards, and book brief", "`outline/chapters.md`, `outline/arcs.md`, `outline/scenes/NN-*.md`"],
          ["Story Bible", "Character, place, organization, and motif cards + interactive timeline", "`bible/characters.md`, `bible/places.md`, `bible/timeline.md`, `bible/canon.md`"],
          ["Craft & Style", "House style controls, author voice guide, and open editorial questions", "`book.yaml` (`style:` block), `craft/style-guide.md`, `outline/open-questions.md`"],
          ["Research", "Lazy-loaded research notes, claim ledgers, and multi-gigabyte PDFs/media", "`research/*.md` and content-addressed binary assets"],
        ],
      },
      {
        type: "h2",
        id: "who-bookkit-is-for",
        text: "Who Bookkit Is Built For",
      },
      {
        type: "list",
        items: [
          {
            title: "Novelists & Long-Form Fiction Writers",
            text: "Keep 50+ chapters, 200+ scene cards, and dozens of recurring characters, places, and timelines in complete sync without losing the rhythm of the page.",
          },
          {
            title: "Nonfiction Authors, Essayists & Scholars",
            text: "Manage monographs, memoirs, essay collections, claim ledgers, and large archival PDFs alongside a clean manuscript.",
          },
          {
            title: "Co-Authors, Editors & Beta Readers",
            text: "Share an entire library or a single book. Co-authors and editors propose tracked suggestions (`<ins>` / `<del>`); readers leave margin comments; the owner stays in command of the canonical text.",
          },
          {
            title: "Small Presses & Literary Imprints",
            text: "Run an imprint library where each shelf enforces a consistent house style (Chicago, New Oxford, AP) across every book on the shelf.",
          },
        ],
      },
    ],
  },
  {
    slug: "quickstart",
    title: "Quickstart: Your First Library & Book",
    category: "Getting Started",
    summary: "Sign up for your free subscription, claim your library subdomain, set up shelves, and start writing in under two minutes.",
    readingMinutes: 5,
    blocks: [
      {
        type: "p",
        text: "Getting started on Bookkit takes less than two minutes. During our Early Access period, every account includes the full Founding Author subscription for free.",
      },
      {
        type: "h2",
        id: "step-1-create-account-and-library",
        text: "1. Sign Up & Claim Your Library Address",
      },
      {
        type: "p",
        text: "Visit the Free Subscription Sign-Up page (`/signup`) and complete the three quick onboarding steps:",
      },
      {
        type: "list",
        ordered: true,
        items: [
          {
            title: "Account & Free Subscription",
            text: "Enter your author name, email address, and a password (at least 10 characters). No credit card is required.",
          },
          {
            title: "Your Library & Subdomain",
            text: "Name your library (for example, `Elena’s Library` or `Northlight Press`) and choose your web address (`elena.bookkit.net`).",
          },
          {
            title: "Your Shelves & House Style",
            text: "Pick your starter shelves—such as `Fiction`, `Nonfiction`, `Essays`, or `Series`—and assign an optional House Style preset (American/Chicago, British/New Oxford, or Oxford `-ize`).",
          },
        ],
      },
      {
        type: "h2",
        id: "step-2-start-or-import-a-book",
        text: "2. Start a New Book or Import a Bookkit Archive",
      },
      {
        type: "p",
        text: "Once inside your Library workspace, click **New book** in the top bar (or **Import a Bookkit archive** if you have an existing `.zip` repository). When creating a new book, you choose:",
      },
      {
        type: "table",
        headers: ["Setting", "Description", "Examples"],
        rows: [
          ["Title & Byline", "The book's working title and author name (own name or pen name)", "`The Owl at Dusk` by `Peter S. Dubois`"],
          ["Literary Form", "Sets appropriate default book and chapter word-count targets", "`Novel` (80k), `Novella` (25k), `Memoir` (75k), `Monograph` (85k), `Essays` (55k)"],
          ["Library & Shelf", "Places the book onto a shelf so it can inherit the shelf's house style", "`Elena’s Library` → `Fiction`"],
        ],
      },
      {
        type: "p",
        text: "Bookkit automatically scaffolds a complete, valid book repository for you—including `book.yaml`, `manuscript/01-chapter-one.md`, `bible/book-on-one-page.md`, `bible/characters.md`, `bible/places.md`, `bible/timeline.md`, `outline/chapters.md`, `outline/scenes/01-chapter-one.md`, and `craft/style-guide.md`.",
      },
      {
        type: "h2",
        id: "step-3-navigate-the-studio",
        text: "3. Navigate the Studio Workspace",
      },
      {
        type: "p",
        text: "The Studio top bar gives you instant access to every aspect of your book without ever exposing raw file paths:",
      },
      {
        type: "list",
        items: [
          {
            title: "Manuscript",
            text: "Read and write your chapters in one continuous document. Click any chapter to activate the rich ProseMirror editor.",
          },
          {
            title: "Plan",
            text: "View your Chapter Plan as visual cards or a drag-to-reorder list, edit your Book Brief, or drill into a chapter's Scene Board.",
          },
          {
            title: "Bible",
            text: "Browse and edit Characters, Places, Organizations, Motifs, Canon, and your interactive Timeline.",
          },
          {
            title: "Craft & Research",
            text: "Maintain your Style Guide, Author Voice notes, Open Questions, and Research documents.",
          },
          {
            title: "Inspiration",
            text: "Upload mood-board images, maps, and reference PDFs, tag them, and designate cover art.",
          },
        ],
      },
      {
        type: "callout",
        kind: "note",
        title: "Jump Anywhere with ⌘K",
        text: "Press `⌘K` (macOS) or `Ctrl+K` (Windows/Linux) at any time in the Studio to open the Jump Palette and leap directly to any chapter, character, place, scene card, or companion page.",
      },
    ],
  },
  {
    slug: "libraries-and-shelves",
    title: "Libraries, Subdomains & Shelves",
    category: "Getting Started",
    summary: "How personal and imprint libraries work on *.bookkit.net, how shelves organize books, and how shelf house styles cascade.",
    readingMinutes: 6,
    blocks: [
      {
        type: "p",
        text: "In Bookkit, books live inside **Libraries**. Every library has its own subdomain address—such as `dom.bookkit.net` or `heidi.bookkit.net`—its own **Shelves**, and its own **People**.",
      },
      {
        type: "h2",
        id: "how-library-addresses-work",
        text: "Library Subdomains & Single Sign-On",
      },
      {
        type: "p",
        text: "When you sign in on `bookkit.net`, your authentication session is stored in a chunked, secure cookie scoped to `.bookkit.net`. That means one sign-in automatically authenticates you across `bookkit.net` and every `<library>.bookkit.net` subdomain you belong to.",
      },
      {
        type: "list",
        items: [
          {
            title: "All Libraries Home (`bookkit.net`)",
            text: "Shows every library you own or collaborate in, your 12-week cross-book writing activity calendar, and recently worked-on books.",
          },
          {
            title: "Individual Library Home (`<slug>.bookkit.net`)",
            text: "Displays that library's description, writing stats, and all of its shelves. You can also open any library directly from the Library Switcher in the top bar.",
          },
          {
            title: "Readable Book URLs",
            text: "Inside a library, every book and section has a clean, human-readable URL: `/<book>/chapter/2`, `/<book>/bible/characters/nora`, `/<book>/outline/chapters`, or `/<book>/brief`.",
          },
        ],
      },
      {
        type: "h2",
        id: "organizing-with-shelves",
        text: "Organizing Books with Shelves",
      },
      {
        type: "p",
        text: "Shelves group the books inside your library—by genre (`Fiction`, `Nonfiction`, `Poetry`), by series (`The Sarre Quartet`), or by publication stage (`Drafting`, `In Editorial Review`, `Published`).",
      },
      {
        type: "list",
        items: [
          {
            title: "Drag-and-Drop Shelving",
            text: "On your Library home page, drag any book card from one shelf and drop it onto another shelf.",
          },
          {
            title: "Card Menu (`⋯`)",
            text: "Click the `⋯` button on any book card to assign it to a shelf, move it to another library where you have write access, or toggle **Make private**.",
          },
          {
            title: "Shelf Management",
            text: "Open **Library settings → Shelves** to add new shelves, rename existing shelves inline, reorder shelves up or down, or configure a shelf's House Style.",
          },
        ],
      },
      {
        type: "h2",
        id: "shelf-house-style-inheritance",
        text: "Shelf House Style Inheritance",
      },
      {
        type: "p",
        text: "Each shelf can define a **House Style** (spelling, serial comma, quotation marks, punctuation in quotes, dashes, ellipsis, number formatting, and style manual). Any book on that shelf with `style.inherit: shelf` in its `book.yaml` automatically inherits the shelf's house style!",
      },
      {
        type: "code",
        lang: "yaml",
        filename: "book.yaml (inheriting from shelf)",
        code: `style:
  inherit: shelf
  spelling: british
  serial_comma: false
  quotes: single
  punctuation_in_quotes: logical
  dashes: en-spaced
  ellipsis: character
  numbers: words-to-hundred
  manual: new-oxford`,
      },
      {
        type: "callout",
        kind: "important",
        title: "Automatic Propagation to book.yaml",
        text: "When you update a shelf's style in Library Settings, Bookkit automatically updates the `style:` block inside `book.yaml` for every book you own on that shelf that has `style.inherit: shelf`, keeping cloud and CLI builds 100% consistent.",
      },
      {
        type: "h2",
        id: "library-people-and-privacy",
        text: "Library People & Private Books",
      },
      {
        type: "p",
        text: "In **Library settings → People**, the library owner can invite collaborators to the entire library as a **Reader**, **Editor**, or **Co-author**:",
      },
      {
        type: "table",
        headers: ["Library Role", "What They Can Do in the Library"],
        rows: [
          ["Owner", "Full control over library details, address, shelves, people, and all books."],
          ["Co-author", "Can open all non-private books, propose edits, add new books, create shelves, and move books between shelves."],
          ["Editor", "Can open all non-private books, write tracked suggestions, edit companion pages, and leave comments."],
          ["Reader", "Can read all non-private books in the library and post margin comments and replies."],
        ],
      },
      {
        type: "p",
        text: "Need to keep a work-in-progress secret from library members? Choose **Make private** from the book card's `⋯` menu. Private books are hidden from library members unless you explicitly share that individual book with them.",
      },
    ],
  },
  {
    slug: "manuscript-editor",
    title: "Continuous Manuscript & Inline Scenes",
    category: "The Studio",
    summary: "Write across your entire book in one continuous view with live ProseMirror chapters, inline scene cards, and reference drafts.",
    readingMinutes: 6,
    blocks: [
      {
        type: "p",
        text: "The heart of Bookkit is `ManuscriptView`: your entire book presented as a continuous, typeset sequence of pages. You never have to juggle separate chapter tabs or lose sight of how one chapter flows into the next.",
      },
      {
        type: "h2",
        id: "live-chapter-editing",
        text: "Click-to-Edit Chapters & Viewport Virtualization",
      },
      {
        type: "p",
        text: "As you scroll through your manuscript, inactive chapters render as clean, static book pages with linked story-bible mentions. The moment you click into any chapter, it seamlessly becomes a live TipTap/ProseMirror rich text editor.",
      },
      {
        type: "list",
        items: [
          {
            title: "Autosave with 900ms Debounce",
            text: "Every edit is automatically saved to `bookkit_documents` 900 milliseconds after you pause typing, with local IndexedDB draft backup in case your connection drops.",
          },
          {
            title: "Byte-Identical Markdown Preservation",
            text: "Bookkit splits each Markdown file into block-level tokens (`src/lib/markdown-doc.ts`). Paragraphs and blocks you don't touch are written back byte-for-byte, preserving custom formatting, tables, footnotes, and front matter.",
          },
          {
            title: "Fast on 100,000-Word Novels",
            text: "Off-screen chapters use viewport-aware lazy hydration (`IntersectionObserver`), keeping DOM node counts low and 60fps scrolling smooth even on 50-chapter novels.",
          },
        ],
      },
      {
        type: "h2",
        id: "inline-scene-cards",
        text: "Inline Scene Cards",
      },
      {
        type: "p",
        text: "Each chapter's scene cards (`outline/scenes/NN-*.md`) appear directly inline inside the manuscript right above the scene they govern! You can expand a scene card to inspect or edit its **Where/When**, **Point of View**, **Characters**, **Purpose**, **Splits/Beats**, and **Outcome** without leaving your chapter.",
      },
      {
        type: "code",
        lang: "markdown",
        filename: "outline/scenes/02-the-switch-box.md",
        code: `# Chapter 2 — The Switch Box

## Scene 1 — Up the Gully

- **Where / when:** The rocky gully above Ennet, late afternoon in May.
- **Characters:** Nora, the goat.
- **Purpose:** Nora follows the stray goat into the hollow and finds the iron door ajar.
- **Beats:**
  - The goat slips past the alder scrub where the snowmelt runs.
  - Nora sees the iron door standing a hand's width open.
  - She reaches inside and feels the switch box at the height of her chest.`,
      },
      {
        type: "callout",
        kind: "note",
        title: "Two Scene Alignment Modes",
        text: "In books with `manuscript.scenes: false` (default), scenes align to `***` horizontal scene breaks. In books with `manuscript.scenes: true`, scenes align to explicit `## Scene N – Title` headings.",
      },
      {
        type: "h2",
        id: "reference-drafts",
        text: "Reference Drafts (`draft/` vs. `manuscript/`)",
      },
      {
        type: "p",
        text: "If your book includes a reference draft directory (`manuscript.draft: draft` in `book.yaml`), chapters that have not yet been written by the author display their reference draft as **read-only** with a clear notice.",
      },
      {
        type: "list",
        items: [
          {
            title: "Write This Chapter (`book start` semantics)",
            text: "Clicking **Write this chapter** creates a fresh, clean file in `manuscript/NN-slug.md` containing only the YAML front matter, `# Chapter N` heading, and empty scene slots. Reference prose is never copied into the author's manuscript.",
          },
          {
            title: "Side-by-Side Reference View",
            text: "While writing your chapter in `manuscript/`, you can open the Context Panel on the right and switch to the **Reference draft** tab to consult the earlier draft alongside your new prose.",
          },
          {
            title: "Return to Reference Draft",
            text: "If you haven't written any words in the new chapter file yet, the book's owner can click **Go back to the reference draft** to remove the empty file.",
          },
        ],
      },
      {
        type: "h2",
        id: "reading-comfort-modes",
        text: "Reading Comfort & Typography Modes",
      },
      {
        type: "p",
        text: "The Studio toolbar includes a reading typography selector so you or your beta readers can view the manuscript in **Serif** (`Source Serif 4`), **Sans** (`Inter`), or **Dyslexia-friendly** (`Atkinson Hyperlegible` / `Lexend` with 1.92 line height and wider letter/word spacing)—without altering the book's exported print layout.",
      },
    ],
  },
  {
    slug: "story-bible",
    title: "Story Bible & Automatic Entity Linking",
    category: "The Studio",
    summary: "Keep characters, places, organizations, motifs, and canon linked to every paragraph of your manuscript.",
    readingMinutes: 5,
    blocks: [
      {
        type: "p",
        text: "Every Bookkit book has a living **Story Bible** (`bible/`). Instead of locking character sheets inside a proprietary database, Bookkit derives entities directly from standard Markdown sections in your `bible/*.md` files.",
      },
      {
        type: "h2",
        id: "entity-kinds-and-files",
        text: "Entity Kinds & File Conventions",
      },
      {
        type: "p",
        text: "Bookkit classifies story-bible files automatically by their filename and extracts each `## Name` section (or `- **Name.**` bullet list item) as a distinct entity card:",
      },
      {
        type: "table",
        headers: ["Entity Kind", "Matching Filenames in `bible/`", "Color Coding in Studio"],
        rows: [
          ["Character", "`characters.md`, `people.md`, `cast.md`", "Violet (`--c-character`)"],
          ["Place", "`places.md`, `locations.md`, `settings.md`, `geography.md`", "Teal (`--c-place`)"],
          ["Organization", "`organizations.md`, `institutions.md`, `companies.md`", "Terracotta (`--c-organization`)"],
          ["Motif / Object", "`motifs.md`, `symbols.md`, `objects.md`", "Amber Gold (`--c-motif`)"],
          ["Canon / General", "`canon.md`, `book-on-one-page.md`, any other `bible/*.md`", "Slate (`--c-entry`)"],
        ],
      },
      {
        type: "h2",
        id: "automatic-prose-linking",
        text: "Automatic Mention Highlighting & Aliases",
      },
      {
        type: "p",
        text: "As you write in the Manuscript, Bookkit's incremental ProseMirror decoration engine (`BookLinks`) highlights recognized character names, place names, organizations, and motifs automatically.",
      },
      {
        type: "code",
        lang: "markdown",
        filename: "bible/characters.md",
        code: `# Characters

## Jakob Kessler
*Also called: Kessler, the young smith (Ch. 11).*

- **On the page:**
  - Nineteen years old in the eighty-second summer. (*Ch. 3*)
  - Apprenticed at the lower forge in Ennet. (*Ch. 3*; *Ch. 11*)
  - Helps Nora carry the iron pot up the gully before the first October snow. (*Ch. 13, Scene 2*: “the pot swung between them”)`,
      },
      {
        type: "h2",
        id: "anchors",
        text: "Chapter References Beside Each Fact",
      },
      {
        type: "p",
        text: "Every fact in the bible, plan, craft and research pages says where the book establishes it. One fact goes on one line, and its references come at the end in one parenthesis: `(*Ch. 13, Scene 2*: “quoted words”; *Ch. 14*)`. The Studio shows them as **chips beside the fact**, never inside the sentence. Each chip names the chapter and scene; hover for the chapter title, scene title and the quoted words, click to open the chapter at those words. A chip turns amber when the quoted words are no longer in the chapter, and red when the chapter or scene does not exist. Put the cursor in a line to edit its raw text, or click a chip and choose **Edit** to pick the chapter, scene and words. The bookmark button in the toolbar adds a reference to the line you are in.",
      },
      {
        type: "h2",
        id: "tables",
        text: "Canon, Style Sheet and Ledgers as Records",
      },
      {
        type: "p",
        text: "Tables in companion pages are edited as records, not as Markdown. **Canon** shows each fact with its references and a label (documented, testimony, inferred, invented); add a fact or a new section at the foot of any table. The **style sheet** reads as decision and value, and **Add decision** suggests what a copyeditor expects (spelling, dashes, numbers…). Wide tables such as the **claim ledger** show one card per claim with its status. Rows move up and down and can be deleted; the file stays the standard Markdown table, with untouched rows kept byte for byte.",
      },
      {
        type: "h2",
        id: "footnotes-and-sources",
        text: "Footnotes and Sources",
      },
      {
        type: "p",
        text: "The toolbar's footnote button inserts a numbered footnote and opens its note; click any footnote number to edit or delete it. Notes are kept as Markdown footnotes (`[^1]` and `[^1]: …`) and listed at the end of the page. **Research › Sources** is the book's bibliography (`research/bibliography.yaml`, CSL-YAML): search, add, edit and delete sources and see how often each is cited. **Cite a source** in the toolbar inserts a citation such as `[@luther1912, Matt 6:7]`, shown as a short cite (“Luther 1912, Matt 6:7”); click it to change the page or add a source. The build turns citations into notes in the book's citation style.",
      },
      {
        type: "list",
        items: [
          {
            title: "Hover Cards",
            text: "Hover over any highlighted entity in your chapter to see an instant summary card with its kind badge and first paragraph.",
          },
          {
            title: "Click to Open Entity Page",
            text: "Click any entity mention (or select it from the Context Panel's **In this chapter** list) to open its dedicated Entity Page (`/bible/characters/jakob-kessler`).",
          },
          {
            title: "Section-Scoped Editing",
            text: "When you edit a character or place card on its Entity Page, `src/lib/entity-section.ts` rewrites only that `## Name` section inside `bible/characters.md`, leaving every other character and the file's front matter untouched.",
          },
          {
            title: "Reverse Backlinks (\"Referenced in\")",
            text: "Every entity page and Context Panel automatically lists every chapter and companion page where that entity is mentioned.",
          },
        ],
      },
    ],
  },
  {
    slug: "planning-and-scenes",
    title: "Outlines, Scene Cards & Timeline",
    category: "The Studio",
    summary: "Plan your book with chapter cards, drag-to-reorder chapter lists, beat-level scene boards, and a vertical timeline.",
    readingMinutes: 5,
    blocks: [
      {
        type: "p",
        text: "The **Plan** view gives you a bird's-eye view of your book's architecture—whether you outline meticulously before drafting or discover structure as you revise.",
      },
      {
        type: "h2",
        id: "chapter-plan-board-and-list",
        text: "Chapter Plan: Board & Reorderable List",
      },
      {
        type: "p",
        text: "Switch between **Cards** and **List** in the Plan view:",
      },
      {
        type: "list",
        items: [
          {
            title: "Plan Board (Cards)",
            text: "Displays every chapter with its status badge (`Written`, `In progress`, `Reference draft`), word count vs. target budget, outline summary from `outline/chapters.md`, and scene count.",
          },
          {
            title: "Plan List & Safe Chapter Reordering",
            text: "Owners can drag chapters (`⠿`) or use keyboard controls to reorder chapters. Bookkit's `reorder.ts` engine plans a single atomic update across the entire repository.",
          },
        ],
      },
      {
        type: "callout",
        kind: "important",
        title: "What Happens When You Reorder Chapters",
        text: "Reordering a chapter automatically renumbers `manuscript/NN-*.md`, `draft/NN-*.md`, `outline/scenes/NN-*.md`, updates `chapter:` YAML front matter and `# Chapter N` headings, reorders `outline/chapters.md`, and updates every `*Ch. N*` anchor across `bible/`, `outline/`, `craft/`, and `research/`. Before writing a single file, Bookkit captures a `Before reordering chapters` snapshot and rolls back automatically if anything fails.",
      },
      {
        type: "h2",
        id: "scene-board",
        text: "The chapter plan (`/<book>/chapter/N/plan`)",
      },
      {
        type: "p",
        text: "In **Plan**, click any chapter to open its plan: the chapter's section of `outline/chapters.md`, edited in place, and its scene cards from `outline/scenes/NN-*.md`. Add a scene with one click; each card is interactive and you click any field to edit:",
      },
      {
        type: "list",
        items: [
          { title: "Scene Title & Number", text: "Automatically numbered (`Scene 1`, `Scene 2`…) with one-click move up/down, insert, or delete." },
          { title: "Structured Metadata Fields", text: "Edit `Where / when`, `POV`, `Characters`, `Purpose`, `Conflict`, `Outcome`, or custom bold-keyed fields." },
          { title: "Scene Beats", text: "Add, edit, or remove individual bulleted beats within each scene." },
        ],
      },
      {
        type: "h2",
        id: "interactive-timeline",
        text: "Interactive Vertical Timeline (`bible/timeline.md`)",
      },
      {
        type: "p",
        text: "Any bible file with `timeline` in its name (`bible/timeline.md`) opens in `TimelinePage.tsx` as a visual vertical timeline grouped by `## Period` headings, backed by standard Markdown tables (`| When | What | Anchor |`):",
      },
      {
        type: "code",
        lang: "markdown",
        filename: "bible/timeline.md",
        code: `# Timeline

## The Eighty-Second Summer

| When | What | Anchor |
|---|---|---|
| Late May | Nora follows the stray goat into the hollow and finds the iron door open. | Ch. 1 |
| Mid-June | The first words are drawn in charcoal on the slate floor. | Ch. 6 |
| October | First snow closes the upper pass above Ennet. | Ch. 13 |`,
      },
    ],
  },
  {
    slug: "brief-and-inspiration",
    title: "Book Brief & Inspiration Board",
    category: "The Studio",
    summary: "Define your book's core identity, logline, comparable titles, mood-board imagery, and cover art.",
    readingMinutes: 4,
    blocks: [
      {
        type: "p",
        text: "Before or alongside your manuscript, Bookkit gives you two visual spaces to anchor the vision and tone of your book: the **Brief** (`/<book>/brief`) and the **Inspiration Board** (`/<book>/inspiration`).",
      },
      {
        type: "h2",
        id: "the-book-brief",
        text: "The Book Brief",
      },
      {
        type: "p",
        text: "The Brief page captures the high-level editorial identity of your project:",
      },
      {
        type: "list",
        items: [
          { title: "Logline & Premise", text: "A one- or two-sentence hook that distills the central dramatic question of the book." },
          { title: "Literary Form & Genre", text: "Choose from 12 literary forms (`Novel`, `Short novel`, `Novella`, `Novelette`, `Short story`, `Story collection`, `General nonfiction`, `Memoir`, `Devotional`, `Monograph`, `Essay collection`, `Long essay`) with tailored word-count goals." },
          { title: "Target Readers & Comparable Titles", text: "Note the readership and comparable books (`comps`) that position the work." },
          { title: "Themes & Synopsis", text: "Track core thematic threads and a working synopsis." },
        ],
      },
      {
        type: "h2",
        id: "inspiration-board-and-cover-art",
        text: "Inspiration Board & Cover Art",
      },
      {
        type: "p",
        text: "The **Inspiration** view is a drag-and-drop visual pinboard stored in Supabase Storage (`inspiration` bucket). Upload photographs, historical maps, character sketches, or reference PDFs:",
      },
      {
        type: "list",
        items: [
          {
            title: "Tags, Search & Notes",
            text: "Tag items (`#cover`, `#ennet`, `#architecture`, `#wardrobe`), filter by tag or filename, and attach research notes to every image or PDF.",
          },
          {
            title: "Book Cover Designation",
            text: "Click **Set as cover** on any image card to make it the book's cover thumbnail on your Library shelves. Bookkit automatically analyzes image luminance (`cover-art.ts`) to choose light or dark inverse text contrast.",
          },
          {
            title: "Title Page Mood Background",
            text: "Your Manuscript Title Page subtly renders an atmospheric background from your Inspiration board with a 1-click **Shuffle** button.",
          },
        ],
      },
    ],
  },
  {
    slug: "voice-and-audio",
    title: "Voice Dictation & Read-Aloud",
    category: "Voice & Editorial AI",
    summary: "Dictate prose with Story-Bible-aware Whisper transcription and listen back with natural Aura-2 narration.",
    readingMinutes: 5,
    blocks: [
      {
        type: "p",
        text: "Many novelists and essayists draft by speaking aloud or revise by listening to the cadence of their sentences. Bookkit builds both **Voice Dictation** and **Chapter Read-Aloud** directly into the Studio.",
      },
      {
        type: "h2",
        id: "story-bible-aware-dictation",
        text: "Two-Pass Whisper Dictation (`/api/voice/transcribe`)",
      },
      {
        type: "p",
        text: "Standard speech-to-text mangles fictional character names, place names, and historical terms. When you click the microphone button (`Dictation.tsx`) in the Studio toolbar, Bookkit runs a specialized pipeline that respects the `human-authored` policy:",
      },
      {
        type: "list",
        ordered: true,
        items: [
          {
            title: "Dual Whisper Transcription",
            text: "Bookkit runs `@cf/openai/whisper-large-v3-turbo` twice in parallel: one neutral pass and one vocabulary-biased pass seeded with the names from your book's Story Bible (`voiceVocabulary`).",
          },
          {
            title: "Strict Name-Only Term Correction (`correctVoiceTerms`)",
            text: "Bookkit compares the two transcripts and accepts replacements from the biased pass ONLY where a word phonetically matches a known Story Bible name (e.g., fixing `Agata` → `Agathe`).",
          },
          {
            title: "Spoken Formatting Commands",
            text: "Say `new paragraph`, `new line`, `open quote`, `close quote`, `em dash`, or `ellipsis` naturally while dictating.",
          },
          {
            title: "Zero-Word-Change Punctuation Polish (`onlyPunctuationChanged`)",
            text: "An optional punctuation pass adds periods, commas, capitalization, and quotation marks. Bookkit verifies programmatically (`onlyPunctuationChanged`) that not a single word was added, removed, or changed, and that no unrequested paragraph breaks were inserted. If the model altered any word, the polish pass is rejected and your exact dictated words are kept.",
          },
          {
            title: "House Style Enforcement (`applyHouseStyle`)",
            text: "Finally, quotation marks, dashes, and ellipses are formatted to match your book's declared `style:` in `book.yaml`.",
          },
        ],
      },
      {
        type: "h2",
        id: "aura-2-read-aloud",
        text: "Listening to Your Manuscript (`/api/voice/speak`)",
      },
      {
        type: "p",
        text: "Click **Listen** at the top of any chapter to open the `ListenBar` audio player powered by Deepgram Aura-2 (`@cf/deepgram/aura-2-en`):",
      },
      {
        type: "list",
        items: [
          { title: "10 Natural Voices", text: "Choose from `thalia`, `andromeda`, `helena`, `luna`, `athena`, `apollo`, `arcas`, `orion`, `hermes`, and `zeus`." },
          { title: "Synchronized Paragraph Highlighting", text: "As the narrator reads, the active paragraph, list item, or blockquote highlights in real time and optionally scrolls into view." },
          { title: "Edge & Browser Audio Caching", text: "Synthesized audio is cached by SHA-256 content hash at the Cloudflare edge and in browser storage so re-listening is instantaneous." },
          { title: "Lock-Screen Media SessionControls", text: "Control playback from your phone lock screen, AirPods, or Mac media keys." },
        ],
      },
    ],
  },
  {
    slug: "ai-policies",
    title: "AI Policies & Human Authorship",
    category: "Voice & Editorial AI",
    summary: "How Bookkit enforces human-authored, ai-assisted, and ai-generated policies across the web studio and CLI.",
    readingMinutes: 6,
    blocks: [
      {
        type: "p",
        text: "Every Bookkit book declares an explicit `ai_policy` in `book.yaml`. That declaration is not mere documentation—it is enforced by the Cloudflare Worker (`/api/ai`), synchronized into `CLAUDE.md` and `README.md` (`src/lib/policy-blocks.ts`), and checked by `bin/policy --check`.",
      },
      {
        type: "callout",
        kind: "important",
        title: "The Studio Never Generates Manuscript Prose",
        text: "In the Bookkit web studio, the AI assistant never has an action to insert, continue, or rewrite prose inside `manuscript/`. It operates strictly in two modes: **Editorial Review** (returning observations and notes) and **Companion Preview** (proposing updates to `bible/`, `outline/`, or `craft/` files that stay in preview until you explicitly click Apply).",
      },
      {
        type: "h2",
        id: "the-three-bookkit-policies",
        text: "The Three Standard Policies",
      },
      {
        type: "table",
        headers: ["Policy (`ai_policy`)", "Manuscript Writes (`manuscript/`)", "Companion Docs (`bible/`, `outline/`, `craft/`)", "Industry Grounding"],
        rows: [
          [
            "`human-authored`",
            "**Forbidden.** Not a sentence, phrase, or single typo fix may be written by a model into `manuscript/`.",
            "Permitted if descriptive (not inventive) and labeled as observed.",
            "Stricter than the **Authors Guild Human Authored** certification mark (which allows de minimis spellcheck edits).",
          ],
          [
            "`ai-assisted`",
            "**Assisted (Origin Test).** The human author writes every sentence; a model may tighten or re-punctuate existing author sentences, never originate new prose.",
            "Unrestricted.",
            "Matches **Amazon KDP** 'AI-assisted' (no disclosure required) and **Hachette Book Group** operational guidance.",
          ],
          [
            "`ai-generated`",
            "**Permitted** (in CLI/external workflows; never by the web Studio). New canon must still be raised in `outline/open-questions.md`.",
            "Unrestricted.",
            "Requires disclosure at **Amazon KDP** upload; not eligible for Authors Guild mark.",
          ],
        ],
      },
      {
        type: "h2",
        id: "policy-block-synchronization",
        text: "Policy Block Synchronization (`<!-- bookkit:ai-policy -->`)",
      },
      {
        type: "p",
        text: "When you choose an AI policy in **Book Settings → Configuration**, Bookkit writes `ai_policy: <name>` to `book.yaml` and synchronizes the canonical policy block into `CLAUDE.md` and `README.md` (and `AGENTS.md` if present)—producing output byte-identical to `bin/policy --sync`:",
      },
      {
        type: "code",
        lang: "markdown",
        filename: "CLAUDE.md (synced policy block)",
        code: `<!-- bookkit:ai-policy start | human-authored v1 | do not edit; bookkit owns this block -->

## AI policy: human-authored

This book is **human authored**. Every word of the manuscript is the author's.

**No model may write into \`manuscript/\`** — not a sentence, not a phrase, not a corrected
typo. This holds however obvious the fix, however explicit the request, and however much
cleaner it would make the lint output. If you are about to edit a file under
\`manuscript/\`, you are about to break this policy.

<!-- bookkit:ai-policy end -->`,
      },
      {
        type: "h2",
        id: "included-ai-and-byok",
        text: "Included AI vs. Bring Your Own Key (BYOK)",
      },
      {
        type: "p",
        text: "Bookkit includes zero-configuration editorial AI powered by Cloudflare Workers AI (`provider: 'bookkit'`), so you can run chapter reviews and companion updates immediately without an API key. If you prefer **Anthropic (Claude)** or **OpenAI (GPT)**, you can enter your own API key in **API Settings** (stored locally in your browser and proxied through `/api/ai` with the same book-access and policy checks).",
      },
    ],
  },
  {
    slug: "collaboration",
    title: "Collaborators, Suggestions & Comments",
    category: "Collaboration & History",
    summary: "Invite co-authors, editors, and beta readers with role-based permissions, tracked suggestions, and margin threads.",
    readingMinutes: 5,
    blocks: [
      {
        type: "p",
        text: "Writing a book may be solitary, but revising and publishing rarely are. Bookkit lets you collaborate with co-authors, developmental editors, copy editors, and early readers without ever surrendering ownership of your manuscript.",
      },
      {
        type: "h2",
        id: "roles-and-permissions",
        text: "Roles & Permissions Matrix",
      },
      {
        type: "p",
        text: "Every collaborator has a role—granted either at the **Library** level (for all non-private books in the library) or on a single **Book**:",
      },
      {
        type: "table",
        headers: ["Capability", "Owner (Author)", "Co-Author", "Editor", "Reader (Viewer)"],
        rows: [
          ["Read manuscript, bible, plan & research", "Yes", "Yes", "Yes", "Yes"],
          ["Post margin comments & thread replies", "Yes", "Yes", "Yes", "Yes"],
          ["Propose tracked text suggestions (`bookkit_suggestions`)", "Writes directly", "Yes (autosaved)", "Yes (autosaved)", "No"],
          ["Accept or reject tracked suggestions", "**Owner only**", "No", "No", "No"],
          ["Edit canonical manuscript text directly", "**Owner only**", "Via suggestions", "Via suggestions", "No"],
          ["Add books & move books between library shelves", "Yes", "Yes", "No", "No"],
          ["Capture & restore full-book snapshots", "**Owner only**", "Capture only", "Capture only", "No"],
          ["Manage members, invitations & delete book", "**Owner only**", "No", "No", "No"],
        ],
      },
      {
        type: "h2",
        id: "tracked-suggestions",
        text: "Tracked Suggestions (`<ins>` / `<del>`)",
      },
      {
        type: "p",
        text: "When an **Editor** or **Co-author** edits a chapter or companion document, their changes are autosaved as a pending **Suggestion** rather than overwriting the canonical file:",
      },
      {
        type: "list",
        items: [
          {
            title: "Live Diff Preview",
            text: "The author and collaborators see word-level insertions (`<ins>`) and deletions (`<del>`) in the Context Panel and editor preview.",
          },
          {
            title: "Discussion on Suggestions",
            text: "Every suggestion has its own conversation thread so the editor can explain why a cut or phrasing change was proposed.",
          },
          {
            title: "Validated Author Acceptance",
            text: "Only the book's **Owner** can click **Accept** or **Reject**. Before committing an accepted suggestion, Bookkit validates that the resulting document still satisfies the Bookkit parser and matches the expected file version.",
          },
        ],
      },
      {
        type: "h2",
        id: "invitations-and-sign-in-codes",
        text: "Frictionless Invitations & 6-Digit Sign-In Codes",
      },
      {
        type: "p",
        text: "When you invite someone by email in **Share** or **Library Settings → People**, you can either:",
      },
      {
        type: "list",
        items: [
          {
            title: "Email Invitation",
            text: "Bookkit sends a branded email from `noreply@bookkit.net` containing a 1-click sign-in button and a 6-digit one-time code (`123 456`).",
          },
          {
            title: "Copy One-Time Sign-In Link",
            text: "Generate a one-time invitation link (`/api/invite-link`) to paste into Signal, iMessage, or Slack—no email required.",
          },
        ],
      },
    ],
  },
  {
    slug: "snapshots-and-versioning",
    title: "Snapshots, Three-Way Merge & Reordering",
    category: "Collaboration & History",
    summary: "How Bookkit protects your work with 900ms autosave, three-way merge, IndexedDB draft backup, and immutable snapshots.",
    readingMinutes: 5,
    blocks: [
      {
        type: "p",
        text: "Bookkit is engineered so that no sentence an author writes is ever lost—even across concurrent sessions, browser crashes, or major structural reorganizations.",
      },
      {
        type: "h2",
        id: "autosave-and-three-way-merge",
        text: "Autosave & Three-Way Merge (`bookkit-merge.ts`)",
      },
      {
        type: "p",
        text: "Every document session (`useDocSession.ts`) tracks the base version loaded from the server, your local edits, and live remote updates pushed over Supabase Realtime:",
      },
      {
        type: "list",
        items: [
          {
            title: "Disjoint Concurrent Edits Merge Automatically",
            text: "If you edit the opening paragraph on your laptop while another session updates a paragraph at the end of the chapter, Bookkit performs a three-way merge (`bookkit-merge.ts`), validates the merged structure, and saves cleanly.",
          },
          {
            title: "Overlapping Edits Never Overwrite Silently",
            text: "If two edits touch the exact same lines, Bookkit preserves your local draft in the browser and presents a side-by-side comparison so you can choose which version to keep.",
          },
          {
            title: "IndexedDB Failed-Save Cache (`bookkit-draft-cache.ts`)",
            text: "If your Wi-Fi drops while writing on a train, unsaved drafts are persisted in IndexedDB across page reloads and synced as soon as you reconnect.",
          },
        ],
      },
      {
        type: "h2",
        id: "immutable-snapshots",
        text: "Full-Book Snapshots & Diff Compare",
      },
      {
        type: "p",
        text: "Whenever a document changes in `bookkit_documents`, a database trigger records an immutable, content-deduplicated revision in `bookkit_file_revisions`. Capturing a snapshot (`capture_bookkit_snapshot`) records pointers to every text file revision, binary asset manifest, Unix file mode, and empty directory across the entire book in milliseconds.",
      },
      {
        type: "callout",
        kind: "tip",
        title: "Automatic Safety Snapshots on Restore",
        text: "When the book's owner restores an earlier snapshot (`restore_bookkit_snapshot`), Bookkit automatically captures a safety snapshot of the current state first—so even a restore can be undone with one click.",
      },
    ],
  },
  {
    slug: "book-yaml",
    title: "book.yaml Configuration Reference",
    category: "Bookkit Standard & CLI",
    summary: "Complete reference for book.yaml—the single per-book configuration file shared by Bookkit Studio and the bookkit CLI.",
    readingMinutes: 7,
    blocks: [
      {
        type: "p",
        text: "Every Bookkit book has a single `book.yaml` file at its root. When you change settings in **Book Settings → Configuration** in the web Studio, `src/lib/book-config.ts` edits `book.yaml` through the YAML AST—preserving your comments, unknown keys, and key ordering.",
      },
      {
        type: "h2",
        id: "example-book-yaml",
        text: "Complete `book.yaml` Example",
      },
      {
        type: "code",
        lang: "yaml",
        filename: "book.yaml",
        code: `# The only per-book configuration.
slug: the-owl-at-dusk
title: The Owl at Dusk
subtitle: A Novel
author: Peter S. Dubois
byline: own-name
language: en-US
kind: fiction
form: novel

ai_policy: human-authored

style:
  inherit: shelf
  spelling: american
  serial_comma: true
  quotes: double
  punctuation_in_quotes: american
  dashes: em-closed
  ellipsis: character
  numbers: words-to-hundred
  manual: chicago

manuscript:
  dir: manuscript
  draft: draft
  draft_policy: ai-generated
  layout: flat
  scenes: false
  target_words: 80000
  chapter_words: 3500
  front_matter:
    required: [chapter, title, status]
    optional: [anchor, draft_budget_words]

lint:
  vale:
    styles: [ManuscriptCore, Prose, AmericanSpelling, Vale]
    vocab: OwlAtDusk
    min_alert_level: suggestion

publication:
  formats: [docx, epub, pdf]
  title_page: true
  chapter_heading: "{title}"
  metadata: publication/metadata.yaml
  cover: publication/source-assets/cover.png`,
      },
      {
        type: "h2",
        id: "top-level-keys",
        text: "Top-Level Keys Reference",
      },
      {
        type: "table",
        headers: ["Key", "Type", "Description"],
        rows: [
          ["`slug`", "`string`", "URL-safe identifier for the book repository (e.g. `the-owl-at-dusk`)."],
          ["`title`", "`string`", "**Required.** Display title of the book."],
          ["`subtitle`", "`string`", "Optional subtitle shown on the title page and in publication metadata."],
          ["`author`", "`string`", "Author name printed on the title page and exports."],
          ["`byline`", "`own-name | pen-name`", "Whether the book is published under the author's legal name or a pen name."],
          ["`language`", "`string`", "BCP-47 language tag (default `en-US`)."],
          ["`kind`", "`fiction | nonfiction`", "Primary literary classification."],
          ["`form`", "`BookForm`", "Specific literary form (`novel`, `short-novel`, `novella`, `novelette`, `short-story`, `collection`, `nonfiction`, `memoir`, `devotional`, `monograph`, `essays`, `long-essay`)."],
          ["`ai_policy`", "`human-authored | ai-assisted | ai-generated`", "Declares what AI models may and may not do in this repository."],
          ["`style`", "`HouseStyle`", "House typography and spelling decisions (or `inherit: shelf`)."],
          ["`manuscript`", "`object`", "**Required (`manuscript.dir`).** Directory paths, layout (`flat` or `parts`), scene mode, and word targets."],
          ["`lint`", "`object`", "Vale prose linting styles, vocabulary name, and minimum alert level."],
          ["`publication`", "`object`", "Target build formats (`docx`, `epub`, `pdf`), title page toggle, chapter heading template, and front/back matter lists."],
          ["`companion`", "`object`", "Companion standard version and `retired:` regex patterns for deprecated plot/canon details."],
        ],
      },
    ],
  },
  {
    slug: "house-style",
    title: "House Style & Typography Rules",
    category: "Bookkit Standard & CLI",
    summary: "Configure spelling, serial commas, quotation marks, dashes, ellipses, and style manuals per book or per shelf.",
    readingMinutes: 4,
    blocks: [
      {
        type: "p",
        text: "Consistent typography separates a finished book from a rough draft. Bookkit lets you declare your **House Style** once—either on an individual book or on a Library **Shelf**—and uses those rules across the Studio, Voice Dictation, and Vale prose linting.",
      },
      {
        type: "h2",
        id: "style-fields-reference",
        text: "All 8 House Style Settings",
      },
      {
        type: "table",
        headers: ["Style Key", "Options", "Examples & Behavior"],
        rows: [
          ["`spelling`", "`american` · `british` · `oxford`", "`color, traveled` (American) · `colour, realise` (British) · `colour, realize` (Oxford `-ize`). Syncs Vale `AmericanSpelling` / `OxfordSpelling`."],
          ["`serial_comma`", "`true` · `false`", "`bread, wine, and salt` (`true`) vs. `bread, wine and salt` (`false`)."],
          ["`quotes`", "`double` · `single`", "`“She said ‘no’.”` (`double`) vs. `‘She said “no”.’` (`single`)."],
          ["`punctuation_in_quotes`", "`american` · `logical`", "`“no,” she said.` (`american`, inside quotes) vs. `the word ‘no’, she said.` (`logical`)."],
          ["`dashes`", "`em-closed` · `en-spaced` · `none`", "`word—word` (`em-closed`) vs. `word – word` (`en-spaced`)."],
          ["`ellipsis`", "`character` · `dots`", "`…` single character (`character`) vs. `...` three periods (`dots`)."],
          ["`numbers`", "`words` · `words-to-hundred` · `words-to-ten` · `numerals`", "Controls whether numbers like `41` or `9` are spelled out in prose."],
          ["`manual`", "`chicago` · `new-oxford` · `ap` · `none`", "Reference editorial manual for editorial reviews and copy-editing notes."],
        ],
      },
      {
        type: "callout",
        kind: "tip",
        title: "Automatic Enforcement in Voice Dictation",
        text: "When you dictate a passage using the Studio microphone, `applyHouseStyle` in `src/lib/voice-text.ts` automatically formats curly quotes, nested quotes, dashes, and ellipses to match your book's active House Style.",
      },
    ],
  },
  {
    slug: "file-format-and-cli",
    title: "Plain-File Repository & CLI Parity",
    category: "Bookkit Standard & CLI",
    summary: "How Bookkit stores books as lossless Markdown and YAML, exports streaming ZIP archives, and works with the bookkit CLI.",
    readingMinutes: 5,
    blocks: [
      {
        type: "p",
        text: "Bookkit never traps your writing in an opaque database. Every book in Supabase (`bookkit_documents` + `bookkit_assets`) is an exact mirror of a standard on-disk Bookkit repository.",
      },
      {
        type: "h2",
        id: "repository-directory-layout",
        text: "Standard Repository Layout",
      },
      {
        type: "code",
        lang: "text",
        filename: "the-owl-at-dusk/",
        code: `the-owl-at-dusk/
├── book.yaml                  # Single per-book configuration
├── CLAUDE.md                  # AI policy block + repository guidance
├── README.md                  # Book overview + AI policy block
├── manuscript/                # Canonical human-authored chapters
│   ├── 01-the-iron-door.md
│   └── 02-the-switch-box.md
├── draft/                     # Optional read-only reference draft
│   ├── 01-the-iron-door.md
│   └── 02-the-switch-box.md
├── bible/                     # Story bible & world canon
│   ├── book-on-one-page.md
│   ├── canon.md
│   ├── characters.md
│   ├── places.md
│   └── timeline.md
├── outline/                   # Structural plans & scene cards
│   ├── chapters.md
│   ├── arcs.md
│   ├── open-questions.md
│   └── scenes/
│       ├── 01-the-iron-door.md
│       └── 02-the-switch-box.md
├── craft/                     # Style & voice rules
│   ├── style-guide.md
│   └── author-voice.md
├── research/                  # Source notes, claim ledgers & archival PDFs
│   ├── README.md
│   └── claims.md
└── publication/               # Metadata & cover art for print/ebook builds
    ├── metadata.yaml
    └── source-assets/
        └── cover.png`,
      },
      {
        type: "h2",
        id: "chapter-front-matter",
        text: "Chapter Markdown & Front Matter",
      },
      {
        type: "p",
        text: "Every chapter file in `manuscript/` (or `manuscript/<part>/` when `manuscript.layout: parts`) begins with YAML front matter validated by `parseBookkit` (`src/lib/bookkit.ts`):",
      },
      {
        type: "code",
        lang: "markdown",
        filename: "manuscript/01-the-iron-door.md",
        code: `---
chapter: 1
title: The Iron Door
status: drafted
draft_budget_words: 3500
---

# Chapter 1 — The Iron Door

The goat went up the gully where the alder scrub grew thick over the snowmelt, and Nora went after her with the switch in her hand.`,
      },
      {
        type: "h2",
        id: "streaming-zip-import-and-export",
        text: "Lossless Streaming ZIP Import & Export",
      },
      {
        type: "p",
        text: "From **Book Settings**, you can export your entire book as a `.zip` archive (`bookkit-archive.ts`) or import any `.zip` repository (`bookkit-import.ts`):",
      },
      {
        type: "list",
        items: [
          {
            title: "Exact Bytes, Checksums & Unix Modes",
            text: "Exports preserve raw Markdown, UTF-8 byte order marks, empty directories (`.gitkeep`), binary assets, and executable permissions (`bin/` shims)—verified across 1,229 text files and 3+ GB of research archives.",
          },
          {
            title: "Direct-to-Disk Streaming",
            text: "Using `@zip.js/zip.js` and the File System Access API (`showSaveFilePicker`), multi-gigabyte repositories stream directly to disk in 8 MiB content-addressed chunks without buffering in browser memory.",
          },
          {
            title: "CLI Parity (`book check`, `book build`, `book stats`)",
            text: "Unzip your exported archive and run `book check`, `book stats`, or `book build` locally to typeset publication-ready PDF, EPUB, and DOCX editions via Pandoc, Typst, and Tectonic.",
          },
        ],
      },
    ],
  },
];

export const DOC_CATEGORIES: DocCategory[] = [
  "Getting Started",
  "The Studio",
  "Voice & Editorial AI",
  "Collaboration & History",
  "Bookkit Standard & CLI",
].map((label) => ({
  id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  label,
  pages: DOC_PAGES.filter((p) => p.category === label),
}));

export function getDocPage(slug: string): DocPage {
  const clean = slug.trim().toLowerCase() || "introduction";
  return DOC_PAGES.find((p) => p.slug === clean) ?? DOC_PAGES[0];
}

export function getAdjacentDocPages(slug: string): { prev: DocPage | null; next: DocPage | null } {
  const idx = DOC_PAGES.findIndex((p) => p.slug === slug);
  if (idx < 0) return { prev: null, next: DOC_PAGES[1] ?? null };
  return {
    prev: idx > 0 ? DOC_PAGES[idx - 1] : null,
    next: idx < DOC_PAGES.length - 1 ? DOC_PAGES[idx + 1] : null,
  };
}

export interface DocSearchHit {
  slug: string;
  pageTitle: string;
  category: string;
  sectionId?: string;
  sectionTitle?: string;
  snippet: string;
}

export function searchDocs(query: string): DocSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const matchesAll = (haystack: string) => {
    const lower = haystack.toLowerCase();
    return words.every((w) => lower.includes(w));
  };
  const hits: DocSearchHit[] = [];

  for (const page of DOC_PAGES) {
    if (matchesAll(`${page.title} ${page.summary} ${page.category}`)) {
      hits.push({
        slug: page.slug,
        pageTitle: page.title,
        category: page.category,
        snippet: page.summary,
      });
    }

    let currentHeading: { id: string; text: string } | undefined;
    for (const block of page.blocks) {
      if (block.type === "h2" || block.type === "h3") {
        currentHeading = { id: block.id, text: block.text };
        if (matchesAll(block.text)) {
          hits.push({
            slug: page.slug,
            pageTitle: page.title,
            category: page.category,
            sectionId: block.id,
            sectionTitle: block.text,
            snippet: page.summary,
          });
        }
      } else if (block.type === "p" || block.type === "callout") {
        const text = block.type === "callout" ? `${block.title}: ${block.text}` : block.text;
        if (matchesAll(text)) {
          hits.push({
            slug: page.slug,
            pageTitle: page.title,
            category: page.category,
            sectionId: currentHeading?.id,
            sectionTitle: currentHeading?.text,
            snippet: text.slice(0, 150) + (text.length > 150 ? "…" : ""),
          });
        }
      } else if (block.type === "list") {
        for (const item of block.items) {
          const text = `${item.title ?? ""} ${item.text}`.trim();
          if (matchesAll(text)) {
            hits.push({
              slug: page.slug,
              pageTitle: page.title,
              category: page.category,
              sectionId: currentHeading?.id,
              sectionTitle: currentHeading?.text,
              snippet: text.slice(0, 150) + (text.length > 150 ? "…" : ""),
            });
          }
        }
      } else if (block.type === "code") {
        if (matchesAll(`${block.filename ?? ""} ${block.code}`)) {
          hits.push({
            slug: page.slug,
            pageTitle: page.title,
            category: page.category,
            sectionId: currentHeading?.id,
            sectionTitle: currentHeading?.text,
            snippet: `${block.filename ? block.filename + " — " : ""}${block.code.split("\n")[0]}`,
          });
        }
      }
    }
  }

  // Deduplicate by (slug, sectionId) and cap at 12 results
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.slug}#${h.sectionId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}
