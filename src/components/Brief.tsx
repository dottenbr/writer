import { useMemo, useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { estimatePages } from "../lib/markdown";

export function Brief() {
  const project = useProjectStore((s) => s.currentProject());
  const updateBrief = useProjectStore((s) => s.updateBrief);
  const totalWordCount = useProjectStore((s) => s.totalWordCount());
  const [showStyleGuide, setShowStyleGuide] = useState(false);

  const brief = project?.brief;
  const styleGuidePreview = useMemo(() => {
    if (!brief) return "";
    const plain = brief.writingStyle.replace(/\s+/g, " ").trim();
    if (!plain) return "No style guide yet. Click to define tone, rhythm, diction, and constraints.";
    return plain.slice(0, 180) + (plain.length > 180 ? "..." : "");
  }, [brief?.writingStyle]);

  if (!project || !brief) return null;
  const progress = brief.targetWordCount > 0
    ? Math.min(100, Math.round((totalWordCount / brief.targetWordCount) * 100))
    : 0;

  if (showStyleGuide) {
    return (
      <div className="content">
        <div className="content-wide">
          <div className="brief-style-header">
            <div className="page-title" style={{ marginBottom: 0 }}>Style Guide</div>
            <button className="btn btn-sm" onClick={() => setShowStyleGuide(false)}>
              Back to Brief
            </button>
          </div>
          <div className="brief-style-hint">
            Saves to <code>style-rules.md</code> in the project root.
          </div>
          <textarea
            className="form-textarea brief-style-editor"
            placeholder="Write your full prose style guide here — tone, rhythm, diction, constraints..."
            value={brief.writingStyle}
            onChange={(e) => updateBrief("writingStyle", e.target.value)}
            rows={28}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="content-narrow">
        <div className="page-title">Brief</div>

        <div className="brief-title-group">
          <input
            className="brief-title-input"
            placeholder="Your novel's title..."
            value={brief.title}
            onChange={(e) => updateBrief("title", e.target.value)}
          />
          <input
            className="brief-subtitle-input"
            placeholder="Subtitle (optional)"
            value={brief.subtitle}
            onChange={(e) => updateBrief("subtitle", e.target.value)}
          />
        </div>

        <div className="stats-row">
          <div className="stat">
            <div className="stat-value">{totalWordCount.toLocaleString()}</div>
            <div className="stat-label">Words (~{estimatePages(totalWordCount)} pp)</div>
          </div>
          <div className="stat">
            <div className="stat-value">{brief.targetWordCount.toLocaleString()}</div>
            <div className="stat-label">Target (~{estimatePages(brief.targetWordCount)} pp)</div>
          </div>
          <div className="stat">
            <div className="stat-value">{project.chapters.length}</div>
            <div className="stat-label">Chapters</div>
          </div>
          <div className="stat">
            <div className="stat-value">{progress}%</div>
            <div className="stat-label">Complete</div>
          </div>
        </div>

        <div className="progress-bar mb-lg">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="card-grid card-grid-2 mb-lg">
          <div className="form-group">
            <label className="form-label">Genre</label>
            <input
              className="form-input"
              placeholder="Literary fiction, thriller, sci-fi..."
              value={brief.genre}
              onChange={(e) => updateBrief("genre", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Audience</label>
            <input
              className="form-input"
              placeholder="Adult, YA, middle-grade..."
              value={brief.audience}
              onChange={(e) => updateBrief("audience", e.target.value)}
            />
          </div>
        </div>

        <div className="form-group mb-lg">
          <label className="form-label">Logline</label>
          <textarea
            className="form-textarea"
            placeholder="A one-sentence summary of your novel's core conflict..."
            value={brief.logline}
            onChange={(e) => updateBrief("logline", e.target.value)}
            rows={2}
          />
        </div>

        <div className="form-group mb-lg">
          <label className="form-label">Synopsis</label>
          <textarea
            className="form-textarea"
            placeholder="A detailed summary of your entire story arc..."
            value={brief.synopsis}
            onChange={(e) => updateBrief("synopsis", e.target.value)}
            rows={8}
          />
        </div>

        <div className="form-group mb-lg">
          <label className="form-label">Themes</label>
          <div className="brief-themes-row">
            {brief.themes.map((theme, i) => (
              <span key={i} className="tag">
                {theme}
                <button
                  className="tag-remove"
                  onClick={() => {
                    const next = brief.themes.filter((_, j) => j !== i);
                    updateBrief("themes", next);
                  }}
                >
                  &times;
                </button>
              </span>
            ))}
            <input
              className="brief-theme-input"
              placeholder="Add theme..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                  updateBrief("themes", [...brief.themes, e.currentTarget.value.trim()]);
                  e.currentTarget.value = "";
                }
              }}
            />
          </div>
        </div>

        <div className="card-grid card-grid-2 mb-lg">
          <div className="form-group">
            <label className="form-label">Style Guide</label>
            <button
              className="brief-style-card"
              onClick={() => setShowStyleGuide(true)}
            >
              <span className="brief-style-card-action">Open editor</span>
              <span className="brief-style-card-preview">{styleGuidePreview}</span>
            </button>
          </div>
          <div className="form-group">
            <label className="form-label">Comparable Titles</label>
            <textarea
              className="form-textarea"
              placeholder="Books with a similar feel or audience..."
              value={brief.comparableTitles}
              onChange={(e) => updateBrief("comparableTitles", e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <div className="form-group mb-lg">
          <label className="form-label">Target Word Count</label>
          <div className="brief-target-row">
            <input
              className="form-input"
              type="number"
              value={brief.targetWordCount}
              onChange={(e) => updateBrief("targetWordCount", parseInt(e.target.value) || 0)}
              style={{ maxWidth: 160 }}
            />
            <span className="brief-target-hint">
              ~{estimatePages(brief.targetWordCount)} pages (250 words/page)
            </span>
          </div>
        </div>

        <div className="form-group mb-lg">
          <label className="form-label">Notes</label>
          <textarea
            className="form-textarea"
            placeholder="Additional notes about your project..."
            value={brief.notes}
            onChange={(e) => updateBrief("notes", e.target.value)}
            rows={4}
          />
        </div>
      </div>
    </div>
  );
}
