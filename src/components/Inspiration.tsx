import { useState, useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { getInspirationUrl } from "../lib/supabase-service";
import type { InspirationItem } from "../types";
import { Icon } from "./studio/common";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const DOCUMENT_EXTENSIONS = new Set(["pdf", "epub", "doc", "docx", "txt", "rtf", "odt", "mobi"]);

type FileTypeFilter = "all" | "images" | "documents" | "other";

function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isImage(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(fileExtension(fileName));
}

function isPdf(fileName: string): boolean {
  return PDF_EXTENSIONS.has(fileExtension(fileName));
}

function fileTypeCategory(fileName: string): FileTypeFilter {
  if (isImage(fileName)) return "images";
  if (DOCUMENT_EXTENSIONS.has(fileExtension(fileName))) return "documents";
  return "other";
}

function matchesSearch(item: InspirationItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    item.label.toLowerCase().includes(q) ||
    item.fileName.toLowerCase().includes(q) ||
    item.notes.toLowerCase().includes(q) ||
    item.tags.some((t) => t.toLowerCase().includes(q))
  );
}

function deduplicateFileName(name: string, existing: Set<string>): string {
  if (!existing.has(name)) return name;
  const ext = name.includes(".") ? "." + name.split(".").pop() : "";
  const base = ext ? name.slice(0, -ext.length) : name;
  let i = 2;
  while (existing.has(`${base}-${i}${ext}`)) i++;
  return `${base}-${i}${ext}`;
}

function useThumbnail(projectId: string, item: InspirationItem) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage(item.fileName)) return;
    let cancelled = false;
    getInspirationUrl(projectId, item.fileName)
      .then((signedUrl) => {
        if (!cancelled && signedUrl) setUrl(signedUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, item.fileName]);

  return url;
}

function FileTypeBadge({ fileName }: { fileName: string }) {
  const ext = fileExtension(fileName).toUpperCase() || "FILE";
  return (
    <div className="insp-file-badge">
      <Icon name={isPdf(fileName) ? "book" : "file"} size={24} />
      <span>{ext}</span>
    </div>
  );
}

function InspirationCard({
  item,
  projectId,
  canEdit,
  onDelete,
  onUpdate,
  onPreview,
  onAddTag,
  onRemoveTag,
}: {
  item: InspirationItem;
  projectId: string;
  canEdit: boolean;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<InspirationItem>) => void;
  onPreview: (item: InspirationItem) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveTag: (id: string, tag: string) => void;
}) {
  const thumb = useThumbnail(projectId, item);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(item.label);
  const [showNotes, setShowNotes] = useState(Boolean(item.notes));
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== item.label) {
      onUpdate(item.id, { label: trimmed });
    }
    setEditingLabel(false);
  };

  const commitTag = () => {
    if (tagDraft.trim()) onAddTag(item.id, tagDraft);
    setTagDraft("");
    setAddingTag(false);
  };

  return (
    <article className="insp-studio-card">
      <button type="button" className="insp-studio-preview" onClick={() => onPreview(item)} aria-label={`Preview ${item.label}`}>
        {thumb ? (
          <img src={thumb} alt={item.label} className="insp-studio-img" loading="lazy" />
        ) : (
          <FileTypeBadge fileName={item.fileName} />
        )}
      </button>
      <div className="insp-studio-body">
        <div className="insp-studio-head">
          {editingLabel && canEdit ? (
            <input
              className="insp-studio-title-input"
              value={labelDraft}
              aria-label="Item title"
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitLabel();
                if (e.key === "Escape") setEditingLabel(false);
              }}
              autoFocus
            />
          ) : (
            <h3
              className="insp-studio-title"
              onClick={() => {
                if (!canEdit) return;
                setLabelDraft(item.label);
                setEditingLabel(true);
              }}
              title={canEdit ? "Click to rename" : undefined}
            >
              {item.label}
            </h3>
          )}
          <span className="insp-studio-filename">{item.fileName}</span>
        </div>

        <div className="insp-studio-tags">
          {item.tags.map((tag) => (
            <span key={tag} className="chip insp-chip">
              {tag}
              {canEdit && (
                <button
                  type="button"
                  className="insp-chip-remove"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => onRemoveTag(item.id, tag)}
                >
                  &times;
                </button>
              )}
            </span>
          ))}
          {canEdit && (
            addingTag ? (
              <input
                className="insp-tag-inline-input"
                placeholder="Tag name…"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onBlur={commitTag}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTag();
                  if (e.key === "Escape") { setTagDraft(""); setAddingTag(false); }
                }}
                autoFocus
              />
            ) : (
              <button type="button" className="link-btn insp-add-tag-btn" onClick={() => setAddingTag(true)}>
                + Tag
              </button>
            )
          )}
        </div>

        {showNotes && (
          <textarea
            className="insp-studio-notes"
            placeholder="Why this matters to the book…"
            value={item.notes}
            readOnly={!canEdit}
            onChange={(e) => onUpdate(item.id, { notes: e.target.value })}
            rows={2}
          />
        )}

        <div className="insp-studio-foot">
          <button type="button" className="link-btn" onClick={() => setShowNotes(!showNotes)}>
            {showNotes ? "Hide notes" : item.notes ? "Edit notes" : "+ Add notes"}
          </button>
          {canEdit && (
            confirmDelete ? (
              <span className="confirm-inline">
                <button type="button" className="btn btn-sm btn-danger" onClick={() => onDelete(item.id)}>Remove</button>
                <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Keep</button>
              </span>
            ) : (
              <button type="button" className="link-btn danger" onClick={() => setConfirmDelete(true)}>
                Remove
              </button>
            )
          )}
        </div>
      </div>
    </article>
  );
}

function Lightbox({
  items,
  currentIndex,
  projectId,
  onClose,
  onNavigate,
}: {
  items: InspirationItem[];
  currentIndex: number;
  projectId: string;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const item = items[currentIndex];
  const [url, setUrl] = useState<string | null>(null);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    getInspirationUrl(projectId, item.fileName)
      .then((signedUrl) => {
        if (!cancelled && signedUrl) setUrl(signedUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, item.fileName]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && hasNext) onNavigate(currentIndex + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onNavigate, currentIndex, hasPrev, hasNext]);

  return (
    <div className="dialog-backdrop insp-lightbox-backdrop" onMouseDown={onClose}>
      <div className="insp-lightbox-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="insp-lightbox-bar">
          <div>
            <strong>{item.label}</strong>
            <span className="muted"> · {item.fileName} ({currentIndex + 1} of {items.length})</span>
          </div>
          <div className="insp-lightbox-actions">
            {hasPrev && <button type="button" className="btn btn-sm" onClick={() => onNavigate(currentIndex - 1)}>Previous</button>}
            {hasNext && <button type="button" className="btn btn-sm" onClick={() => onNavigate(currentIndex + 1)}>Next</button>}
            {url && <a className="btn btn-sm" href={url} target="_blank" rel="noopener noreferrer">Open original</a>}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close preview"><Icon name="close" size={16} /></button>
          </div>
        </header>
        <div className="insp-lightbox-stage">
          {!url ? (
            <div className="studio-message"><span className="spinner" /> Loading preview…</div>
          ) : isImage(item.fileName) ? (
            <img src={url} alt={item.label} className="insp-lightbox-img" />
          ) : isPdf(item.fileName) ? (
            <iframe src={url} title={item.label} className="insp-lightbox-pdf" />
          ) : (
            <div className="insp-lightbox-fallback">
              <FileTypeBadge fileName={item.fileName} />
              <p>{item.fileName}</p>
            </div>
          )}
        </div>
        {item.notes && <footer className="insp-lightbox-notes">{item.notes}</footer>}
      </div>
    </div>
  );
}

export function Inspiration() {
  const currentProjectRole = useProjectStore((s) => s.currentProjectRole);
  const inspirationItems = useProjectStore((s) => s.inspirationItems);
  const addInspirationFiles = useProjectStore((s) => s.addInspirationFiles);
  const removeInspirationItem = useProjectStore((s) => s.removeInspirationItem);
  const updateInspirationItem = useProjectStore((s) => s.updateInspirationItem);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const projectId = currentProjectId ?? "";
  const canEdit = currentProjectRole === "owner" || currentProjectRole === "coauthor" || currentProjectRole === "editor";

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FileTypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allTags = Array.from(new Set(inspirationItems.flatMap((i) => i.tags))).sort();

  const displayed = inspirationItems.filter((item) => {
    if (filterTag && !item.tags.includes(filterTag)) return false;
    if (filterType !== "all" && fileTypeCategory(item.fileName) !== filterType) return false;
    if (searchQuery && !matchesSearch(item, searchQuery)) return false;
    return true;
  });

  const existingFileNames = new Set(inspirationItems.map((i) => i.fileName));
  const hasActiveFilters = filterTag !== null || filterType !== "all" || searchQuery !== "";

  const handleAddViaInput = useCallback(
    async (fileList: FileList) => {
      if (!canEdit || fileList.length === 0) return;
      setUploading(true);
      try {
        const files: { sourcePath: string; fileName: string; data: Uint8Array }[] = [];
        for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          const fileName = deduplicateFileName(file.name, existingFileNames);
          existingFileNames.add(fileName);
          const buffer = await file.arrayBuffer();
          files.push({ sourcePath: "", fileName, data: new Uint8Array(buffer) });
        }
        if (files.length > 0) {
          await addInspirationFiles(files);
        }
      } finally {
        setUploading(false);
      }
    },
    [addInspirationFiles, canEdit, existingFileNames]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (canEdit && e.dataTransfer.files.length > 0) {
        void handleAddViaInput(e.dataTransfer.files);
      }
    },
    [canEdit, handleAddViaInput]
  );

  const handlePreview = useCallback(
    (item: InspirationItem) => {
      const idx = displayed.findIndex((d) => d.id === item.id);
      setPreviewIndex(idx >= 0 ? idx : 0);
    },
    [displayed]
  );

  const handleAddTag = (itemId: string, tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed) return;
    const item = inspirationItems.find((i) => i.id === itemId);
    if (!item || item.tags.includes(trimmed)) return;
    updateInspirationItem(itemId, { tags: [...item.tags, trimmed] });
  };

  const handleRemoveTag = (itemId: string, tag: string) => {
    const item = inspirationItems.find((i) => i.id === itemId);
    if (!item) return;
    updateInspirationItem(itemId, { tags: item.tags.filter((t) => t !== tag) });
  };

  return (
    <div
      className={`board insp-board ${isDragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (canEdit) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <header className="board-head">
        <div>
          <div className="board-eyebrow">Reference &amp; Mood Board</div>
          <h1>Inspiration</h1>
          <p className="board-sub">
            Photographs, maps, clippings, and reference PDFs that belong to the world of this book.
          </p>
        </div>
        <div className="insp-head-actions">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.epub,.doc,.docx,.txt,.rtf"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleAddViaInput(e.target.files);
                e.target.value = "";
              }
            }}
          />
          {canEdit && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="plus" size={14} /> {uploading ? "Uploading…" : "Add files"}
            </button>
          )}
        </div>
      </header>

      <div className="insp-controls">
        <div className="insp-search-box">
          <Icon name="search" size={14} />
          <input
            type="search"
            placeholder="Filter by title, filename, tag, or notes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search inspiration files"
          />
          {searchQuery && (
            <button type="button" className="icon-btn" onClick={() => setSearchQuery("")} aria-label="Clear search">
              <Icon name="close" size={13} />
            </button>
          )}
        </div>

        <div className="segmented" role="group" aria-label="Filter by file type">
          {(["all", "images", "documents", "other"] as FileTypeFilter[]).map((t) => (
            <button
              key={t}
              type="button"
              className={filterType === t ? "on" : ""}
              onClick={() => setFilterType(t)}
            >
              {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <span className="muted insp-count">
          {hasActiveFilters
            ? `${displayed.length} of ${inspirationItems.length} item${inspirationItems.length !== 1 ? "s" : ""}`
            : `${inspirationItems.length} item${inspirationItems.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {allTags.length > 0 && (
        <div className="insp-tag-bar" role="group" aria-label="Filter by tag">
          <button
            type="button"
            className={`chip ${filterTag === null ? "on" : ""}`}
            onClick={() => setFilterTag(null)}
          >
            All tags
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`chip ${filterTag === tag ? "on" : ""}`}
              onClick={() => setFilterTag(filterTag === tag ? null : tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="insp-empty-card">
          <div className="insp-empty-icon-wrap">
            <Icon name="sparkle" size={24} />
          </div>
          <h2>{hasActiveFilters ? "No matching reference files" : "Your mood board is empty"}</h2>
          <p className="muted">
            {hasActiveFilters
              ? "Try clearing the search or tag filter to see everything in this book."
              : canEdit
              ? "Drop photographs, maps, PDFs, or research clippings anywhere on this page, or click Add files."
              : "No reference files have been added to this book yet."}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setFilterTag(null);
                setFilterType("all");
                setSearchQuery("");
              }}
            >
              Reset filters
            </button>
          ) : canEdit ? (
            <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
              <Icon name="plus" size={14} /> Choose files to upload
            </button>
          ) : null}
        </div>
      ) : (
        <div className="insp-studio-grid">
          {displayed.map((item) => (
            <InspirationCard
              key={item.id}
              item={item}
              projectId={projectId}
              canEdit={canEdit}
              onDelete={(id) => void removeInspirationItem(id)}
              onUpdate={(id, updates) => updateInspirationItem(id, updates)}
              onPreview={handlePreview}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
            />
          ))}
        </div>
      )}

      {previewIndex !== null && displayed[previewIndex] && (
        <Lightbox
          items={displayed}
          currentIndex={previewIndex}
          projectId={projectId}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
        />
      )}
    </div>
  );
}
