import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DOC_CATEGORIES,
  getAdjacentDocPages,
  getDocPage,
  searchDocs,
  type AdmonitionKind,
  type DocBlock,
} from "../../lib/docs-content";
import { navigatePublic } from "../../lib/public-routes";
import { useAuthStore } from "../../store/useAuthStore";
import { Icon } from "../studio/common";
import { useTheme } from "../studio/Studio";

/** Render inline markdown-like tokens: **bold**, `code`, and *italic*. */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={idx} className="docs-inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function CodeBlock({ lang, filename, code }: { lang: string; filename?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="docs-codeblock">
      <div className="docs-codeblock-head">
        <span className="docs-codeblock-file">{filename || lang}</span>
        <div className="docs-codeblock-actions">
          <span className="docs-codeblock-lang">{lang}</span>
          <button type="button" className="docs-copy-btn" onClick={copy}>
            {copied ? <><Icon name="check" size={13} /> Copied</> : "Copy"}
          </button>
        </div>
      </div>
      <pre className="docs-pre"><code>{code}</code></pre>
    </div>
  );
}

const ADMONITION_LABELS: Record<AdmonitionKind, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

function Admonition({ kind, title, text }: { kind: AdmonitionKind; title: string; text: string }) {
  return (
    <aside className={`docs-callout docs-callout-${kind}`} role="note">
      <div className="docs-callout-head">
        <span className="docs-callout-badge">{ADMONITION_LABELS[kind]}</span>
        <strong>{title}</strong>
      </div>
      <p className="docs-callout-body">{renderInline(text)}</p>
    </aside>
  );
}

export function DocsSite({ slug }: { slug: string }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [theme, setTheme] = useTheme();
  const page = useMemo(() => getDocPage(slug), [slug]);
  const { prev, next } = useMemo(() => getAdjacentDocPages(page.slug), [page.slug]);

  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [activeHeading, setActiveHeading] = useState<string>("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const headings = useMemo(
    () =>
      page.blocks.filter(
        (b): b is Extract<DocBlock, { type: "h2" | "h3" }> => b.type === "h2" || b.type === "h3"
      ),
    [page]
  );

  const searchResults = useMemo(() => searchDocs(searchQuery), [searchQuery]);

  useEffect(() => {
    document.title = `${page.title} · Bookkit Docs`;
    setMobileMenuOpen(false);
    if (scrollRef.current) {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
          setActiveHeading(hash);
          return;
        }
      }
      scrollRef.current.scrollTo({ top: 0 });
    }
    setActiveHeading(headings[0]?.id ?? "");
  }, [page.slug, page.title, headings]);

  // Keyboard shortcut Cmd+K / Ctrl+K for docs search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setSearchQuery("");
      setSearchIndex(0);
    }
  }, [searchOpen]);

  const goDoc = (targetSlug: string, sectionId?: string) => {
    const url = `/docs/${targetSlug}${sectionId ? `#${sectionId}` : ""}`;
    navigatePublic(url);
    if (sectionId && targetSlug === page.slug) {
      const el = document.getElementById(sectionId);
      el?.scrollIntoView({ behavior: "smooth" });
      setActiveHeading(sectionId);
    }
  };

  return (
    <div className="docs-shell" ref={scrollRef}>
      {/* Top Navbar */}
      <header className="mkt-topbar docs-topbar">
        <div className="mkt-topbar-inner">
          <div className="mkt-topbar-left">
            <button
              type="button"
              className="icon-btn docs-mobile-toggle"
              aria-label="Toggle documentation menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <Icon name="sidebar" size={18} />
            </button>
            <a
              href="/"
              className="brand mkt-brand"
              onClick={(e) => {
                e.preventDefault();
                navigatePublic("/marketing");
              }}
            >
              <span className="brand-mark">b</span>
              <span className="brand-name">bookkit</span>
            </a>
            <span className="docs-badge">Docs</span>
            <nav className="mkt-nav-links" aria-label="Primary navigation">
              <a
                href="/marketing"
                onClick={(e) => {
                  e.preventDefault();
                  navigatePublic("/marketing");
                }}
              >
                Overview
              </a>
              <a
                href="/features"
                onClick={(e) => {
                  e.preventDefault();
                  navigatePublic("/features");
                }}
              >
                Features
              </a>
              <a
                href="/docs"
                className="active"
                onClick={(e) => {
                  e.preventDefault();
                  goDoc("introduction");
                }}
              >
                Documentation
              </a>
              <a
                href="/pricing"
                onClick={(e) => {
                  e.preventDefault();
                  navigatePublic("/pricing");
                }}
              >
                Pricing <span className="mkt-free-pill">Free</span>
              </a>
            </nav>
          </div>

          <div className="mkt-topbar-right">
            <button
              type="button"
              className="search-trigger docs-search-btn"
              onClick={() => setSearchOpen(true)}
              aria-label="Search documentation"
            >
              <Icon name="search" size={14} />
              <span>Search docs…</span>
              <kbd>⌘K</kbd>
            </button>
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
                Open Workspace
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

      {/* 3-Column Docusaurus Layout */}
      <div className="docs-layout">
        {/* Left Sidebar */}
        <aside className={`docs-sidebar ${mobileMenuOpen ? "open" : ""}`} aria-label="Documentation sidebar">
          <div className="docs-sidebar-inner">
            {DOC_CATEGORIES.map((cat) => {
              const isCollapsed = !!collapsedCats[cat.id];
              return (
                <div key={cat.id} className={`docs-cat ${isCollapsed ? "collapsed" : "open"}`}>
                  <button
                    type="button"
                    className="docs-cat-head"
                    onClick={() => setCollapsedCats((c) => ({ ...c, [cat.id]: !c[cat.id] }))}
                    aria-expanded={!isCollapsed}
                  >
                    <span>{cat.label}</span>
                    <Icon name="chevron" size={13} />
                  </button>
                  {!isCollapsed && (
                    <ul className="docs-cat-list">
                      {cat.pages.map((p) => (
                        <li key={p.slug}>
                          <a
                            href={`/docs/${p.slug}`}
                            className={`docs-sidebar-link ${p.slug === page.slug ? "active" : ""}`}
                            onClick={(e) => {
                              e.preventDefault();
                              goDoc(p.slug);
                            }}
                          >
                            {p.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center Article */}
        <main className="docs-main">
          <article className="docs-article">
            <nav className="docs-breadcrumbs" aria-label="Breadcrumb">
              <button type="button" className="docs-crumb-link" onClick={() => goDoc("introduction")}>
                Docs
              </button>
              <Icon name="chevron" size={12} />
              <span className="docs-crumb-cat">{page.category}</span>
              <Icon name="chevron" size={12} />
              <span className="docs-crumb-current">{page.title}</span>
            </nav>

            <header className="docs-article-head">
              <div className="docs-article-meta">
                <span className="pill">{page.category}</span>
                <span className="muted">{page.readingMinutes} min read</span>
              </div>
              <h1 className="docs-title">{page.title}</h1>
              <p className="docs-lead">{page.summary}</p>
            </header>

            <div className="docs-prose">
              {page.blocks.map((block, i) => {
                switch (block.type) {
                  case "p":
                    return <p key={i} className="docs-p">{renderInline(block.text)}</p>;
                  case "h2":
                    return (
                      <h2 key={i} id={block.id} className="docs-h2">
                        <a
                          href={`#${block.id}`}
                          className="docs-heading-anchor"
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveHeading(block.id);
                            document.getElementById(block.id)?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          {block.text}
                          <span className="docs-anchor-hash" aria-hidden>#</span>
                        </a>
                      </h2>
                    );
                  case "h3":
                    return (
                      <h3 key={i} id={block.id} className="docs-h3">
                        <a
                          href={`#${block.id}`}
                          className="docs-heading-anchor"
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveHeading(block.id);
                            document.getElementById(block.id)?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          {block.text}
                          <span className="docs-anchor-hash" aria-hidden>#</span>
                        </a>
                      </h3>
                    );
                  case "callout":
                    return <Admonition key={i} kind={block.kind} title={block.title} text={block.text} />;
                  case "code":
                    return <CodeBlock key={i} lang={block.lang} filename={block.filename} code={block.code} />;
                  case "list": {
                    const Tag = block.ordered ? "ol" : "ul";
                    return (
                      <Tag key={i} className={`docs-list ${block.ordered ? "ordered" : ""}`}>
                        {block.items.map((item, j) => (
                          <li key={j}>
                            {item.title && <strong className="docs-list-title">{item.title} — </strong>}
                            <span>{renderInline(item.text)}</span>
                          </li>
                        ))}
                      </Tag>
                    );
                  }
                  case "table":
                    return (
                      <div key={i} className="docs-table-wrap">
                        <table className="docs-table">
                          <thead>
                            <tr>
                              {block.headers.map((h, j) => (
                                <th key={j}>{renderInline(h)}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.rows.map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx}>{renderInline(cell)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  case "cards":
                    return (
                      <div key={i} className="docs-card-grid">
                        {block.items.map((card, cIdx) => (
                          <button
                            key={cIdx}
                            type="button"
                            className="docs-feature-card"
                            onClick={() => card.linkSlug && goDoc(card.linkSlug)}
                          >
                            {card.badge && <span className="docs-card-badge">{card.badge}</span>}
                            <strong className="docs-card-title">{card.title}</strong>
                            <span className="docs-card-text">{renderInline(card.text)}</span>
                            {card.linkSlug && (
                              <span className="docs-card-more">
                                Read guide <Icon name="chevron" size={12} />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                }
              })}
            </div>

            {/* Docusaurus-style Prev / Next Page Navigation */}
            <nav className="docs-pager" aria-label="Documentation pages navigation">
              {prev ? (
                <a
                  href={`/docs/${prev.slug}`}
                  className="docs-pager-card prev"
                  onClick={(e) => {
                    e.preventDefault();
                    goDoc(prev.slug);
                  }}
                >
                  <span className="docs-pager-label">
                    <Icon name="back" size={13} /> Previous
                  </span>
                  <strong className="docs-pager-title">{prev.title}</strong>
                  <span className="docs-pager-cat">{prev.category}</span>
                </a>
              ) : <div />}
              {next ? (
                <a
                  href={`/docs/${next.slug}`}
                  className="docs-pager-card next"
                  onClick={(e) => {
                    e.preventDefault();
                    goDoc(next.slug);
                  }}
                >
                  <span className="docs-pager-label">
                    Next <Icon name="chevron" size={13} />
                  </span>
                  <strong className="docs-pager-title">{next.title}</strong>
                  <span className="docs-pager-cat">{next.category}</span>
                </a>
              ) : <div />}
            </nav>
          </article>
        </main>

        {/* Right Table of Contents ("On this page") */}
        <aside className="docs-toc" aria-label="On this page">
          <div className="docs-toc-inner">
            {headings.length > 0 && (
              <>
                <div className="docs-toc-title">On this page</div>
                <ul className="docs-toc-list">
                  {headings.map((h) => (
                    <li key={h.id} className={h.type === "h3" ? "sub" : ""}>
                      <a
                        href={`#${h.id}`}
                        className={activeHeading === h.id ? "active" : ""}
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveHeading(h.id);
                          document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="docs-toc-cta">
              <div className="docs-toc-cta-badge">Free Early Access</div>
              <strong>Claim your Library on bookkit.net</strong>
              <p>
                Create your own <code>.bookkit.net</code> address, set up shelves with custom house styles, and start writing for free.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => navigatePublic("/signup")}
              >
                {isAuthenticated ? "Create a Library" : "Sign up free"}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Instant Search Modal (⌘K) */}
      {searchOpen && (
        <div
          className="dialog-backdrop docs-search-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false);
          }}
        >
          <div className="docs-search-modal" role="dialog" aria-label="Search documentation">
            <div className="docs-search-input-row">
              <Icon name="search" size={16} />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSearchIndex((i) => Math.min(searchResults.length - 1, i + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSearchIndex((i) => Math.max(0, i - 1));
                  } else if (e.key === "Enter" && searchResults[searchIndex]) {
                    e.preventDefault();
                    const hit = searchResults[searchIndex];
                    setSearchOpen(false);
                    goDoc(hit.slug, hit.sectionId);
                  }
                }}
                placeholder="Search Bookkit documentation (e.g. shelves, book.yaml, dictation, human-authored)…"
                aria-label="Search documentation"
              />
              <kbd>Esc</kbd>
            </div>
            <div className="docs-search-results">
              {!searchQuery.trim() ? (
                <div className="docs-search-suggestions">
                  <div className="menu-label">Popular guides</div>
                  {["quickstart", "libraries-and-shelves", "manuscript-editor", "ai-policies", "book-yaml"].map((s) => {
                    const p = getDocPage(s);
                    return (
                      <button
                        key={p.slug}
                        type="button"
                        className="docs-search-hit"
                        onClick={() => {
                          setSearchOpen(false);
                          goDoc(p.slug);
                        }}
                      >
                        <div className="docs-search-hit-top">
                          <span className="pill">{p.category}</span>
                          <strong>{p.title}</strong>
                        </div>
                        <span className="docs-search-hit-snippet">{p.summary}</span>
                      </button>
                    );
                  })}
                </div>
              ) : searchResults.length === 0 ? (
                <div className="docs-search-empty">No documentation matches “{searchQuery}”.</div>
              ) : (
                searchResults.map((hit, idx) => (
                  <button
                    key={`${hit.slug}-${hit.sectionId ?? idx}`}
                    type="button"
                    className={`docs-search-hit ${idx === searchIndex ? "selected" : ""}`}
                    onMouseEnter={() => setSearchIndex(idx)}
                    onClick={() => {
                      setSearchOpen(false);
                      goDoc(hit.slug, hit.sectionId);
                    }}
                  >
                    <div className="docs-search-hit-top">
                      <span className="pill">{hit.category}</span>
                      <strong>
                        {hit.pageTitle}
                        {hit.sectionTitle ? ` › ${hit.sectionTitle}` : ""}
                      </strong>
                    </div>
                    <span className="docs-search-hit-snippet">{hit.snippet}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
