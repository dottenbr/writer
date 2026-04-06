import { useState, useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { getInspirationUrl } from "../lib/supabase-service";
import type { InspirationItem } from "../types";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"]);
const PDF_EXTENSIONS = new Set(["pdf"]);

function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isImage(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(fileExtension(fileName));
}

function isPdf(fileName: string): boolean {
  return PDF_EXTENSIONS.has(fileExtension(fileName));
}

function bytesToBlob(bytes: Uint8Array, mime: string): Blob {
  return new Blob([new Uint8Array(bytes) as BlobPart], { type: mime });
}

function mimeFromExtension(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    avif: "image/avif",
    pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
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

function FileTypeIcon({ fileName }: { fileName: string }) {
  if (isPdf(fileName)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="insp-type-icon">
        <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        <text x="8" y="18" fontSize="6" fontWeight="700" fill="currentColor" stroke="none" fontFamily="system-ui">PDF</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="insp-type-icon">
      <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function InspirationCard({
  item,
  projectId,
  onDelete,
  onUpdate,
  onPreview,
}: {
  item: InspirationItem;
  projectId: string;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<InspirationItem>) => void;
  onPreview: (item: InspirationItem) => void;
}) {
  const thumb = useThumbnail(projectId, item);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(item.label);
  const [showNotes, setShowNotes] = useState(false);

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== item.label) {
      onUpdate(item.id, { label: trimmed });
    }
    setEditingLabel(false);
  };

  return (
    <div className="insp-card">
      <div className="insp-card-preview" onClick={() => onPreview(item)}>
        {thumb ? (
          <img src={thumb} alt={item.label} className="insp-card-img" />
        ) : (
          <div className="insp-card-icon">
            <FileTypeIcon fileName={item.fileName} />
            <span className="insp-card-ext">{fileExtension(item.fileName).toUpperCase()}</span>
          </div>
        )}
      </div>
      <div className="insp-card-body">
        {editingLabel ? (
          <input
            className="form-input insp-label-input"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitLabel();
              if (e.key === "Escape") setEditingLabel(false);
            }}
            autoFocus
          />
        ) : (
          <div
            className="insp-card-label"
            onDoubleClick={() => {
              setLabelDraft(item.label);
              setEditingLabel(true);
            }}
            title="Double-click to rename"
          >
            {item.label}
          </div>
        )}
        <div className="insp-card-meta">{item.fileName}</div>
        {item.tags.length > 0 && (
          <div className="insp-card-tags">
            {item.tags.map((tag) => (
              <span key={tag} className="insp-tag">{tag}</span>
            ))}
          </div>
        )}
        {showNotes && (
          <textarea
            className="form-input insp-notes-input"
            placeholder="Notes..."
            value={item.notes}
            onChange={(e) => onUpdate(item.id, { notes: e.target.value })}
            rows={3}
          />
        )}
        <div className="insp-card-actions">
          <button
            className="btn btn-sm"
            onClick={() => setShowNotes(!showNotes)}
            title={showNotes ? "Hide notes" : "Add notes"}
          >
            {showNotes ? "Hide Notes" : "Notes"}
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => {
              if (confirm(`Remove "${item.label}" from inspiration board?`)) {
                onDelete(item.id);
              }
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

type FileTypeFilter = "all" | "images" | "documents" | "other";

const DOCUMENT_EXTENSIONS = new Set(["pdf", "epub", "doc", "docx", "txt", "rtf", "odt", "mobi"]);

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
    <div className="insp-lightbox" onClick={onClose}>
      <div className="insp-lightbox-content" onClick={(e) => e.stopPropagation()}>
        {!url ? (
          <div className="insp-lightbox-loading">Loading...</div>
        ) : isImage(item.fileName) ? (
          <img src={url} alt={item.label} className="insp-lightbox-img" />
        ) : isPdf(item.fileName) ? (
          <iframe src={url} title={item.label} className="insp-lightbox-pdf" />
        ) : (
          <div className="insp-lightbox-fallback">
            <FileTypeIcon fileName={item.fileName} />
            <p>{item.fileName}</p>
          </div>
        )}

        {hasPrev && (
          <button
            className="insp-lightbox-nav insp-lightbox-prev"
            onClick={() => onNavigate(currentIndex - 1)}
            title="Previous (Left arrow)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <path d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
        {hasNext && (
          <button
            className="insp-lightbox-nav insp-lightbox-next"
            onClick={() => onNavigate(currentIndex + 1)}
            title="Next (Right arrow)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <path d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}

        <button className="insp-lightbox-close" onClick={onClose}>
          &times;
        </button>
        <div className="insp-lightbox-footer">
          <span className="insp-lightbox-label">{item.label}</span>
          <span className="insp-lightbox-counter">{currentIndex + 1} / {items.length}</span>
        </div>
      </div>
    </div>
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

export function Inspiration() {
  const project = useProjectStore((s) => s.currentProject());
  const inspirationItems = useProjectStore((s) => s.inspirationItems);
  const addInspirationFiles = useProjectStore((s) => s.addInspirationFiles);
  const removeInspirationItem = useProjectStore((s) => s.removeInspirationItem);
  const updateInspirationItem = useProjectStore((s) => s.updateInspirationItem);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const projectId = currentProjectId ?? "";

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FileTypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [tagInput, setTagInput] = useState<{ itemId: string; value: string } | null>(null);
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
      const files: { sourcePath: string; fileName: string; data: Uint8Array }[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const raw = file.name;
        const fileName = deduplicateFileName(raw, existingFileNames);
        existingFileNames.add(fileName);
        const buffer = await file.arrayBuffer();
        files.push({ sourcePath: "", fileName, data: new Uint8Array(buffer) });
      }
      if (files.length > 0) {
        await addInspirationFiles(files);
      }
    },
    [addInspirationFiles, existingFileNames]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        void handleAddViaInput(e.dataTransfer.files);
      }
    },
    [handleAddViaInput]
  );

  const handlePreview = useCallback(async (item: InspirationItem) => {
    const idx = displayed.findIndex((d) => d.id === item.id);
    setPreviewIndex(idx >= 0 ? idx : 0);
  }, [displayed]);

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
    <div className="content">
      <div className="content-wide">
        <div className="page-title">Inspiration</div>

        <div className="insp-toolbar">
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            + Add Files
          </button>
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

          <div className="insp-search-wrap">
            <svg viewBox="0 0 20 20" fill="currentColor" className="insp-search-icon">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              className="insp-search"
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="insp-search-clear" onClick={() => setSearchQuery("")}>&times;</button>
            )}
          </div>

          <div className="insp-type-filters">
            {(["all", "images", "documents", "other"] as FileTypeFilter[]).map((t) => (
              <button
                key={t}
                className={`insp-tag-filter ${filterType === t ? "active" : ""}`}
                onClick={() => setFilterType(filterType === t ? "all" : t)}
              >
                {t === "all" ? "All Types" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {allTags.length > 0 && (
            <div className="insp-filter-tags">
              <button
                className={`insp-tag-filter ${filterTag === null ? "active" : ""}`}
                onClick={() => setFilterTag(null)}
              >
                All Tags
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  className={`insp-tag-filter ${filterTag === tag ? "active" : ""}`}
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          <span className="text-muted" style={{ marginLeft: "auto", fontSize: "0.82rem" }}>
            {hasActiveFilters
              ? `${displayed.length} of ${inspirationItems.length} item${inspirationItems.length !== 1 ? "s" : ""}`
              : `${inspirationItems.length} item${inspirationItems.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        <div
          className={`insp-drop-zone ${isDragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {displayed.length === 0 ? (
            <div className="insp-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="insp-empty-icon">
                <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21zm7.5-12.75a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              </svg>
              <p className="insp-empty-title">Your mood board is empty</p>
              <p className="insp-empty-text">
                Drop images, PDFs, ebooks, or other reference files here, or click "Add Files" above.
              </p>
            </div>
          ) : (
            <div className="insp-grid">
              {displayed.map((item) => (
                <div key={item.id} className="insp-grid-item">
                  <InspirationCard
                    item={item}
                    projectId={projectId}
                    onDelete={(id) => void removeInspirationItem(id)}
                    onUpdate={updateInspirationItem}
                    onPreview={handlePreview}
                  />
                  <div className="insp-card-tag-row">
                    {item.tags.map((tag) => (
                      <span key={tag} className="insp-tag removable" onClick={() => handleRemoveTag(item.id, tag)}>
                        {tag} &times;
                      </span>
                    ))}
                    {tagInput?.itemId === item.id ? (
                      <input
                        className="insp-tag-input"
                        placeholder="tag..."
                        value={tagInput.value}
                        onChange={(e) => setTagInput({ itemId: item.id, value: e.target.value })}
                        onBlur={() => {
                          handleAddTag(item.id, tagInput.value);
                          setTagInput(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleAddTag(item.id, tagInput.value);
                            setTagInput({ itemId: item.id, value: "" });
                          }
                          if (e.key === "Escape") setTagInput(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <button
                        className="insp-tag-add"
                        onClick={() => setTagInput({ itemId: item.id, value: "" })}
                        title="Add tag"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
    </div>
  );
}
