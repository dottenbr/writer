import { useState, useRef } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { MANUSCRIPT_PRESET } from "../lib/export-config";
import type { ExportFormat, ExportPreset, ParagraphStyle } from "../lib/export-config";
import { Collaboration } from "./Collaboration";
import { SnapshotBrowser } from "./SnapshotBrowser";

const FONT_OPTIONS = [
  "Times New Roman",
  "Courier New",
  "Garamond",
  "Palatino",
  "Georgia",
  "Baskerville",
  "Caslon",
];

const LINE_SPACING_OPTIONS = [
  { value: 1.0, label: "Single" },
  { value: 1.15, label: "1.15" },
  { value: 1.5, label: "1.5" },
  { value: 2.0, label: "Double" },
];

const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14];

export function Manage() {
  const project = useProjectStore((s) => s.currentProject());
  const darkMode = useProjectStore((s) => s.darkMode);
  const setDarkMode = useProjectStore((s) => s.setDarkMode);
  const saveToStorage = useProjectStore((s) => s.saveToStorage);
  const exportCurrentProjectZip = useProjectStore((s) => s.exportCurrentProjectZip);
  const importProjectZip = useProjectStore((s) => s.importProjectZip);
  const setShowApiSettings = useProjectStore((s) => s.setShowApiSettings);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const exportConfig = useProjectStore((s) => s.exportConfig);
  const updateExportConfig = useProjectStore((s) => s.updateExportConfig);
  const signOut = useProjectStore((s) => s.signOut);
  const userEmail = useProjectStore((s) => s.userEmail);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!project) return;
    setExporting(true);
    try {
      await saveToStorage();
      const { exportManuscriptAsDocx, exportManuscriptAsEpub, exportManuscriptAsPdf } = await import("../lib/export-docx");
      if (exportConfig.exportFormat === "epub") {
        await exportManuscriptAsEpub(project, exportConfig);
      } else if (exportConfig.exportFormat === "pdf") {
        await exportManuscriptAsPdf(project, exportConfig);
      } else {
        await exportManuscriptAsDocx(project, exportConfig);
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      await importProjectZip(data);
    } catch (err) {
      console.error("Import failed:", err);
    }
    if (zipInputRef.current) zipInputRef.current.value = "";
  };

  const applyPreset = (preset: ExportPreset) => {
    if (preset === "manuscript") {
      updateExportConfig({ ...MANUSCRIPT_PRESET, preset: "manuscript" });
    } else {
      updateExportConfig({ preset: "custom" });
    }
  };

  const formatLabel =
    exportConfig.exportFormat === "epub"
      ? "EPUB"
      : exportConfig.exportFormat === "pdf"
        ? "PDF"
        : "DOCX";

  return (
    <div className="content">
      <div className="content-wide">
        <div className="page-title">Manage</div>

        {/* Export — full-width top card */}
        <div className="manage-export-card">
          <div className="manage-export-header">
            <div className="manage-card-title">Export Manuscript</div>
            <div className="manage-preset-row">
              <button
                className={`btn btn-sm ${exportConfig.preset === "manuscript" ? "btn-primary" : ""}`}
                onClick={() => applyPreset("manuscript")}
              >
                Standard Manuscript
              </button>
              <button
                className={`btn btn-sm ${exportConfig.preset === "custom" ? "btn-primary" : ""}`}
                onClick={() => applyPreset("custom")}
              >
                Custom
              </button>
            </div>
          </div>

          <div className="manage-export-options">
            <div className="manage-option-group">
              <div className="manage-option-label">Content</div>
              <label className="manage-check">
                <input
                  type="checkbox"
                  checked={exportConfig.actHeadings}
                  onChange={(e) => updateExportConfig({ actHeadings: e.target.checked, preset: "custom" })}
                />
                Act headings
              </label>
              <label className="manage-check">
                <input
                  type="checkbox"
                  checked={exportConfig.chapterHeadings}
                  onChange={(e) => updateExportConfig({ chapterHeadings: e.target.checked, preset: "custom" })}
                />
                Chapter headings
              </label>
              <label className="manage-check">
                <input
                  type="checkbox"
                  checked={exportConfig.sceneHeadings}
                  onChange={(e) => updateExportConfig({ sceneHeadings: e.target.checked, preset: "custom" })}
                />
                Scene headings
              </label>
            </div>

            <div className="manage-option-group">
              <div className="manage-option-label">Scene Separator</div>
              <input
                type="text"
                className="form-input"
                value={exportConfig.sceneSeparator}
                onChange={(e) => updateExportConfig({ sceneSeparator: e.target.value, preset: "custom" })}
                style={{ maxWidth: 120, textAlign: "center" }}
              />
              <div className="manage-card-hint">Replaces scene breaks when headings are off</div>
            </div>

            <div className="manage-option-group">
              <div className="manage-option-label">Title Page</div>
              <label className="manage-check">
                <input
                  type="checkbox"
                  checked={exportConfig.titlePage}
                  onChange={(e) => updateExportConfig({ titlePage: e.target.checked, preset: "custom" })}
                />
                Include title page
              </label>
              {exportConfig.titlePage && (
                <>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Author name"
                    value={exportConfig.author}
                    onChange={(e) => updateExportConfig({ author: e.target.value })}
                    style={{ marginTop: 4, maxWidth: 220 }}
                  />
                  <label className="manage-check" style={{ marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={exportConfig.wordCountOnTitle}
                      onChange={(e) => updateExportConfig({ wordCountOnTitle: e.target.checked, preset: "custom" })}
                    />
                    Show word count
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="manage-export-options" style={{ marginTop: 12 }}>
            <div className="manage-option-group">
              <div className="manage-option-label">Font</div>
              <select
                className="form-input"
                value={exportConfig.fontFamily}
                onChange={(e) => updateExportConfig({ fontFamily: e.target.value, preset: "custom" })}
                style={{ maxWidth: 180 }}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <div className="manage-font-size-row">
                <select
                  className="form-input"
                  value={exportConfig.fontSize}
                  onChange={(e) => updateExportConfig({ fontSize: Number(e.target.value), preset: "custom" })}
                  style={{ maxWidth: 80 }}
                >
                  {FONT_SIZE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}pt</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="manage-option-group">
              <div className="manage-option-label">Line Spacing</div>
              {LINE_SPACING_OPTIONS.map((opt) => (
                <label key={opt.value} className="manage-check">
                  <input
                    type="radio"
                    name="lineSpacing"
                    checked={exportConfig.lineSpacing === opt.value}
                    onChange={() => updateExportConfig({ lineSpacing: opt.value, preset: "custom" })}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            <div className="manage-option-group">
              <div className="manage-option-label">Paragraphs</div>
              <label className="manage-check">
                <input
                  type="radio"
                  name="paragraphStyle"
                  checked={exportConfig.paragraphStyle === "indent"}
                  onChange={() => updateExportConfig({ paragraphStyle: "indent" as ParagraphStyle, preset: "custom" })}
                />
                First-line indent (manuscript)
              </label>
              <label className="manage-check">
                <input
                  type="radio"
                  name="paragraphStyle"
                  checked={exportConfig.paragraphStyle === "spacing"}
                  onChange={() => updateExportConfig({ paragraphStyle: "spacing" as ParagraphStyle, preset: "custom" })}
                />
                Paragraph spacing (modern)
              </label>
            </div>

            <div className="manage-option-group">
              <div className="manage-option-label">Page Format</div>
              <label className="manage-check">
                <input
                  type="radio"
                  name="pageFormat"
                  checked={exportConfig.pageFormat === "a4"}
                  onChange={() => updateExportConfig({ pageFormat: "a4", preset: "custom" })}
                />
                A4 (210 x 297 mm)
              </label>
              <label className="manage-check">
                <input
                  type="radio"
                  name="pageFormat"
                  checked={exportConfig.pageFormat === "letter"}
                  onChange={() => updateExportConfig({ pageFormat: "letter", preset: "custom" })}
                />
                US Letter (8.5 x 11 in)
              </label>
            </div>
          </div>

          <div className="manage-export-footer">
            <div className="manage-format-row">
              <div className="manage-option-label">Format</div>
              <div className="manage-format-buttons">
                {(["docx", "epub", "pdf"] as ExportFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    className={`btn btn-sm ${exportConfig.exportFormat === fmt ? "btn-primary" : ""}`}
                    onClick={() => updateExportConfig({ exportFormat: fmt })}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => void handleExport()}
              disabled={!project || exporting}
            >
              {exporting ? "Exporting..." : `Export as ${formatLabel}`}
            </button>
          </div>
        </div>

        {/* Grid of smaller cards */}
        <div className="manage-grid">
          <div className="manage-card">
            <div className="manage-card-title">Project Files</div>
            <div className="manage-card-actions">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                style={{ display: "none" }}
                onChange={handleImportZip}
              />
              <button className="btn" onClick={() => zipInputRef.current?.click()}>
                Import ZIP
              </button>
              <button className="btn" onClick={() => void exportCurrentProjectZip()}>
                Export ZIP
              </button>
            </div>
            <div className="manage-card-hint">ZIP import creates a new project from an archive.</div>
          </div>

          <div className="manage-card">
            <div className="manage-card-title">Settings</div>
            <div className="manage-card-actions">
              <button className="btn" onClick={() => setShowApiSettings(true)}>
                Configure AI / LLM
              </button>
              <button
                className="btn"
                onClick={() => {
                  setDarkMode(!darkMode);
                  void saveToStorage();
                }}
              >
                {darkMode ? "Light Mode" : "Dark Mode"}
              </button>
            </div>
            <label className="manage-check" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={exportConfig.excludeNonChapters}
                onChange={(e) => updateExportConfig({ excludeNonChapters: e.target.checked })}
              />
              Exclude non-chapters from word count
            </label>
          </div>

          <div className="manage-card">
            <div className="manage-card-title">Project Info</div>
            <div className="manage-info-grid">
              <div className="manage-info-row">
                <span className="manage-info-label">Name</span>
                <span className="manage-info-value">{project?.name || "\u2014"}</span>
              </div>
              <div className="manage-info-row">
                <span className="manage-info-label">Sections</span>
                <span className="manage-info-value">{project?.chapters.length ?? 0}</span>
              </div>
              <div className="manage-info-row">
                <span className="manage-info-label">Signed in as</span>
                <span className="manage-info-value">{userEmail || "\u2014"}</span>
              </div>
            </div>
            <button className="btn" style={{ marginTop: 8 }} onClick={() => void signOut()}>
              Sign Out
            </button>
          </div>
        </div>

        {/* Collaboration */}
        <Collaboration />

        {/* Snapshots & History */}
        <SnapshotBrowser />

        {/* Danger zone */}
        <div className="manage-danger">
          <div className="manage-card-title manage-danger-title">Danger Zone</div>
          {!confirmDelete ? (
            <button
              className="btn btn-danger"
              onClick={() => setConfirmDelete(true)}
              disabled={!currentProjectId}
            >
              Delete This Project
            </button>
          ) : (
            <div className="manage-danger-confirm">
              <p>
                Permanently delete <strong>{project?.name}</strong>? This cannot be undone.
              </p>
              <div className="manage-card-actions" style={{ flexDirection: "row" }}>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    if (currentProjectId) void deleteProject(currentProjectId);
                    setConfirmDelete(false);
                  }}
                >
                  Yes, Delete Everything
                </button>
                <button className="btn" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
