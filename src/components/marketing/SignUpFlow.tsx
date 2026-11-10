import { useState } from "react";
import { BOOK_FORMS, type BookForm, type HouseStyle } from "../../lib/book-config";
import { navigatePublic } from "../../lib/public-routes";
import {
  createBook,
  createLibraryWithShelves,
  registerFreeSubscriptionAccount,
  validateLibrarySlug,
} from "../../lib/supabase-service";
import { useAuthStore } from "../../store/useAuthStore";
import { writePrefs } from "../../store/useBookStore";
import { useHomeStore } from "../../store/useHomeStore";
import { useLibraryStore } from "../../store/useLibraryStore";
import { useProjectStore } from "../../store/useProjectStore";
import { Icon } from "../studio/common";
import { useTheme } from "../studio/Studio";

export type StylePresetId = "chicago" | "new-oxford" | "oxford-ize" | "ap" | "none";

export const HOUSE_STYLE_PRESETS: Record<
  StylePresetId,
  { label: string; summary: string; style: HouseStyle }
> = {
  chicago: {
    label: "American · Chicago",
    summary: "American spelling, serial comma, “double quotes,” closed em—dash",
    style: {
      spelling: "american",
      serial_comma: true,
      quotes: "double",
      punctuation_in_quotes: "american",
      dashes: "em-closed",
      ellipsis: "character",
      numbers: "words-to-hundred",
      manual: "chicago",
    },
  },
  "new-oxford": {
    label: "British · New Oxford",
    summary: "British (-ise), no serial comma, ‘single quotes’, spaced en – dash",
    style: {
      spelling: "british",
      serial_comma: false,
      quotes: "single",
      punctuation_in_quotes: "logical",
      dashes: "en-spaced",
      ellipsis: "character",
      numbers: "words-to-hundred",
      manual: "new-oxford",
    },
  },
  "oxford-ize": {
    label: "Oxford (-ize)",
    summary: "British colour/realize, serial comma, ‘single quotes’, spaced en – dash",
    style: {
      spelling: "oxford",
      serial_comma: true,
      quotes: "single",
      punctuation_in_quotes: "logical",
      dashes: "en-spaced",
      ellipsis: "character",
      numbers: "words-to-hundred",
      manual: "new-oxford",
    },
  },
  ap: {
    label: "American · AP",
    summary: "American spelling, no serial comma, “double quotes,” numerals 10+",
    style: {
      spelling: "american",
      serial_comma: false,
      quotes: "double",
      punctuation_in_quotes: "american",
      dashes: "em-closed",
      ellipsis: "dots",
      numbers: "words-to-ten",
      manual: "ap",
    },
  },
  none: {
    label: "Per-book style",
    summary: "Each book on this shelf chooses its own house style",
    style: {},
  },
};

const QUICK_SHELVES = [
  "Fiction",
  "Nonfiction",
  "Short Stories",
  "Essays",
  "Poetry",
  "Memoir",
  "Series",
  "Translations",
];

interface DraftShelf {
  id: string;
  name: string;
  preset: StylePresetId;
}

function slugifyLibraryName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]s\b/g, "")
    .replace(/\blibrary\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function SignUpFlow({ initialSlug }: { initialSlug?: string }) {
  const { isAuthenticated, userEmail } = useAuthStore();
  const [theme, setTheme] = useTheme();

  // Step 1: Account & Free Subscription
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2: Library Details
  const [libraryName, setLibraryName] = useState("");
  const [libraryNameTouched, setLibraryNameTouched] = useState(false);
  const [slug, setSlug] = useState(initialSlug ? slugifyLibraryName(initialSlug) : "");
  const [slugTouched, setSlugTouched] = useState(!!initialSlug);
  const [description, setDescription] = useState("Novels, essays, and works in progress.");

  // Step 3: Shelves & Optional First Book
  const [shelves, setShelves] = useState<DraftShelf[]>([
    { id: "s-1", name: "Fiction", preset: "chicago" },
    { id: "s-2", name: "Nonfiction", preset: "chicago" },
  ]);
  const [newShelfName, setNewShelfName] = useState("");
  const [newShelfPreset, setNewShelfPreset] = useState<StylePresetId>("chicago");

  const [createFirstBook, setCreateFirstBook] = useState(false);
  const [firstBookTitle, setFirstBookTitle] = useState("");
  const [firstBookForm, setFirstBookForm] = useState<BookForm>("novel");
  const [firstBookShelfIndex, setFirstBookShelfIndex] = useState(0);

  // Submission state
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [error, setError] = useState("");

  const suggestedLibraryName = displayName.trim()
    ? `${displayName.trim().split(" ")[0]}’s Library`
    : "";
  const effectiveLibraryName = libraryNameTouched ? libraryName : suggestedLibraryName || libraryName;
  const autoSlug = slugifyLibraryName(effectiveLibraryName || displayName);
  const effectiveSlug = slugTouched ? slug : autoSlug;
  const slugError = effectiveSlug ? validateLibrarySlug(effectiveSlug) : null;

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const validPassword = password.length >= 10;
  const validAccount = isAuthenticated || (displayName.trim().length > 0 && validEmail && validPassword);
  const validLibrary = effectiveLibraryName.trim().length > 0 && !validateLibrarySlug(effectiveSlug);
  const validShelves = shelves.some((s) => s.name.trim().length > 0);

  const addDraftShelf = (name: string, preset: StylePresetId = newShelfPreset) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (shelves.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return;
    setShelves((prev) => [
      ...prev,
      { id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: trimmed, preset },
    ]);
  };

  const removeDraftShelf = (id: string) => {
    setShelves((prev) => prev.filter((s) => s.id !== id));
  };

  const moveDraftShelf = (idx: number, delta: number) => {
    setShelves((prev) => {
      const next = [...prev];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validAccount) {
      setError("Complete your name, email address, and a password of at least 10 characters.");
      return;
    }
    const libSlugErr = validateLibrarySlug(effectiveSlug);
    if (!effectiveLibraryName.trim() || libSlugErr) {
      setError(libSlugErr ?? "Enter a name and valid address for your library.");
      return;
    }
    const activeShelves = shelves.filter((s) => s.name.trim().length > 0);
    if (activeShelves.length === 0) {
      setError("Add at least one shelf for your library (for example, Fiction or Nonfiction).");
      return;
    }

    try {
      const authorLabel =
        displayName.trim() ||
        (userEmail ? userEmail.split("@")[0].replace(/[._-]+/g, " ") : "Author");

      if (!useAuthStore.getState().isAuthenticated) {
        setBusyStep("Activating your free Founding Author subscription…");
        await registerFreeSubscriptionAccount(email, password, displayName);
        await useAuthStore.getState().signIn(email, password, true);
        writePrefs({ authorName: authorLabel });
      }

      setBusyStep(`Creating ${effectiveSlug}.bookkit.net & shelves…`);
      const { libraryId, shelfIds } = await createLibraryWithShelves(
        effectiveLibraryName.trim(),
        effectiveSlug,
        description.trim(),
        activeShelves.map((s) => ({
          name: s.name.trim(),
          style: HOUSE_STYLE_PRESETS[s.preset].style as Record<string, unknown>,
        }))
      );

      if (createFirstBook && firstBookTitle.trim()) {
        setBusyStep(`Scaffolding “${firstBookTitle.trim()}”…`);
        const targetShelfId = shelfIds[Math.min(firstBookShelfIndex, shelfIds.length - 1)] ?? shelfIds[0] ?? null;
        await createBook(firstBookTitle.trim(), authorLabel, {
          libraryId,
          shelfId: targetShelfId,
          form: firstBookForm,
        });
      }

      setBusyStep("Opening your Library…");
      await Promise.all([
        useLibraryStore.getState().load(),
        useProjectStore.getState().loadFromStorage(),
      ]);
      useHomeStore.getState().setHome(true);
      useLibraryStore.getState().selectLibrary(effectiveSlug);
      navigatePublic(`/?library=${encodeURIComponent(effectiveSlug)}`);
    } catch (err) {
      setError((err as Error).message || "Could not complete setup. Please try again.");
      setBusyStep(null);
    }
  };

  return (
    <div className="signup-shell">
      {/* Top Bar */}
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
                onClick={(e) => {
                  e.preventDefault();
                  navigatePublic("/docs");
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
              className="icon-btn"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
            </button>
            {isAuthenticated ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => navigatePublic("/")}
              >
                Back to Workspace
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => navigatePublic("/login")}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="signup-main">
        <div className="signup-grid">
          {/* Left Column: 3-Step Onboarding Form */}
          <form className="signup-form-col" onSubmit={handleSubmit}>
            <div className="signup-header">
              <div className="signup-eyebrow">
                <span className="mkt-badge-dot" />
                Founding Author Subscription · $0 / month
              </div>
              <h1>Create your Library & shelves</h1>
              <p>
                Bookkit is <strong>free to use right now</strong> during Early Access. Set up your account, claim your{" "}
                <code>.bookkit.net</code> library address, and organize your shelves in one step.
              </p>
            </div>

            {/* STEP 1: Account & Free Subscription */}
            <section className="signup-step-card">
              <div className="signup-step-head">
                <span className={`signup-step-num ${validAccount ? "done" : ""}`}>
                  {validAccount ? <Icon name="check" size={13} /> : "1"}
                </span>
                <div>
                  <h2>Your Free Subscription & Account</h2>
                  <p className="muted">No credit card required. Full plain-file export is always yours.</p>
                </div>
                <span className="signup-price-tag">$0 / mo</span>
              </div>

              {isAuthenticated ? (
                <div className="signup-signed-in-banner">
                  <Icon name="check" size={16} />
                  <div>
                    <strong>Signed in as {userEmail}</strong>
                    <span>Your Founding Author Free Subscription is active. Set up your new library below.</span>
                  </div>
                </div>
              ) : (
                <div className="signup-fields">
                  <label className="field">
                    <span>Your name (or pen name)</span>
                    <input
                      type="text"
                      name="name"
                      autoComplete="name"
                      placeholder="Elena Rostova"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  </label>
                  <div className="signup-field-row">
                    <label className="field">
                      <span>Email address</span>
                      <input
                        type="email"
                        name="email"
                        autoComplete="email"
                        placeholder="elena@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Password (10+ characters)</span>
                      <input
                        type="password"
                        name="new-password"
                        autoComplete="new-password"
                        placeholder="At least 10 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={10}
                        required
                      />
                    </label>
                  </div>
                  {password.length > 0 && password.length < 10 && (
                    <div className="field-hint warn">
                      Use at least 10 characters ({10 - password.length} more needed).
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* STEP 2: Library Name & Subdomain */}
            <section className="signup-step-card">
              <div className="signup-step-head">
                <span className={`signup-step-num ${validLibrary ? "done" : ""}`}>
                  {validLibrary ? <Icon name="check" size={13} /> : "2"}
                </span>
                <div>
                  <h2>Your Library & Web Address</h2>
                  <p className="muted">
                    Every library gets its own subdomain on <code>bookkit.net</code> where your books and collaborators live.
                  </p>
                </div>
              </div>

              <div className="signup-fields">
                <div className="signup-field-row">
                  <label className="field">
                    <span>Library name</span>
                    <input
                      type="text"
                      placeholder="Elena’s Library"
                      value={effectiveLibraryName}
                      onChange={(e) => {
                        setLibraryNameTouched(true);
                        setLibraryName(e.target.value);
                      }}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Library address</span>
                    <div className="slug-field">
                      <input
                        type="text"
                        placeholder="elena"
                        value={effectiveSlug}
                        onChange={(e) => {
                          setSlugTouched(true);
                          setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32));
                        }}
                        required
                      />
                      <span>.bookkit.net</span>
                    </div>
                  </label>
                </div>
                {slugError && <div className="field-hint warn">{slugError}</div>}
                <label className="field">
                  <span>Description (optional)</span>
                  <input
                    type="text"
                    placeholder="What lives in this library (e.g. Novels, essays, and translations)"
                    maxLength={500}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </div>
            </section>

            {/* STEP 3: Shelves & House Styles */}
            <section className="signup-step-card">
              <div className="signup-step-head">
                <span className={`signup-step-num ${validShelves ? "done" : ""}`}>
                  {validShelves ? <Icon name="check" size={13} /> : "3"}
                </span>
                <div>
                  <h2>Your Shelves & House Styles</h2>
                  <p className="muted">
                    Shelves group your books (like <em>Fiction</em>, <em>Nonfiction</em>, or a series) and set default typography rules.
                  </p>
                </div>
              </div>

              {/* Quick-add shelf chips */}
              <div className="signup-quick-shelves">
                <span className="signup-quick-label">Quick add:</span>
                {QUICK_SHELVES.map((presetName) => {
                  const exists = shelves.some((s) => s.name.toLowerCase() === presetName.toLowerCase());
                  return (
                    <button
                      key={presetName}
                      type="button"
                      className={`signup-shelf-chip ${exists ? "on" : ""}`}
                      onClick={() => {
                        if (exists) {
                          const target = shelves.find((s) => s.name.toLowerCase() === presetName.toLowerCase());
                          if (target && shelves.length > 1) removeDraftShelf(target.id);
                        } else {
                          addDraftShelf(presetName);
                        }
                      }}
                    >
                      <Icon name={exists ? "check" : "plus"} size={12} />
                      {presetName}
                    </button>
                  );
                })}
              </div>

              {/* Shelf rows */}
              <ul className="signup-shelf-list">
                {shelves.map((shelf, idx) => (
                  <li key={shelf.id} className="signup-shelf-row">
                    <span className="signup-shelf-idx">{idx + 1}</span>
                    <input
                      type="text"
                      className="signup-shelf-name-input"
                      value={shelf.name}
                      placeholder="Shelf name, e.g. Fiction"
                      aria-label={`Shelf ${idx + 1} name`}
                      onChange={(e) => {
                        const v = e.target.value;
                        setShelves((prev) => prev.map((s) => (s.id === shelf.id ? { ...s, name: v } : s)));
                      }}
                    />
                    <select
                      className="signup-shelf-style-select"
                      value={shelf.preset}
                      aria-label={`House style for ${shelf.name || "shelf"}`}
                      onChange={(e) => {
                        const preset = e.target.value as StylePresetId;
                        setShelves((prev) => prev.map((s) => (s.id === shelf.id ? { ...s, preset } : s)));
                      }}
                    >
                      {(Object.keys(HOUSE_STYLE_PRESETS) as StylePresetId[]).map((key) => (
                        <option key={key} value={key}>
                          {HOUSE_STYLE_PRESETS[key].label}
                        </option>
                      ))}
                    </select>
                    <div className="signup-shelf-row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={idx === 0}
                        onClick={() => moveDraftShelf(idx, -1)}
                        aria-label="Move shelf up"
                      >
                        <span style={{ display: "inline-block", transform: "rotate(180deg)" }}>
                          <Icon name="down" size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={idx === shelves.length - 1}
                        onClick={() => moveDraftShelf(idx, 1)}
                        aria-label="Move shelf down"
                      >
                        <Icon name="down" size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={shelves.length <= 1}
                        onClick={() => removeDraftShelf(shelf.id)}
                        aria-label={`Remove ${shelf.name}`}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Add custom shelf */}
              <div className="signup-add-shelf-row">
                <input
                  type="text"
                  value={newShelfName}
                  onChange={(e) => setNewShelfName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (newShelfName.trim()) {
                        addDraftShelf(newShelfName, newShelfPreset);
                        setNewShelfName("");
                      }
                    }
                  }}
                  placeholder="Add another shelf (e.g. The Northern Trilogy)…"
                  aria-label="New shelf name"
                />
                <select
                  value={newShelfPreset}
                  onChange={(e) => setNewShelfPreset(e.target.value as StylePresetId)}
                  aria-label="New shelf house style"
                >
                  {(Object.keys(HOUSE_STYLE_PRESETS) as StylePresetId[]).map((key) => (
                    <option key={key} value={key}>
                      {HOUSE_STYLE_PRESETS[key].label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!newShelfName.trim()}
                  onClick={() => {
                    addDraftShelf(newShelfName, newShelfPreset);
                    setNewShelfName("");
                  }}
                >
                  <Icon name="plus" size={13} /> Add shelf
                </button>
              </div>

              {/* Optional First Book */}
              <div className="signup-first-book-box">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={createFirstBook}
                    onChange={(e) => setCreateFirstBook(e.target.checked)}
                  />
                  <span>
                    <strong>Also scaffold my first book right now</strong> (optional — you can always create or import books inside your library)
                  </span>
                </label>

                {createFirstBook && (
                  <div className="signup-first-book-fields">
                    <label className="field">
                      <span>Book title</span>
                      <input
                        type="text"
                        placeholder="The Glass Meridian"
                        value={firstBookTitle}
                        onChange={(e) => setFirstBookTitle(e.target.value)}
                      />
                    </label>
                    <div className="signup-field-row">
                      <label className="field">
                        <span>Literary form</span>
                        <select
                          value={firstBookForm}
                          onChange={(e) => setFirstBookForm(e.target.value as BookForm)}
                        >
                          {BOOK_FORMS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label} ({f.rangeLabel})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Place on shelf</span>
                        <select
                          value={firstBookShelfIndex}
                          onChange={(e) => setFirstBookShelfIndex(Number(e.target.value))}
                        >
                          {shelves.map((s, idx) => (
                            <option key={s.id} value={idx}>
                              {s.name || `Shelf ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {error && (
              <div className="signup-error" role="alert">
                {error}
              </div>
            )}

            <div className="signup-submit-bar">
              <button
                type="submit"
                className="btn btn-primary signup-submit-btn"
                disabled={!!busyStep || !validAccount || !validLibrary || !validShelves}
              >
                {busyStep ? (
                  <>
                    <span className="spinner tiny" /> {busyStep}
                  </>
                ) : (
                  <>
                    Start Free Subscription & Open Library <Icon name="chevron" size={15} />
                  </>
                )}
              </button>
              {!isAuthenticated && (
                <p className="signup-login-prompt">
                  Already have a Bookkit account?{" "}
                  <a
                    href="/login"
                    onClick={(e) => {
                      e.preventDefault();
                      navigatePublic("/login");
                    }}
                  >
                    Sign in here
                  </a>
                </p>
              )}
            </div>
          </form>

          {/* Right Column: Live Library Preview & Subscription Summary */}
          <aside className="signup-preview-col" aria-label="Live library preview">
            <div className="signup-preview-sticky">
              {/* Live Library Card Preview */}
              <div className="signup-preview-card">
                <div className="signup-preview-browser">
                  <div className="signup-browser-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="signup-browser-url">
                    https://<strong>{effectiveSlug || "your-library"}</strong>.bookkit.net
                  </div>
                </div>
                <div className="signup-preview-body">
                  <div className="ws-date">Your library · Owner</div>
                  <h3 className="signup-preview-lib-title">
                    {effectiveLibraryName.trim() || "Your Library"}
                  </h3>
                  {description.trim() && (
                    <p className="signup-preview-lib-desc">{description.trim()}</p>
                  )}

                  <div className="signup-preview-shelves">
                    {shelves.map((s, idx) => (
                      <div key={s.id} className="signup-preview-shelf">
                        <div className="signup-preview-shelf-head">
                          <strong>{s.name.trim() || `Shelf ${idx + 1}`}</strong>
                          <span className="pill subtle">
                            {HOUSE_STYLE_PRESETS[s.preset].label}
                          </span>
                        </div>
                        <div className="signup-preview-shelf-meta">
                          {HOUSE_STYLE_PRESETS[s.preset].summary}
                        </div>
                        {createFirstBook && firstBookTitle.trim() && firstBookShelfIndex === idx && (
                          <div className="signup-preview-book-item">
                            <span className="signup-preview-book-cover">
                              {firstBookTitle.trim().replace(/^(the|a|an)\s+/i, "").slice(0, 1).toUpperCase() || "B"}
                            </span>
                            <div>
                              <strong>{firstBookTitle.trim()}</strong>
                              <span>
                                {BOOK_FORMS.find((f) => f.value === firstBookForm)?.label} ·{" "}
                                {displayName.trim() || "Author"} · Inheriting {s.name.trim() || "shelf"} style
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Subscription Summary Card */}
              <div className="signup-sub-summary">
                <div className="signup-sub-head">
                  <div>
                    <div className="signup-sub-title">Founding Author Subscription</div>
                    <div className="muted">Early Access · Free right now</div>
                  </div>
                  <div className="signup-sub-price">
                    <strong>$0</strong>
                    <span>/ month</span>
                  </div>
                </div>
                <ul className="signup-sub-list">
                  <li>
                    <Icon name="check" size={14} />
                    <span>
                      Dedicated library at <strong>{effectiveSlug || "you"}.bookkit.net</strong>
                    </span>
                  </li>
                  <li>
                    <Icon name="check" size={14} />
                    <span>Unlimited shelves with inherited House Styles</span>
                  </li>
                  <li>
                    <Icon name="check" size={14} />
                    <span>Continuous manuscript, inline scene cards & auto-linked Story Bible</span>
                  </li>
                  <li>
                    <Icon name="check" size={14} />
                    <span>Co-author, Editor & Reader collaboration with tracked suggestions</span>
                  </li>
                  <li>
                    <Icon name="check" size={14} />
                    <span>Story-Bible-aware Whisper voice dictation & Aura-2 read-aloud</span>
                  </li>
                  <li>
                    <Icon name="check" size={14} />
                    <span>Included editorial AI reviews (`human-authored` policy enforced)</span>
                  </li>
                  <li>
                    <Icon name="check" size={14} />
                    <span>Lossless plain-file Markdown + <code>book.yaml</code> ZIP export</span>
                  </li>
                </ul>
                <div className="signup-sub-footnote">
                  <strong>Why is it free right now?</strong> During our Early Access period, all features are free while we work closely with founding authors and independent presses. Later we will introduce paid tiers—with advance notice, no lock-in, and permanent plain-file export.
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
