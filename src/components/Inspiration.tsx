import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { getInspirationUrl } from "../lib/supabase-service";
import {
  applyCoverTags,
  applyMoodLayout,
  clearCachedCover,
  coverToneFromTags,
  generateAndCacheCoverThumbnail,
  inverseTextColorForTone,
  isCoverTag,
  parseMoodLayout,
  pickBookCoverItem,
  readCachedCover,
  visibleInspirationTags,
  type CoverTone,
  type MoodItemLayout,
} from "../lib/cover-art";
import type { InspirationItem } from "../types";
import { Icon } from "./studio/common";

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

function FileTypeBadge({ fileName, label }: { fileName: string; label?: string }) {
  const ext = fileExtension(fileName).toUpperCase() || "FILE";
  return (
    <div className="insp-file-badge">
      <Icon name={isPdf(fileName) ? "book" : "file"} size={24} />
      <span>{ext}</span>
      {label && <strong className="insp-file-badge-label">{label}</strong>}
    </div>
  );
}

const DEFAULT_WIDTHS = [290, 250, 320, 270, 300, 260];

function computeDefaultLayouts(
  items: InspirationItem[],
  canvasWidth: number,
  aspectById: Record<string, number>
): Record<string, MoodItemLayout> {
  const safeWidth = Math.max(360, canvasWidth || 1280);
  const colTarget = safeWidth < 640 ? 1 : safeWidth < 960 ? 2 : safeWidth < 1320 ? 3 : safeWidth < 1720 ? 4 : 5;
  const gap = 24;
  const padX = 8;
  const padY = 12;
  const colWidth = Math.max(220, Math.floor((safeWidth - padX * 2 - gap * (colTarget - 1)) / colTarget));
  const colHeights = new Array<number>(colTarget).fill(padY);
  const result: Record<string, MoodItemLayout> = {};

  items.forEach((item, index) => {
    const saved = parseMoodLayout(item.tags);
    if (saved) {
      result[item.id] = saved;
      // Advance the nearest column estimate so unsaved items flow below saved ones
      const approxCol = Math.min(colTarget - 1, Math.max(0, Math.floor(saved.x / (colWidth + gap))));
      const ratio = aspectById[item.id] ?? 0.78;
      const estH = Math.round(saved.w * ratio) + gap;
      colHeights[approxCol] = Math.max(colHeights[approxCol], saved.y + estH);
      return;
    }

    // Pick shortest column
    let shortestCol = 0;
    for (let c = 1; c < colTarget; c++) {
      if (colHeights[c] < colHeights[shortestCol]) shortestCol = c;
    }

    const presetW = DEFAULT_WIDTHS[index % DEFAULT_WIDTHS.length];
    const w = colTarget === 1 ? Math.min(safeWidth - 24, 340) : Math.min(colWidth + 16, presetW);
    const jitterX = colTarget > 1 ? ((index * 17) % 12) - 6 : 0;
    const x = Math.max(0, padX + shortestCol * (colWidth + gap) + jitterX);
    const y = Math.round(colHeights[shortestCol]);
    const ratio = aspectById[item.id] ?? 0.78;
    const estHeight = Math.round(w * ratio);

    result[item.id] = {
      x,
      y,
      w,
      z: index + 1,
    };
    colHeights[shortestCol] += estHeight + gap;
  });

  return result;
}

type ResizeDirection = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const RESIZE_DIRECTIONS: ResizeDirection[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function MoodBoardPiece({
  item,
  layout,
  aspectRatio,
  projectId,
  canEdit,
  isSelected,
  isCover,
  isExplicitCover,
  onSelect,
  onBringToFront,
  onCommitLayout,
  onSetCover,
  onDelete,
  onUpdate,
  onPreview,
  onAddTag,
  onRemoveTag,
  onImageLoadAspect,
}: {
  item: InspirationItem;
  layout: MoodItemLayout;
  aspectRatio: number;
  projectId: string;
  canEdit: boolean;
  isSelected: boolean;
  isCover: boolean;
  isExplicitCover: boolean;
  onSelect: (id: string | null) => void;
  onBringToFront: (id: string) => number;
  onCommitLayout: (item: InspirationItem, next: MoodItemLayout) => void;
  onSetCover: (item: InspirationItem) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<InspirationItem>) => void;
  onPreview: (item: InspirationItem) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveTag: (id: string, tag: string) => void;
  onImageLoadAspect: (id: string, ratio: number) => void;
}) {
  const thumb = useThumbnail(projectId, item);
  const [tone, setTone] = useState<CoverTone>(() => {
    const cached = readCachedCover(projectId, item.fileName);
    return cached?.tone ?? coverToneFromTags(item.tags) ?? "dark";
  });

  const [livePos, setLivePos] = useState<{ x: number; y: number; w: number; z: number } | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  const [labelDraft, setLabelDraft] = useState(item.label);
  const [tagDraft, setTagDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setLabelDraft(item.label);
  }, [item.label]);

  useEffect(() => {
    if (!isCover || !thumb) return;
    let live = true;
    generateAndCacheCoverThumbnail(projectId, item.fileName, thumb, coverToneFromTags(item.tags))
      .then((res) => {
        if (live && res) setTone(res.tone);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isCover, thumb, projectId, item.fileName, item.tags]);

  const effective = livePos ?? layout;
  const userTags = visibleInspirationTags(item.tags);
  const badgeColor = inverseTextColorForTone(tone);

  const handlePiecePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Ignore pointer downs originating inside the edit popover or resize handle
    const target = e.target as HTMLElement;
    if (target.closest(".insp-popover") || target.closest(".insp-resize-handle")) return;

    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = effective.x;
    const origY = effective.y;
    const origW = effective.w;
    const nextZ = onBringToFront(item.id);
    let moved = false;
    let latest: MoodItemLayout = { x: origX, y: origY, w: origW, z: nextZ };

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 4) {
        moved = true;
        setIsInteracting(true);
      }
      if (moved) {
        latest = {
          x: Math.max(0, Math.round(origX + dx)),
          y: Math.max(0, Math.round(origY + dy)),
          w: origW,
          z: nextZ,
        };
        setLivePos(latest);
      }
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setIsInteracting(false);
      if (moved) {
        setLivePos(null);
        onCommitLayout(item, latest);
      } else {
        onSelect(isSelected ? null : item.id);
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const handleResizePointerDown = (dir: ResizeDirection, e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = effective.w;
    const origX = effective.x;
    const origY = effective.y;
    const ratio = Math.max(0.25, aspectRatio || 0.78);
    const origH = origW * ratio;
    const rightEdge = origX + origW;
    const bottomEdge = origY + origH;
    const nextZ = onBringToFront(item.id);
    let latest: MoodItemLayout = { x: origX, y: origY, w: origW, z: nextZ };
    setIsInteracting(true);

    const clampW = (val: number) => Math.max(100, Math.min(1400, Math.round(val)));

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const dyAsW = dy / ratio;

      let nextW = origW;
      let nextX = origX;
      let nextY = origY;

      if (dir === "e") {
        nextW = clampW(origW + dx);
      } else if (dir === "w") {
        nextW = clampW(Math.min(rightEdge, origW - dx));
        nextX = Math.max(0, Math.round(rightEdge - nextW));
      } else if (dir === "s") {
        nextW = clampW(origW + dyAsW);
      } else if (dir === "n") {
        const maxWByTop = bottomEdge / ratio;
        nextW = clampW(Math.min(maxWByTop, origW - dyAsW));
        nextY = Math.max(0, Math.round(bottomEdge - nextW * ratio));
      } else if (dir === "se") {
        const dw = Math.abs(dx) >= Math.abs(dyAsW) ? dx : dyAsW;
        nextW = clampW(origW + dw);
      } else if (dir === "sw") {
        const dw = Math.abs(dx) >= Math.abs(dyAsW) ? -dx : dyAsW;
        nextW = clampW(Math.min(rightEdge, origW + dw));
        nextX = Math.max(0, Math.round(rightEdge - nextW));
      } else if (dir === "ne") {
        const dw = Math.abs(dx) >= Math.abs(dyAsW) ? dx : -dyAsW;
        const maxWByTop = bottomEdge / ratio;
        nextW = clampW(Math.min(maxWByTop, origW + dw));
        nextY = Math.max(0, Math.round(bottomEdge - nextW * ratio));
      } else if (dir === "nw") {
        const dw = Math.abs(dx) >= Math.abs(dyAsW) ? -dx : -dyAsW;
        const maxWByTop = bottomEdge / ratio;
        nextW = clampW(Math.min(rightEdge, maxWByTop, origW + dw));
        nextX = Math.max(0, Math.round(rightEdge - nextW));
        nextY = Math.max(0, Math.round(bottomEdge - nextW * ratio));
      }

      latest = { x: nextX, y: nextY, w: nextW, z: nextZ };
      setLivePos(latest);
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setIsInteracting(false);
      setLivePos(null);
      onCommitLayout(item, latest);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const handleScaleChange = (nextWidth: number) => {
    const clamped = Math.max(100, Math.min(1400, Math.round(nextWidth)));
    const nextLayout: MoodItemLayout = {
      x: effective.x,
      y: effective.y,
      w: clamped,
      z: effective.z,
    };
    onCommitLayout(item, nextLayout);
  };

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== item.label) {
      onUpdate(item.id, { label: trimmed });
    }
  };

  const commitTag = () => {
    const trimmed = tagDraft.trim();
    if (trimmed) {
      onAddTag(item.id, trimmed);
      setTagDraft("");
    }
  };

  return (
    <div
      className={`insp-mood-item ${isSelected ? "is-selected" : ""} ${isCover ? "is-cover-card" : ""} ${isInteracting ? "is-interacting" : ""}`}
      style={{
        transform: `translate3d(${effective.x}px, ${effective.y}px, 0)`,
        width: `${effective.w}px`,
        zIndex: isSelected ? Math.max(effective.z, 900) : effective.z,
      }}
      onPointerDown={handlePiecePointerDown}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest(".insp-popover")) return;
        onPreview(item);
      }}
    >
      <div className="insp-mood-frame">
        {thumb ? (
          <img
            src={thumb}
            alt={item.label}
            className="insp-mood-img"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                onImageLoadAspect(item.id, img.naturalHeight / img.naturalWidth);
              }
            }}
          />
        ) : (
          <FileTypeBadge fileName={item.fileName} label={item.label} />
        )}

        {isCover && (
          <span className="insp-cover-badge" data-tone={tone} style={{ color: badgeColor }}>
            Cover
          </span>
        )}

        {RESIZE_DIRECTIONS.map((dir) => (
          <button
            key={dir}
            type="button"
            className={`insp-resize-handle insp-resize-${dir}`}
            aria-label={dir === "se" ? `Scale ${item.label}` : `Scale ${item.label} (${dir})`}
            title="Drag any edge or corner to scale"
            onPointerDown={(e) => handleResizePointerDown(dir, e)}
          />
        ))}
      </div>

      {isSelected && (
        <div
          className="insp-popover"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="insp-popover-head">
            {canEdit ? (
              <input
                className="insp-studio-title-input"
                value={labelDraft}
                aria-label="Picture title"
                placeholder="Title or caption…"
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={commitLabel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitLabel();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            ) : (
              <strong className="insp-popover-title">{item.label}</strong>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={() => onSelect(null)}
              aria-label="Close inspector"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <div className="insp-popover-scale">
            <span className="insp-popover-label">Size</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => handleScaleChange(effective.w - 40)}
              aria-label="Smaller"
            >
              &minus;
            </button>
            <input
              type="range"
              min={100}
              max={1200}
              step={10}
              value={effective.w}
              aria-label="Picture width"
              onChange={(e) => handleScaleChange(Number(e.target.value))}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => handleScaleChange(effective.w + 40)}
              aria-label="Larger"
            >
              +
            </button>
          </div>

          <div className="insp-studio-tags">
            {userTags.map((tag) => (
              <span key={tag} className="chip insp-chip">
                #{tag}
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
              <input
                className="insp-tag-inline-input"
                placeholder="+ Add tag…"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onBlur={commitTag}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTag();
                  }
                }}
              />
            )}
          </div>

          <textarea
            className="insp-studio-notes"
            placeholder="Notes or atmosphere for this piece…"
            value={item.notes}
            readOnly={!canEdit}
            onChange={(e) => onUpdate(item.id, { notes: e.target.value })}
            rows={2}
          />

          <div className="insp-popover-foot">
            <div className="insp-popover-actions">
              {canEdit && isImage(item.fileName) && (
                <button
                  type="button"
                  className={`btn btn-sm ${isExplicitCover ? "btn-primary" : ""}`}
                  onClick={() => onSetCover(item)}
                  title="Use this picture as the book cover on the library shelf"
                >
                  {isExplicitCover ? "Cover image ✓" : "Set as cover"}
                </button>
              )}
              <button type="button" className="btn btn-sm" onClick={() => onPreview(item)}>
                Full screen
              </button>
            </div>
            {canEdit && (
              confirmDelete ? (
                <span className="confirm-inline">
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => onDelete(item.id)}>
                    Delete
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" className="link-btn danger" onClick={() => setConfirmDelete(true)}>
                  Remove
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Lightbox({
  items,
  currentIndex,
  projectId,
  canEdit,
  coverId,
  onSetCover,
  onClose,
  onNavigate,
}: {
  items: InspirationItem[];
  currentIndex: number;
  projectId: string;
  canEdit: boolean;
  coverId: string | null;
  onSetCover: (item: InspirationItem) => void;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const item = items[currentIndex];
  const [url, setUrl] = useState<string | null>(null);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;
  const isCurrentCover = coverId === item.id;

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
            <span className="muted">
              {" "}
              · {currentIndex + 1} of {items.length}
            </span>
          </div>
          <div className="insp-lightbox-actions">
            {canEdit && isImage(item.fileName) && (
              <button
                type="button"
                className={`btn btn-sm ${isCurrentCover ? "btn-primary" : ""}`}
                onClick={() => onSetCover(item)}
              >
                {isCurrentCover ? "Cover image ✓" : "Set as cover"}
              </button>
            )}
            {hasPrev && (
              <button type="button" className="btn btn-sm" onClick={() => onNavigate(currentIndex - 1)}>
                Previous
              </button>
            )}
            {hasNext && (
              <button type="button" className="btn btn-sm" onClick={() => onNavigate(currentIndex + 1)}>
                Next
              </button>
            )}
            {url && (
              <a className="btn btn-sm" href={url} target="_blank" rel="noopener noreferrer">
                Open original
              </a>
            )}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close preview">
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>
        <div className="insp-lightbox-stage">
          {!url ? (
            <div className="studio-message">
              <span className="spinner" /> Loading preview…
            </div>
          ) : isImage(item.fileName) ? (
            <img src={url} alt={item.label} className="insp-lightbox-img" />
          ) : isPdf(item.fileName) ? (
            <iframe src={url} title={item.label} className="insp-lightbox-pdf" />
          ) : (
            <div className="insp-lightbox-fallback">
              <FileTypeBadge fileName={item.fileName} label={item.label} />
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
  const canEdit =
    currentProjectRole === "owner" ||
    currentProjectRole === "coauthor" ||
    currentProjectRole === "editor";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState<number>(1120);
  const [aspectById, setAspectById] = useState<Record<string, number>>({});
  const [localLayouts, setLocalLayouts] = useState<Record<string, MoodItemLayout>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zCounterRef = useRef<number>(40);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) setCanvasWidth(el.clientWidth);
    };
    updateWidth();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateWidth);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedId) {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const allTags = Array.from(
    new Set(inspirationItems.flatMap((i) => visibleInspirationTags(i.tags)))
  ).sort();
  const activeCover = pickBookCoverItem(inspirationItems);
  const coverItemId = activeCover?.item.id ?? null;

  const displayed = useMemo(
    () =>
      inspirationItems.filter((item) => {
        if (filterTag && !item.tags.includes(filterTag)) return false;
        return true;
      }),
    [inspirationItems, filterTag]
  );

  const computedLayouts = useMemo(() => {
    const defaults = computeDefaultLayouts(displayed, canvasWidth, aspectById);
    const merged: Record<string, MoodItemLayout> = {};
    for (const item of displayed) {
      merged[item.id] = localLayouts[item.id] ?? parseMoodLayout(item.tags) ?? defaults[item.id];
    }
    return merged;
  }, [displayed, canvasWidth, aspectById, localLayouts]);

  const canvasHeight = useMemo(() => {
    let maxBottom = 680;
    for (const item of displayed) {
      const l = computedLayouts[item.id];
      if (!l) continue;
      const ratio = aspectById[item.id] ?? 0.8;
      const bottom = l.y + Math.round(l.w * ratio) + 220;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    return maxBottom;
  }, [displayed, computedLayouts, aspectById]);

  const existingFileNames = new Set(inspirationItems.map((i) => i.fileName));

  const handleBringToFront = useCallback((id: string) => {
    zCounterRef.current += 1;
    const nextZ = zCounterRef.current;
    setLocalLayouts((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, z: nextZ } };
    });
    return nextZ;
  }, []);

  const handleCommitLayout = useCallback(
    (item: InspirationItem, next: MoodItemLayout) => {
      setLocalLayouts((prev) => ({ ...prev, [item.id]: next }));
      if (canEdit) {
        updateInspirationItem(item.id, { tags: applyMoodLayout(item.tags, next) });
      }
    },
    [canEdit, updateInspirationItem]
  );

  const handleArrangeNeatly = useCallback(() => {
    const stripped = displayed.map((item) => ({
      ...item,
      tags: applyMoodLayout(item.tags, null),
    }));
    const fresh = computeDefaultLayouts(stripped, canvasWidth, aspectById);
    setLocalLayouts(fresh);
    if (canEdit) {
      for (const item of displayed) {
        const layout = fresh[item.id];
        if (layout) {
          updateInspirationItem(item.id, { tags: applyMoodLayout(item.tags, layout) });
        }
      }
    }
  }, [displayed, canvasWidth, aspectById, canEdit, updateInspirationItem]);

  const handleImageLoadAspect = useCallback((id: string, ratio: number) => {
    setAspectById((prev) => {
      if (prev[id] && Math.abs(prev[id] - ratio) < 0.01) return prev;
      return { ...prev, [id]: ratio };
    });
  }, []);

  const handleSetCover = useCallback(
    (item: InspirationItem) => {
      if (!canEdit || !isImage(item.fileName)) return;
      const alreadyPinned = item.tags.includes("cover");
      if (alreadyPinned) {
        updateInspirationItem(item.id, { tags: applyCoverTags(item.tags, false) });
        if (projectId) clearCachedCover(projectId);
        return;
      }
      for (const other of inspirationItems) {
        if (other.id !== item.id && other.tags.some(isCoverTag)) {
          updateInspirationItem(other.id, { tags: applyCoverTags(other.tags, false) });
        }
      }
      const existingTone = coverToneFromTags(item.tags);
      updateInspirationItem(item.id, { tags: applyCoverTags(item.tags, true, existingTone) });
      if (!projectId) return;
      getInspirationUrl(projectId, item.fileName)
        .then((signedUrl) => {
          if (!signedUrl) return null;
          return generateAndCacheCoverThumbnail(projectId, item.fileName, signedUrl, existingTone);
        })
        .then((result) => {
          if (result) {
            updateInspirationItem(item.id, { tags: applyCoverTags(item.tags, true, result.tone) });
          }
        })
        .catch(() => {});
    },
    [canEdit, inspirationItems, projectId, updateInspirationItem]
  );

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
      setIsDraggingFiles(false);
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
    const trimmed = tag.trim().toLowerCase().replace(/^#+/, "");
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
      className={`board insp-board insp-mood-surface ${isDraggingFiles ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (canEdit && e.dataTransfer.types.includes("Files")) setIsDraggingFiles(true);
      }}
      onDragLeave={() => setIsDraggingFiles(false)}
      onDrop={handleDrop}
      onPointerDown={() => {
        if (selectedId) setSelectedId(null);
      }}
    >
      <header className="insp-mood-header" onPointerDown={(e) => e.stopPropagation()}>
        <div className="insp-mood-header-left">
          <h1 className="insp-mood-heading">Mood Board</h1>
          {allTags.length > 0 && (
            <div className="insp-mood-tags" role="group" aria-label="Filter by tag">
              <button
                type="button"
                className={`chip ${filterTag === null ? "on" : ""}`}
                onClick={() => setFilterTag(null)}
              >
                All
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
          {displayed.length > 1 && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleArrangeNeatly}
              title="Arrange pictures into a clean collage"
            >
              Arrange neatly
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon name="plus" size={14} /> {uploading ? "Uploading…" : "Add pictures"}
            </button>
          )}
        </div>
      </header>

      {displayed.length === 0 ? (
        <div className="insp-empty-card" onPointerDown={(e) => e.stopPropagation()}>
          <div className="insp-empty-icon-wrap">
            <Icon name="sparkle" size={24} />
          </div>
          <h2>{filterTag ? "No pictures with this tag" : "Your mood board is empty"}</h2>
          <p className="muted">
            {filterTag
              ? "Select All to return to the full mood board."
              : canEdit
              ? "Drop photographs, artwork, maps, or clippings anywhere on the board."
              : "No visual references have been added to this book yet."}
          </p>
          {filterTag ? (
            <button type="button" className="btn btn-sm" onClick={() => setFilterTag(null)}>
              Show all
            </button>
          ) : canEdit ? (
            <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
              <Icon name="plus" size={14} /> Choose pictures
            </button>
          ) : null}
        </div>
      ) : (
        <div
          ref={canvasRef}
          className="insp-mood-canvas"
          style={{ minHeight: `${canvasHeight}px` }}
        >
          {displayed.map((item) => {
            const layout = computedLayouts[item.id] ?? { x: 24, y: 24, w: 280, z: 1 };
            return (
              <MoodBoardPiece
                key={item.id}
                item={item}
                layout={layout}
                aspectRatio={aspectById[item.id] ?? 0.78}
                projectId={projectId}
                canEdit={canEdit}
                isSelected={selectedId === item.id}
                isCover={coverItemId === item.id}
                isExplicitCover={item.tags.includes("cover")}
                onSelect={setSelectedId}
                onBringToFront={handleBringToFront}
                onCommitLayout={handleCommitLayout}
                onSetCover={handleSetCover}
                onDelete={(id) => {
                  setSelectedId(null);
                  void removeInspirationItem(id);
                }}
                onUpdate={(id, updates) => updateInspirationItem(id, updates)}
                onPreview={handlePreview}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
                onImageLoadAspect={handleImageLoadAspect}
              />
            );
          })}
        </div>
      )}

      {previewIndex !== null && displayed[previewIndex] && (
        <Lightbox
          items={displayed}
          currentIndex={previewIndex}
          projectId={projectId}
          canEdit={canEdit}
          coverId={coverItemId}
          onSetCover={handleSetCover}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
        />
      )}
    </div>
  );
}
