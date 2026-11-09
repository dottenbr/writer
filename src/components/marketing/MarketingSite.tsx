import { useEffect, useState } from "react";
import { navigatePublic } from "../../lib/public-routes";
import { useAuthStore } from "../../store/useAuthStore";
import { Icon } from "../studio/common";
import { useTheme } from "../studio/Studio";

type ShowcaseTab = "manuscript" | "libraries" | "bible" | "collaboration" | "voice";

interface DemoEntity {
  id: string;
  name: string;
  kind: "character" | "place" | "organization" | "motif";
  kindLabel: string;
  aliases: string;
  summary: string;
  anchors: string[];
}

const DEMO_ENTITIES: Record<string, DemoEntity> = {
  nora: {
    id: "nora",
    name: "Nora",
    kind: "character",
    kindLabel: "Character",
    aliases: "The goatherd",
    summary:
      "Takes Ennet's goats up to the summer hollow above the gully. Finds the iron door standing a hand's width open in May and learns to read from the Owl in charcoal on the slate floor.",
    anchors: ["Ch. 1", "Ch. 2", "Ch. 6", "Ch. 21"],
  },
  ennet: {
    id: "ennet",
    name: "Ennet",
    kind: "place",
    kindLabel: "Place",
    aliases: "The lower village",
    summary:
      "The valley village below the pass. In summer its cattle are kept on the high pastures along the mountain while the forge and ash-lye soap pots stand by the lower stream.",
    anchors: ["Ch. 1", "Ch. 3", "Ch. 4", "Ch. 9"],
  },
  owl: {
    id: "owl",
    name: "The Owl",
    kind: "motif",
    kindLabel: "Motif",
    aliases: "The voice in the room",
    summary:
      "Speaks from behind the iron grille while the sun is on the roof and not a minute longer. Cannot see or draw; tells Nora each letter's shape and answers every question asked of it.",
    anchors: ["Ch. 2", "Ch. 3", "Ch. 6", "Ch. 20"],
  },
  jakob: {
    id: "jakob",
    name: "Jakob Kessler",
    kind: "character",
    kindLabel: "Character",
    aliases: "Kessler, the young smith",
    summary:
      "Nineteen years old in the eighty-second summer. Apprenticed at the forge in Ennet; helps carry the great iron pot up the gully before the October snow.",
    anchors: ["Ch. 3", "Ch. 11", "Ch. 13"],
  },
};

const FAQ_ITEMS = [
  {
    q: "Is Bookkit really free to use right now?",
    a: "Yes. During our Founding Author & Early Access period, every subscription is $0/month with no credit card required. You get your own <library>.bookkit.net subdomain, unlimited shelves and books, collaborator invitations, voice dictation, read-aloud, and editorial AI. When we introduce paid plans later, you will receive plenty of advance notice, and your books are always exportable as lossless plain Markdown + book.yaml.",
  },
  {
    q: "What is a Library, and how do Shelves work?",
    a: "A Library is your personal or imprint home on Bookkit (for example, elena.bookkit.net). Inside your library, you create Shelves (such as Fiction, Nonfiction, Poetry, or a specific book series). Each shelf can define a House Style (American/Chicago, British/New Oxford, or Oxford -ize spelling, quotation marks, serial comma, and dashes) that every book on that shelf inherits automatically.",
  },
  {
    q: "Does AI ever write or rewrite my manuscript prose?",
    a: "Never in the Studio. Bookkit is built around the Authors Guild's Human Authored standard. Every book declares an explicit ai_policy in book.yaml (defaulting to human-authored). The Studio's assistant only provides read-only editorial reviews and previews for companion documents (bible, outline, craft)—it never has an action to generate or insert manuscript prose.",
  },
  {
    q: "How are my books stored? Can I use Git or the bookkit CLI?",
    a: "Every book is stored as a standard Bookkit file repository: book.yaml, manuscript/*.md, draft/*.md, bible/*.md, outline/*.md, craft/*.md, and research/. Untouched Markdown blocks save back byte-for-byte. You can export or import a complete .zip archive at any time and run book check, book stats, and book build locally.",
  },
  {
    q: "How does collaboration work for editors, co-authors, and beta readers?",
    a: "You can invite people either to an entire Library or to a single book as a Co-author, Editor, or Reader. Only the book's Owner writes directly to canonical manuscript files. Editors and Co-authors write tracked suggestions (<ins> / <del>) that autosave in real time for the owner to accept or reject, and Readers can post margin comments and replies.",
  },
];

export function MarketingSite({
  initialSection,
}: {
  initialSection?: "features" | "pricing" | "studio" | "standard" | "ai-policy";
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [theme, setTheme] = useTheme();
  const [heroSlug, setHeroSlug] = useState("");
  const [activeTab, setActiveTab] = useState<ShowcaseTab>("manuscript");
  const [sceneExpanded, setSceneExpanded] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<DemoEntity>(DEMO_ENTITIES.nora);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    document.title = "Bookkit · Write your book like a document, with your world one click away";
    if (initialSection) {
      const el = document.getElementById(initialSection);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 40);
      }
    }
  }, [initialSection]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="mkt-shell">
      {/* Sticky Top Navigation */}
      <header className="mkt-topbar">
        <div className="mkt-topbar-inner">
          <div className="mkt-topbar-left">
            <a
              href="/marketing"
              className="brand mkt-brand"
              onClick={(e) => {
                e.preventDefault();
                navigatePublic("/marketing");
              }}
            >
              <span className="brand-mark">b</span>
              <span className="brand-name">bookkit</span>
            </a>
            <nav className="mkt-nav-links" aria-label="Primary navigation">
              <a
                href="#studio"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("studio");
                }}
              >
                Studio
              </a>
              <a
                href="#features"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("features");
                }}
              >
                Features
              </a>
              <a
                href="#standard"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("standard");
                }}
              >
                Standard & CLI
              </a>
              <a
                href="#ai-policy"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("ai-policy");
                }}
              >
                Human Authored
              </a>
              <a
                href="#pricing"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("pricing");
                }}
              >
                Pricing <span className="mkt-free-pill">Free</span>
              </a>
              <a
                href="/docs"
                onClick={(e) => {
                  e.preventDefault();
                  navigatePublic("/docs");
                }}
              >
                Docs
              </a>
            </nav>
          </div>

          <div className="mkt-topbar-right">
            <button
              type="button"
              className="icon-btn"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
            </button>
            {isAuthenticated ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => navigatePublic("/")}
              >
                Open your Library <Icon name="chevron" size={13} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => navigatePublic("/login")}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => navigatePublic("/signup")}
                >
                  Start Free Library
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mkt-hero">
        <div className="mkt-container">
          <div className="mkt-hero-badge">
            <span className="mkt-badge-dot" />
            <span>Free Early-Access Subscription · Claim your Library & shelves today</span>
          </div>

          <h1 className="mkt-hero-title">
            Write your book like a document.
            <br />
            <em>Keep your world one click away.</em>
          </h1>

          <p className="mkt-hero-sub">
            Bookkit is a calm, collaborative studio for novelists, nonfiction authors, and independent presses.
            Write in one continuous manuscript with inline scene cards, an auto-linked story bible, and your own{" "}
            <code>.bookkit.net</code> library—backed by lossless plain Markdown and <code>book.yaml</code>.
          </p>

          {/* Interactive Claim Your Library Bar */}
          <form
            className="mkt-claim-bar"
            onSubmit={(e) => {
              e.preventDefault();
              const clean = heroSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
              navigatePublic(clean ? `/signup?slug=${encodeURIComponent(clean)}` : "/signup");
            }}
          >
            <div className="mkt-claim-input-wrap">
              <span className="mkt-claim-prefix">https://</span>
              <input
                type="text"
                value={heroSlug}
                onChange={(e) => setHeroSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32))}
                placeholder="your-name"
                aria-label="Choose your library address"
              />
              <span className="mkt-claim-suffix">.bookkit.net</span>
            </div>
            <button type="submit" className="btn btn-primary mkt-claim-btn">
              Create Free Library & Shelves <Icon name="chevron" size={14} />
            </button>
          </form>

          <div className="mkt-hero-meta">
            <span>
              <Icon name="check" size={13} /> Free to use right now ($0/mo)
            </span>
            <span>
              <Icon name="check" size={13} /> Custom shelves & house styles
            </span>
            <span>
              <Icon name="check" size={13} /> Lossless plain-file ZIP export
            </span>
            <button
              type="button"
              className="link-btn"
              onClick={() => navigatePublic("/docs")}
            >
              Read the Documentation →
            </button>
          </div>
        </div>
      </section>

      {/* Interactive Studio Showcase */}
      <section id="studio" className="mkt-showcase-section">
        <div className="mkt-container">
          <div className="mkt-showcase-tabs" role="tablist" aria-label="Studio preview tabs">
            {[
              { id: "manuscript", label: "Continuous Manuscript", icon: "feather" },
              { id: "libraries", label: "Libraries & Shelves", icon: "book" },
              { id: "bible", label: "Auto-Linked Story Bible", icon: "pin" },
              { id: "collaboration", label: "Suggestions & Review", icon: "users" },
              { id: "voice", label: "Dictation & Read-Aloud", icon: "mic" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                className={`mkt-showcase-tab ${activeTab === t.id ? "on" : ""}`}
                onClick={() => setActiveTab(t.id as ShowcaseTab)}
              >
                <Icon name={t.icon} size={15} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Mock Studio Window */}
          <div className="mkt-studio-frame">
            {/* Mock Studio Topbar */}
            <div className="mkt-mock-topbar">
              <div className="mkt-mock-topbar-left">
                <span className="brand-mark">b</span>
                <span className="mkt-mock-crumb">dubois.bookkit.net</span>
                <span className="topbar-slash">/</span>
                <strong>The Owl at Dusk</strong>
              </div>
              <div className="mkt-mock-pills">
                <span className={activeTab === "manuscript" ? "on" : ""} onClick={() => setActiveTab("manuscript")}>
                  Manuscript
                </span>
                <span className={activeTab === "libraries" ? "on" : ""} onClick={() => setActiveTab("libraries")}>
                  Library & Shelves
                </span>
                <span className={activeTab === "bible" ? "on" : ""} onClick={() => setActiveTab("bible")}>
                  Bible
                </span>
                <span className={activeTab === "collaboration" ? "on" : ""} onClick={() => setActiveTab("collaboration")}>
                  Review
                </span>
                <span className={activeTab === "voice" ? "on" : ""} onClick={() => setActiveTab("voice")}>
                  Voice
                </span>
              </div>
              <div className="mkt-mock-topbar-right">
                <span className="live-dot on" />
                <span className="muted">Saved · human-authored</span>
              </div>
            </div>

            {/* TAB 1: Continuous Manuscript + Inline Scene Card + Linked Bible */}
            {activeTab === "manuscript" && (
              <div className="mkt-mock-body">
                <aside className="mkt-mock-nav">
                  <div className="mkt-mock-nav-head">
                    <strong>The Owl at Dusk</strong>
                    <span>Peter S. Dubois · 64,200 / 80,000 words</span>
                    <div className="nav-progress-bar">
                      <span style={{ width: "80%" }} />
                    </div>
                  </div>
                  <div className="mkt-mock-nav-list">
                    <div className="mkt-mock-nav-item">
                      <span className="status-dot written" />
                      <span className="nav-num">1</span>
                      <span>The Iron Door</span>
                    </div>
                    <div className="mkt-mock-nav-item active">
                      <span className="status-dot written" />
                      <span className="nav-num">2</span>
                      <span>The Switch Box</span>
                    </div>
                    <div className="mkt-mock-nav-item">
                      <span className="status-dot written" />
                      <span className="nav-num">3</span>
                      <span>The Great Iron Pot</span>
                    </div>
                    <div className="mkt-mock-nav-item">
                      <span className="status-dot progress" />
                      <span className="nav-num">4</span>
                      <span>Ash-Lye Soap</span>
                    </div>
                    <div className="mkt-mock-nav-item">
                      <span className="status-dot draft" />
                      <span className="nav-num">5</span>
                      <span>Charcoal on Slate</span>
                    </div>
                  </div>
                </aside>

                <div className="mkt-mock-page-wrap">
                  <div className="mkt-mock-page">
                    <div className="chapter-head">
                      <div className="chapter-eyebrow">
                        <span>Chapter 2</span>
                        <span className="chapter-words">3,420 words</span>
                        <span className="chapter-state written">Written</span>
                      </div>
                      <h3 className="chapter-title">The Switch Box</h3>
                    </div>

                    {/* Interactive Inline Scene Card */}
                    <div className={`scene-inline ${sceneExpanded ? "open" : ""}`}>
                      <button
                        type="button"
                        className="scene-inline-head"
                        onClick={() => setSceneExpanded((v) => !v)}
                      >
                        <span className="pill">Scene 1</span>
                        <span className="scene-inline-title">The Switch Box in the Hollow</span>
                        <span className="scene-inline-purpose">
                          Nora reaches inside the iron door and hears the Owl speak for the first time.
                        </span>
                        <span className="scene-inline-chevron">
                          <Icon name={sceneExpanded ? "down" : "chevron"} size={14} />
                        </span>
                      </button>
                      {sceneExpanded && (
                        <div className="scene-inline-body">
                          <div className="mkt-scene-grid">
                            <div>
                              <span className="scene-inline-label">Where / when</span>
                              <p>The rocky hollow above Ennet, late afternoon in May.</p>
                            </div>
                            <div>
                              <span className="scene-inline-label">Characters</span>
                              <p>Nora, the Owl (voice only)</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Prose with clickable entity mentions */}
                    <div className="mkt-mock-prose">
                      <p>
                        The metal door stood open just wide enough for{" "}
                        <button
                          type="button"
                          className={`mkt-entity-chip c-character ${selectedEntity.id === "nora" ? "active" : ""}`}
                          onClick={() => setSelectedEntity(DEMO_ENTITIES.nora)}
                        >
                          Nora
                        </button>{" "}
                        to slip through after the goat. Down in{" "}
                        <button
                          type="button"
                          className={`mkt-entity-chip c-place ${selectedEntity.id === "ennet" ? "active" : ""}`}
                          onClick={() => setSelectedEntity(DEMO_ENTITIES.ennet)}
                        >
                          Ennet
                        </button>{" "}
                        the evening bell had not yet rung, and the afternoon sun still lay warm across the slate slabs of the roof.
                      </p>
                      <p>
                        Just inside the threshold, bolted to the dry stone at the height of her chest, sat the grey iron box. Before{" "}
                        <button
                          type="button"
                          className={`mkt-entity-chip c-character ${selectedEntity.id === "jakob" ? "active" : ""}`}
                          onClick={() => setSelectedEntity(DEMO_ENTITIES.jakob)}
                        >
                          Jakob Kessler
                        </button>{" "}
                        had ever climbed the gully,{" "}
                        <button
                          type="button"
                          className={`mkt-entity-chip c-motif ${selectedEntity.id === "owl" ? "active" : ""}`}
                          onClick={() => setSelectedEntity(DEMO_ENTITIES.owl)}
                        >
                          the Owl
                        </button>{" "}
                        spoke from behind the narrow brass grille—quietly, as if finishing a thought begun eighty summers ago.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Context Panel showing selected entity */}
                <aside className="mkt-mock-context">
                  <div className="mkt-context-label">Story Bible · Click a highlighted name</div>
                  <div className="mkt-entity-card">
                    <div className="mkt-entity-card-head">
                      <span className={`mkt-kind-pill ${selectedEntity.kind}`}>
                        {selectedEntity.kindLabel}
                      </span>
                      <strong>{selectedEntity.name}</strong>
                    </div>
                    <div className="mkt-entity-alias">Also called: {selectedEntity.aliases}</div>
                    <p className="mkt-entity-summary">{selectedEntity.summary}</p>
                    <div className="mkt-entity-anchors">
                      <span className="muted">Referenced in:</span>
                      {selectedEntity.anchors.map((a) => (
                        <span key={a} className="pill subtle">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mkt-context-note">
                    <Icon name="sparkle" size={14} />
                    <span>
                      Every character, place, organization, and motif in <code>bible/*.md</code> links automatically in your prose.
                    </span>
                  </div>
                </aside>
              </div>
            )}

            {/* TAB 2: Libraries & Shelves */}
            {activeTab === "libraries" && (
              <div className="mkt-mock-single">
                <div className="mkt-lib-demo-head">
                  <div>
                    <div className="ws-date">Your Library · dubois.bookkit.net</div>
                    <h3>Peter’s Library</h3>
                    <p className="muted">
                      Each library has its own subdomain, its own shelves with custom House Styles, and a 12-week writing activity calendar.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => navigatePublic("/signup")}
                  >
                    Create Your Library →
                  </button>
                </div>

                <div className="mkt-lib-shelves-demo">
                  <div className="mkt-demo-shelf">
                    <div className="mkt-demo-shelf-head">
                      <strong>Shelf: The Mountain Novels</strong>
                      <span className="pill">House Style: American · Chicago</span>
                    </div>
                    <div className="mkt-demo-books">
                      <div className="mkt-demo-book-card">
                        <div className="ws-cover">
                          <span>O</span>
                        </div>
                        <div className="mkt-demo-book-info">
                          <strong>The Owl at Dusk</strong>
                          <span>64,200 of 80,000 words · 18 of 21 chapters written</span>
                          <div className="ws-progress-bar">
                            <span style={{ width: "80%" }} />
                          </div>
                        </div>
                      </div>
                      <div className="mkt-demo-book-card">
                        <div className="ws-cover">
                          <span>C</span>
                        </div>
                        <div className="mkt-demo-book-info">
                          <strong>Cold Solder</strong>
                          <span>94,689 of 95,000 words · 49 of 49 chapters</span>
                          <div className="ws-progress-bar">
                            <span style={{ width: "99%" }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mkt-demo-shelf">
                    <div className="mkt-demo-shelf-head">
                      <strong>Shelf: Essays & Monographs</strong>
                      <span className="pill">House Style: Oxford (-ize)</span>
                    </div>
                    <div className="mkt-demo-books">
                      <div className="mkt-demo-book-card">
                        <div className="ws-cover">
                          <span>W</span>
                        </div>
                        <div className="mkt-demo-book-info">
                          <strong>Words Given</strong>
                          <span>72,400 of 85,000 words · 47 chapters · 108 archival sources</span>
                          <div className="ws-progress-bar">
                            <span style={{ width: "85%" }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Story Bible & Timeline */}
            {activeTab === "bible" && (
              <div className="mkt-mock-single">
                <div className="mkt-lib-demo-head">
                  <div>
                    <div className="ws-date">Story Bible & Timeline · bible/</div>
                    <h3>Structured Worldbuilding in Plain Markdown</h3>
                    <p className="muted">
                      Each <code>## Name</code> section in <code>bible/characters.md</code> or <code>bible/places.md</code> becomes an editable card, while <code>bible/timeline.md</code> renders as an interactive vertical timeline.
                    </p>
                  </div>
                </div>
                <div className="mkt-bible-demo-grid">
                  {Object.values(DEMO_ENTITIES).map((ent) => (
                    <div key={ent.id} className="mkt-entity-card">
                      <div className="mkt-entity-card-head">
                        <span className={`mkt-kind-pill ${ent.kind}`}>{ent.kindLabel}</span>
                        <strong>{ent.name}</strong>
                      </div>
                      <div className="mkt-entity-alias">Aliases: {ent.aliases}</div>
                      <p className="mkt-entity-summary">{ent.summary}</p>
                      <div className="mkt-entity-anchors">
                        {ent.anchors.map((a) => (
                          <span key={a} className="pill subtle">
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: Collaboration & Tracked Suggestions */}
            {activeTab === "collaboration" && (
              <div className="mkt-mock-single">
                <div className="mkt-lib-demo-head">
                  <div>
                    <div className="ws-date">Editorial Collaboration · Owner, Co-author, Editor, Reader</div>
                    <h3>Tracked Suggestions Without Losing Canonical Control</h3>
                    <p className="muted">
                      Editors and co-authors propose changes that autosave as tracked suggestions. Only the book’s Owner can accept or reject them into <code>manuscript/</code>.
                    </p>
                  </div>
                </div>
                <div className="mkt-collab-demo">
                  <div className="mkt-collab-diff-card">
                    <div className="mkt-collab-diff-head">
                      <span className="avatar">H</span>
                      <div>
                        <strong>Heidi Kaloustian (Editor)</strong>
                        <span className="muted">Proposed suggestion on Chapter 2 · 4 minutes ago</span>
                      </div>
                      <div className="mkt-collab-actions">
                        <span className="pill">Accept (Owner only)</span>
                        <span className="pill subtle">Reject</span>
                      </div>
                    </div>
                    <p className="mkt-collab-diff-prose">
                      The metal door stood{" "}
                      <del className="mkt-del">a hand’s width open</del>{" "}
                      <ins className="mkt-ins">open just wide enough to slip through</ins>{" "}
                      so that Nora and the goat could pass into the dry stone room.
                    </p>
                    <div className="mkt-collab-thread">
                      <strong>Heidi:</strong> “In Chapter 1 both Nora and the goat pass through without forcing the hinge—tightening this phrase to match Canon (`bible/canon.md`).”
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: Voice Dictation & Read-Aloud */}
            {activeTab === "voice" && (
              <div className="mkt-mock-single">
                <div className="mkt-lib-demo-head">
                  <div>
                    <div className="ws-date">Voice Studio · Whisper + Deepgram Aura-2</div>
                    <h3>Story-Bible-Aware Dictation & Synchronized Read-Aloud</h3>
                    <p className="muted">
                      Dictate passages with automatic character/place name correction and zero-word-change punctuation polish, or listen back to your chapters with 10 natural voices.
                    </p>
                  </div>
                </div>
                <div className="mkt-voice-demo-grid">
                  <div className="mkt-voice-card">
                    <div className="mkt-voice-card-head">
                      <Icon name="mic" size={16} />
                      <strong>Two-Pass Whisper Dictation</strong>
                    </div>
                    <div className="mkt-voice-step">
                      <span className="muted">1. Raw Whisper transcript:</span>
                      <code>“nora went up to enet to ask agata about the iron pot”</code>
                    </div>
                    <div className="mkt-voice-step">
                      <span className="muted">2. Story Bible term fix + house style polish:</span>
                      <code>“Nora went up to Ennet to ask Agathe about the iron pot.”</code>
                    </div>
                    <p className="muted">
                      Guaranteed by <code>onlyPunctuationChanged()</code>: never adds, deletes, or rewrites a single word you spoke.
                    </p>
                  </div>

                  <div className="mkt-voice-card">
                    <div className="mkt-voice-card-head">
                      <Icon name="headphones" size={16} />
                      <strong>Aura-2 Chapter Read-Aloud</strong>
                    </div>
                    <p>
                      Hear the rhythm of your dialogue and narration with paragraph-by-paragraph highlighting, lock-screen controls, sleep timer, and MP3 download.
                    </p>
                    <div className="mkt-mock-listenbar">
                      <span className="listen-play">
                        <Icon name="play" size={15} />
                      </span>
                      <div>
                        <strong>Ch. 2 — The Switch Box</strong>
                        <span className="muted">Voice: Thalia · Paragraph 4 of 28</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section id="features" className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <div className="ws-date">Everything in One Linked Workspace</div>
            <h2>Built for the way real books are written, edited, and published</h2>
            <p>
              Every tool in Bookkit is designed to serve long-form concentration while keeping your story bible, outline, and files in total harmony.
            </p>
          </div>

          <div className="mkt-feature-grid">
            <div className="mkt-feature-card">
              <div className="mkt-feature-icon">
                <Icon name="book" size={20} />
              </div>
              <h3>Libraries & Shelves on Your Subdomain</h3>
              <p>
                Claim <code>&lt;you&gt;.bookkit.net</code>. Group books onto shelves, set a shelf-wide House Style (Chicago, New Oxford, AP), and track daily progress on a 12-week activity calendar.
              </p>
              <button
                type="button"
                className="link-btn"
                onClick={() => navigatePublic("/docs/libraries-and-shelves")}
              >
                Explore Libraries & Shelves →
              </button>
            </div>

            <div className="mkt-feature-card">
              <div className="mkt-feature-icon">
                <Icon name="feather" size={20} />
              </div>
              <h3>Continuous Manuscript & Inline Scenes</h3>
              <p>
                Read and edit your entire book as one seamless document. Collapsible scene cards sit right above the prose they govern, and reference drafts stay read-only beside your manuscript.
              </p>
              <button
                type="button"
                className="link-btn"
                onClick={() => navigatePublic("/docs/manuscript-editor")}
              >
                Explore Manuscript Editor →
              </button>
            </div>

            <div className="mkt-feature-card">
              <div className="mkt-feature-icon">
                <Icon name="pin" size={20} />
              </div>
              <h3>Auto-Linked Story Bible & Timeline</h3>
              <p>
                Characters, places, organizations, and motifs are recognized automatically in your chapters by name and alias. Edit any entity card or manage period tables on a vertical timeline.
              </p>
              <button
                type="button"
                className="link-btn"
                onClick={() => navigatePublic("/docs/story-bible")}
              >
                Explore Story Bible →
              </button>
            </div>

            <div className="mkt-feature-card">
              <div className="mkt-feature-icon">
                <Icon name="grid" size={20} />
              </div>
              <h3>Scene Boards & Safe Chapter Reordering</h3>
              <p>
                Plan beats on chapter Scene Boards. Reorder chapters with automatic renumbering of files, YAML front matter, headings, and every <code>*Ch. N*</code> anchor across your bible.
              </p>
              <button
                type="button"
                className="link-btn"
                onClick={() => navigatePublic("/docs/planning-and-scenes")}
              >
                Explore Planning & Scenes →
              </button>
            </div>

            <div className="mkt-feature-card">
              <div className="mkt-feature-icon">
                <Icon name="users" size={20} />
              </div>
              <h3>Role-Based Collaboration & Suggestions</h3>
              <p>
                Invite co-authors, editors, and beta readers with 6-digit passwordless sign-in codes. Editors write tracked <code>&lt;ins&gt;</code>/<code>&lt;del&gt;</code> suggestions; owners accept or reject.
              </p>
              <button
                type="button"
                className="link-btn"
                onClick={() => navigatePublic("/docs/collaboration")}
              >
                Explore Collaboration →
              </button>
            </div>

            <div className="mkt-feature-card">
              <div className="mkt-feature-icon">
                <Icon name="download" size={20} />
              </div>
              <h3>Lossless Plain Files & Streaming ZIP</h3>
              <p>
                Zero lock-in. Untouched Markdown blocks save back byte-for-byte. Export or import complete Bookkit <code>.zip</code> repositories preserving exact paths, checksums, and permissions.
              </p>
              <button
                type="button"
                className="link-btn"
                onClick={() => navigatePublic("/docs/file-format-and-cli")}
              >
                Explore Format & CLI →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* The Bookkit Standard & Plain-File Architecture */}
      <section id="standard" className="mkt-section mkt-section-alt">
        <div className="mkt-container">
          <div className="mkt-split">
            <div className="mkt-split-text">
              <div className="ws-date">Open Standard · Zero Lock-In</div>
              <h2>A calm visual studio on top. Pure Markdown &amp; <code>book.yaml</code> underneath.</h2>
              <p>
                Most writing apps force an impossible choice: use a friendly cloud editor that traps your novel in a proprietary database, or wrestle with raw folders and Git in a code editor.
              </p>
              <p>
                Bookkit gives you both. The Studio never shows a file path in the UI—yet every edit writes cleanly to a standard Bookkit repository that works identically in the browser and in the <code>bookkit</code> command-line toolkit.
              </p>
              <ul className="mkt-check-list">
                <li>
                  <Icon name="check" size={15} />
                  <span>
                    <strong>Byte-for-byte Markdown fidelity</strong> — verified across 1,229 real book files and 606 non-research documents.
                  </span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>
                    <strong>12 literary forms built in</strong> — Novel, Short novel, Novella, Short story, Collection, Nonfiction, Memoir, Devotional, Monograph, Essays, and more.
                  </span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>
                    <strong>Full-book snapshots</strong> — capture and compare text revisions and binary assets in milliseconds.
                  </span>
                </li>
              </ul>
              <div className="mkt-split-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigatePublic("/docs/book-yaml")}
                >
                  Read the book.yaml Reference
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => navigatePublic("/docs/file-format-and-cli")}
                >
                  Repository Structure Guide
                </button>
              </div>
            </div>

            <div className="mkt-split-code">
              <div className="docs-codeblock">
                <div className="docs-codeblock-head">
                  <span className="docs-codeblock-file">book.yaml</span>
                  <span className="docs-codeblock-lang">yaml</span>
                </div>
                <pre className="docs-pre">
                  <code>{`slug: the-owl-at-dusk
title: The Owl at Dusk
author: Peter S. Dubois
kind: fiction
form: novel
ai_policy: human-authored

style:
  inherit: shelf
  spelling: american
  serial_comma: true
  quotes: double
  dashes: em-closed
  manual: chicago

manuscript:
  dir: manuscript
  draft: draft
  layout: flat
  target_words: 80000
  chapter_words: 3500

publication:
  formats: [docx, epub, pdf]
  title_page: true`}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Principled Human-Authored AI Policy Section */}
      <section id="ai-policy" className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <div className="ws-date">Human Authorship First</div>
            <h2>AI that respects the author’s authority over every sentence</h2>
            <p>
              In Bookkit, a model never writes into <code>manuscript/</code>. Every book declares an explicit{" "}
              <code>ai_policy</code> in <code>book.yaml</code>, grounded in published trade standards and enforced at the server boundary.
            </p>
          </div>

          <div className="mkt-policy-grid">
            <div className="mkt-policy-card highlighted">
              <div className="mkt-policy-badge">Default Standard</div>
              <h3>human-authored</h3>
              <p className="mkt-policy-sub">
                Every word of the manuscript is the author’s; no model writes into it.
              </p>
              <p>
                Stricter than the <strong>Authors Guild Human Authored</strong> certification mark. Models may read the manuscript to report continuity questions, check canon, or draft labeled companion notes in <code>bible/</code> and <code>outline/</code>—never a single sentence of prose.
              </p>
            </div>

            <div className="mkt-policy-card">
              <div className="mkt-policy-badge subtle">Origin Test</div>
              <h3>ai-assisted</h3>
              <p className="mkt-policy-sub">
                The author writes the prose; a model may edit and refine it, never originate it.
              </p>
              <p>
                Aligned with <strong>Amazon KDP’s</strong> “AI-assisted” definition and <strong>Hachette Book Group’s</strong> operational guidance. Sentences must originate with a human author; anything that would add new prose goes to <code>outline/open-questions.md</code>.
              </p>
            </div>

            <div className="mkt-policy-card">
              <div className="mkt-policy-badge subtle">Explicit Disclosure</div>
              <h3>ai-generated</h3>
              <p className="mkt-policy-sub">
                For reference drafts or declared machine-drafted projects.
              </p>
              <p>
                Used for read-only reference drafts (<code>draft_policy: ai-generated</code>) kept separate from the human manuscript, or projects that explicitly declare AI generation at publication upload.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Free Subscription / Pricing Section */}
      <section id="pricing" className="mkt-section mkt-section-alt">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <div className="ws-date">Free Subscription · Early Access</div>
            <h2>Free to use right now. Create your Library and shelves today.</h2>
            <p>
              During our Founding Author period, every Bookkit subscription is <strong>$0 / month</strong>. Later we will charge for cloud hosting and team tiers—while your plain-file books and exports always remain 100% yours.
            </p>
          </div>

          <div className="mkt-pricing-grid">
            {/* Tier 1: Founding Author (Active Free Subscription) */}
            <div className="mkt-price-card featured">
              <div className="mkt-price-ribbon">Free Right Now · Early Access</div>
              <div className="mkt-price-head">
                <h3>Founding Author</h3>
                <p>Your personal Library, custom shelves, and the complete Bookkit Studio.</p>
                <div className="mkt-price-amount">
                  <strong>$0</strong>
                  <span>/ month right now</span>
                </div>
                <div className="mkt-price-later">
                  Free during Early Access · No credit card required
                </div>
              </div>
              <ul className="mkt-price-features">
                <li>
                  <Icon name="check" size={15} />
                  <span>
                    Your own Library subdomain (<code>&lt;you&gt;.bookkit.net</code>)
                  </span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Unlimited Shelves with custom House Styles</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Unlimited Books, Chapters, Scene Cards &amp; Story Bibles</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Invite Co-authors, Editors &amp; Beta Readers</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Story-Bible-aware Whisper Dictation &amp; Aura-2 Read-Aloud</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Included Editorial AI Reviews + Bring Your Own Key</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Full-Book Snapshots &amp; Lossless Bookkit ZIP Export</span>
                </li>
              </ul>
              <button
                type="button"
                className="btn btn-primary mkt-price-cta"
                onClick={() => navigatePublic("/signup?plan=founding")}
              >
                Sign Up Free &amp; Create Your Library <Icon name="chevron" size={14} />
              </button>
            </div>

            {/* Tier 2: Author Studio (Future Paid Tier, Free Now) */}
            <div className="mkt-price-card">
              <div className="mkt-price-head">
                <div className="mkt-price-tag-row">
                  <h3>Author Studio</h3>
                  <span className="pill">Free during Early Access</span>
                </div>
                <p>For prolific novelists and researchers with multi-gigabyte archives.</p>
                <div className="mkt-price-amount">
                  <strong>$0</strong>
                  <span>/ month now <s className="muted">($12/mo later)</s></span>
                </div>
                <div className="mkt-price-later">
                  Included free in your Founding Author subscription right now
                </div>
              </div>
              <ul className="mkt-price-features">
                <li>
                  <Icon name="check" size={15} />
                  <span>Everything in Founding Author</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Multiple Libraries (e.g. separate pen names or series)</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Large archival asset storage (PDFs, high-res maps, audio)</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Extended 180k-character editorial review context windows</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Priority Aura-2 chapter audio synthesis &amp; MP3 download</span>
                </li>
              </ul>
              <button
                type="button"
                className="btn mkt-price-cta"
                onClick={() => navigatePublic("/signup?plan=studio")}
              >
                Start Free Subscription →
              </button>
            </div>

            {/* Tier 3: Imprint & Press (Future Paid Tier, Free Now) */}
            <div className="mkt-price-card">
              <div className="mkt-price-head">
                <div className="mkt-price-tag-row">
                  <h3>Imprint &amp; Press</h3>
                  <span className="pill">Free during Early Access</span>
                </div>
                <p>For small presses, literary agencies, and collaborative editorial houses.</p>
                <div className="mkt-price-amount">
                  <strong>$0</strong>
                  <span>/ month now <s className="muted">($39/mo later)</s></span>
                </div>
                <div className="mkt-price-later">
                  Included free in your Founding Author subscription right now
                </div>
              </div>
              <ul className="mkt-price-features">
                <li>
                  <Icon name="check" size={15} />
                  <span>Everything in Author Studio</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Set up pending author libraries claimed on first sign-in</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Imprint-wide House Style &amp; shared Vale prose lint rules</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Unlimited Editor, Co-author &amp; Reader seats</span>
                </li>
                <li>
                  <Icon name="check" size={15} />
                  <span>Streaming multi-gigabyte Bookkit repository backups</span>
                </li>
              </ul>
              <button
                type="button"
                className="btn mkt-price-cta"
                onClick={() => navigatePublic("/signup?plan=imprint")}
              >
                Start Free Subscription →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="mkt-section">
        <div className="mkt-container mkt-narrow">
          <div className="mkt-section-head">
            <div className="ws-date">Questions &amp; Answers</div>
            <h2>Frequently Asked Questions</h2>
          </div>

          <div className="mkt-faq-list">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className={`mkt-faq-item ${isOpen ? "open" : ""}`}>
                  <button
                    type="button"
                    className="mkt-faq-q"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                  >
                    <span>{item.q}</span>
                    <Icon name={isOpen ? "down" : "chevron"} size={15} />
                  </button>
                  {isOpen && <p className="mkt-faq-a">{item.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="mkt-cta-banner">
        <div className="mkt-container">
          <div className="mkt-cta-card">
            <h2>Your books deserve a quiet, permanent home.</h2>
            <p>
              Sign up for your free subscription, create your Library and shelves, and begin your next chapter in seconds.
            </p>
            <div className="mkt-cta-buttons">
              <button
                type="button"
                className="btn btn-primary mkt-claim-btn"
                onClick={() => navigatePublic("/signup")}
              >
                Create Your Free Library &amp; Shelves
              </button>
              <button
                type="button"
                className="btn mkt-claim-btn"
                onClick={() => navigatePublic("/docs")}
              >
                Browse Documentation
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mkt-footer">
        <div className="mkt-container mkt-footer-inner">
          <div className="mkt-footer-brand">
            <div className="brand">
              <span className="brand-mark">b</span>
              <span className="brand-name">bookkit</span>
            </div>
            <p className="muted">
              A calm, document-first book-writing studio backed by lossless plain Markdown and <code>book.yaml</code>.
            </p>
          </div>

          <div className="mkt-footer-cols">
            <div>
              <strong>Product</strong>
              <a href="#studio" onClick={(e) => { e.preventDefault(); scrollToSection("studio"); }}>Studio Tour</a>
              <a href="#features" onClick={(e) => { e.preventDefault(); scrollToSection("features"); }}>Features</a>
              <a href="#pricing" onClick={(e) => { e.preventDefault(); scrollToSection("pricing"); }}>Free Subscription</a>
              <a href="/signup" onClick={(e) => { e.preventDefault(); navigatePublic("/signup"); }}>Create a Library</a>
              <a href="/login" onClick={(e) => { e.preventDefault(); navigatePublic("/login"); }}>Sign in</a>
            </div>
            <div>
              <strong>Documentation</strong>
              <a href="/docs/introduction" onClick={(e) => { e.preventDefault(); navigatePublic("/docs/introduction"); }}>Introduction</a>
              <a href="/docs/quickstart" onClick={(e) => { e.preventDefault(); navigatePublic("/docs/quickstart"); }}>Quickstart Guide</a>
              <a href="/docs/libraries-and-shelves" onClick={(e) => { e.preventDefault(); navigatePublic("/docs/libraries-and-shelves"); }}>Libraries &amp; Shelves</a>
              <a href="/docs/manuscript-editor" onClick={(e) => { e.preventDefault(); navigatePublic("/docs/manuscript-editor"); }}>Manuscript Editor</a>
              <a href="/docs/story-bible" onClick={(e) => { e.preventDefault(); navigatePublic("/docs/story-bible"); }}>Story Bible</a>
            </div>
            <div>
              <strong>Standard &amp; Policies</strong>
              <a href="/docs/book-yaml" onClick={(e) => { e.preventDefault(); navigatePublic("/docs/book-yaml"); }}>book.yaml Reference</a>
              <a href="/docs/house-style" onClick={(e) => { e.preventDefault(); navigatePublic("/docs/house-style"); }}>House Style Rules</a>
              <a href="/docs/ai-policies" onClick={(e) => { e.preventDefault(); navigatePublic("/docs/ai-policies"); }}>AI Policies &amp; Human Authored</a>
              <a href="/docs/voice-and-audio" onClick={(e) => { e.preventDefault(); navigatePublic("/docs/voice-and-audio"); }}>Voice &amp; Read-Aloud</a>
              <a href="/docs/file-format-and-cli" onClick={(e) => { e.preventDefault(); navigatePublic("/docs/file-format-and-cli"); }}>ZIP Export &amp; CLI</a>
            </div>
          </div>
        </div>
        <div className="mkt-container mkt-footer-bottom">
          <span className="muted">© {new Date().getFullYear()} Bookkit (bookkit.net). Write your book.</span>
        </div>
      </footer>
    </div>
  );
}
