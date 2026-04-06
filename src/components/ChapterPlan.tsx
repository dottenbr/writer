import { DndContext, type DragEndEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useProjectStore } from "../store/useProjectStore";
import type { Chapter, Scene, SectionType } from "../types";
import {
  SECTION_TYPE_OPTIONS,
  SECTION_TYPE_LABELS,
  isChapterType,
  formatSectionPrefix,
  deriveChapterNumbers,
} from "../types";

const UNASSIGNED_ACT_ID = "__unassigned__";

const STATUS_OPTIONS: { value: Chapter["status"]; label: string }[] = [
  { value: "outline", label: "Outline" },
  { value: "draft", label: "Draft" },
  { value: "revision", label: "Revision" },
  { value: "polished", label: "Polished" },
];

function InlineScene({
  scene,
  index,
  chapterId,
}: {
  scene: Scene;
  index: number;
  chapterId: string;
}) {
  const updateScene = useProjectStore((s) => s.updateScene);
  const deleteScene = useProjectStore((s) => s.deleteScene);
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="plan-inline-scene">
      <div className="plan-scene-row">
        <span className="plan-scene-number">{index + 1}</span>
        <input
          className="plan-scene-title-input"
          value={scene.title}
          onChange={(e) => updateScene(chapterId, scene.id, { title: e.target.value })}
          placeholder="Scene title..."
        />
        <div className="plan-scene-pills">
          {scene.pov && <span className="plan-scene-pill">{scene.pov}</span>}
          {scene.location && <span className="plan-scene-pill plan-scene-pill-loc">{scene.location}</span>}
        </div>
        <button
          className="plan-scene-toggle"
          onClick={() => setShowDetail(!showDetail)}
          title={showDetail ? "Collapse" : "Expand"}
        >
          <svg
            className={`plan-scene-chevron${showDetail ? " is-open" : ""}`}
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className="plan-scene-delete"
          onClick={() => deleteScene(chapterId, scene.id)}
          title="Remove scene"
        >
          &times;
        </button>
      </div>
      {showDetail && (
        <div className="plan-scene-detail">
          <textarea
            className="plan-scene-summary"
            value={scene.summary}
            onChange={(e) => updateScene(chapterId, scene.id, { summary: e.target.value })}
            placeholder="What happens in this scene..."
            rows={2}
          />
          <div className="plan-scene-meta-row">
            <input
              className="plan-scene-meta-input"
              value={scene.pov}
              onChange={(e) => updateScene(chapterId, scene.id, { pov: e.target.value })}
              placeholder="POV character"
            />
            <input
              className="plan-scene-meta-input"
              value={scene.location}
              onChange={(e) => updateScene(chapterId, scene.id, { location: e.target.value })}
              placeholder="Location"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function useAutoResize() {
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 40)}px`;
  }, []);
  return autoResize;
}

function ExpandedChapter({ chapter }: { chapter: Chapter }) {
  const updateChapter = useProjectStore((s) => s.updateChapter);
  const deleteChapter = useProjectStore((s) => s.deleteChapter);
  const addScene = useProjectStore((s) => s.addScene);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const autoResize = useAutoResize();

  useEffect(() => {
    autoResize(summaryRef.current);
    autoResize(notesRef.current);
  }, [chapter.summary, chapter.notes, autoResize]);

  return (
    <div className="plan-chapter-expanded">
      {/* Section Type */}
      <div className="plan-expanded-section">
        <div className="plan-section-label">Section Type</div>
        <select
          className="form-input"
          value={chapter.sectionType ?? "chapter"}
          onChange={(e) => updateChapter(chapter.id, { sectionType: e.target.value as SectionType })}
          style={{ maxWidth: 200 }}
        >
          {SECTION_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Summary */}
      <div className="plan-expanded-section">
        <div className="plan-section-label">Summary</div>
        <textarea
          ref={summaryRef}
          className="plan-inline-textarea"
          value={chapter.summary}
          onChange={(e) => {
            updateChapter(chapter.id, { summary: e.target.value });
            autoResize(e.target);
          }}
          placeholder="What happens in this section..."
        />
      </div>

      {/* Scenes */}
      <div className="plan-expanded-section">
        <div className="plan-section-label">
          <span>Scenes</span>
          <button
            className="plan-add-scene-btn"
            onClick={() => addScene(chapter.id)}
          >
            +
          </button>
        </div>
        {chapter.scenes.length === 0 ? (
          <button
            className="plan-empty-scenes"
            onClick={() => addScene(chapter.id)}
          >
            Add first scene...
          </button>
        ) : (
          <div className="plan-scene-list">
            {chapter.scenes.map((scene, i) => (
              <InlineScene
                key={scene.id}
                scene={scene}
                index={i}
                chapterId={chapter.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="plan-expanded-section">
        <div className="plan-section-label">Notes</div>
        <textarea
          ref={notesRef}
          className="plan-inline-textarea"
          value={chapter.notes}
          onChange={(e) => {
            updateChapter(chapter.id, { notes: e.target.value });
            autoResize(e.target);
          }}
          placeholder="Planning notes, reminders, ideas..."
        />
      </div>

      {/* Footer actions */}
      <div className="plan-chapter-footer">
        <div className="plan-chapter-stats">
          {chapter.scenes.length > 0 && (
            <span>{chapter.scenes.length} scene{chapter.scenes.length !== 1 ? "s" : ""}</span>
          )}
          {chapter.wordCount > 0 && (
            <span>{chapter.wordCount.toLocaleString()} words</span>
          )}
        </div>
        <button
          className="plan-delete-chapter"
          onClick={() => deleteChapter(chapter.id)}
        >
          Delete chapter
        </button>
      </div>
    </div>
  );
}

function SortableChapterCard({
  chapter,
  chapterNumber,
  isExpanded,
  onToggle,
}: {
  chapter: Chapter;
  chapterNumber: number | null;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const updateChapter = useProjectStore((s) => s.updateChapter);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: chapter.id });
  const [editingTitle, setEditingTitle] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
  }, [editingTitle]);

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitle(true);
  };

  const handleTitleBlur = () => {
    setEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Escape") {
      setEditingTitle(false);
    }
  };

  const cycleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = STATUS_OPTIONS.findIndex((s) => s.value === chapter.status);
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
    updateChapter(chapter.id, { status: next.value });
  };

  return (
    <div
      ref={setNodeRef}
      className={`plan-chapter-card${isDragging ? " is-dragging" : ""}${isExpanded ? " is-expanded" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {/* Collapsed header — always visible */}
      <div className="plan-chapter-header" onClick={onToggle}>
        <button
          className="plan-chapter-handle"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
          title="Drag to reorder"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5.5" cy="3.5" r="1.2" />
            <circle cx="10.5" cy="3.5" r="1.2" />
            <circle cx="5.5" cy="8" r="1.2" />
            <circle cx="10.5" cy="8" r="1.2" />
            <circle cx="5.5" cy="12.5" r="1.2" />
            <circle cx="10.5" cy="12.5" r="1.2" />
          </svg>
        </button>

        <span className="plan-chapter-number">{formatSectionPrefix(chapter.sectionType, chapterNumber)}</span>

        {editingTitle ? (
          <input
            ref={titleRef}
            className="plan-chapter-title-input"
            value={chapter.title}
            onChange={(e) => updateChapter(chapter.id, { title: e.target.value })}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            onClick={(e) => e.stopPropagation()}
            placeholder="Untitled"
          />
        ) : (
          <span
            className="plan-chapter-title"
            onDoubleClick={handleTitleDoubleClick}
          >
            {chapter.title || "Untitled"}
          </span>
        )}

        <div className="plan-chapter-header-right">
          {!isExpanded && chapter.scenes.length > 0 && (
            <span className="plan-chapter-meta-hint">
              {chapter.scenes.length} sc.
            </span>
          )}
          {!isExpanded && chapter.wordCount > 0 && (
            <span className="plan-chapter-meta-hint">
              {chapter.wordCount.toLocaleString()}w
            </span>
          )}
          <button
            className={`plan-status-pill status-${chapter.status}`}
            onClick={cycleStatus}
            title="Click to cycle status"
          >
            {chapter.status}
          </button>
          <svg
            className={`plan-chapter-chevron${isExpanded ? " is-open" : ""}`}
            width="16" height="16" viewBox="0 0 16 16" fill="none"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Expanded body — inline editing */}
      {isExpanded && <ExpandedChapter chapter={chapter} />}
    </div>
  );
}

function ActDropZone({
  containerId,
  chapterIds,
  children,
}: {
  containerId: string;
  chapterIds: string[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId });

  return (
    <div ref={setNodeRef} className={`plan-act-chapters ${isOver ? "is-over" : ""}`}>
      <SortableContext items={chapterIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}

function ActHeader({
  act,
  actNumber,
  chapterCount,
  onUpdate,
  onDelete,
}: {
  act: { id: string; label: string };
  actNumber: number;
  chapterCount: number;
  onUpdate: (label: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  return (
    <div className="plan-act-header">
      <div className="plan-act-header-left">
        <span className="plan-act-number">Act {actNumber}</span>
        {editing ? (
          <input
            ref={inputRef}
            className="plan-act-label-input"
            value={act.label}
            onChange={(e) => onUpdate(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setEditing(false);
            }}
            placeholder="Act name..."
          />
        ) : (
          <span
            className="plan-act-label-text"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
          >
            {act.label || "Untitled act"}
          </span>
        )}
      </div>
      <div className="plan-act-header-actions">
        <span className="plan-act-meta">{chapterCount} ch.</span>
        <button
          className="plan-act-delete"
          onClick={onDelete}
          title="Remove act"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

export function ChapterPlan() {
  const project = useProjectStore((s) => s.currentProject());
  const addChapter = useProjectStore((s) => s.addChapter);
  const addSection = useProjectStore((s) => s.addSection);
  const addAct = useProjectStore((s) => s.addAct);
  const updateAct = useProjectStore((s) => s.updateAct);
  const deleteAct = useProjectStore((s) => s.deleteAct);
  const moveChapterToAct = useProjectStore((s) => s.moveChapterToAct);
  const reorderChaptersByIds = useProjectStore((s) => s.reorderChaptersByIds);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAddMenu, setShowAddMenu] = useState(false);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!project) return null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const orderedChapters = useMemo(
    () => [...project.chapters].sort((a, b) => a.number - b.number),
    [project.chapters]
  );
  const chapterNumberMap = useMemo(
    () => deriveChapterNumbers(orderedChapters),
    [orderedChapters]
  );
  const containerOrder = useMemo(
    () => [...project.acts.map((act) => act.id), UNASSIGNED_ACT_ID],
    [project.acts]
  );
  const validActIds = useMemo(() => new Set(project.acts.map((a) => a.id)), [project.acts]);
  const chaptersByContainer = useMemo(() => {
    const byContainer = new Map<string, Chapter[]>();
    for (const containerId of containerOrder) {
      byContainer.set(containerId, []);
    }
    for (const chapter of orderedChapters) {
      const containerId = chapter.act && validActIds.has(chapter.act) ? chapter.act : UNASSIGNED_ACT_ID;
      byContainer.get(containerId)?.push(chapter);
    }
    return byContainer;
  }, [orderedChapters, validActIds, containerOrder]);

  const getContainerForId = (id: string): string | null => {
    if (containerOrder.includes(id)) return id;
    for (const containerId of containerOrder) {
      if (chaptersByContainer.get(containerId)?.some((chapter) => chapter.id === id)) {
        return containerId;
      }
    }
    return null;
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const sourceContainer = getContainerForId(activeId);
    const targetContainer = getContainerForId(overId);
    if (!sourceContainer || !targetContainer) return;

    const working = new Map<string, string[]>();
    for (const containerId of containerOrder) {
      const ids = (chaptersByContainer.get(containerId) ?? []).map((chapter) => chapter.id);
      working.set(containerId, [...ids]);
    }

    const sourceIds = working.get(sourceContainer) ?? [];
    const sourceIndex = sourceIds.indexOf(activeId);
    if (sourceIndex === -1) return;

    if (sourceContainer === targetContainer) {
      const targetIds = working.get(targetContainer) ?? [];
      const targetIndex = overId === targetContainer ? targetIds.length - 1 : targetIds.indexOf(overId);
      if (targetIndex === -1) return;
      working.set(targetContainer, arrayMove(targetIds, sourceIndex, targetIndex));
    } else {
      sourceIds.splice(sourceIndex, 1);
      working.set(sourceContainer, sourceIds);
      const targetIds = working.get(targetContainer) ?? [];
      const targetIndex = overId === targetContainer ? targetIds.length : targetIds.indexOf(overId);
      const insertAt = targetIndex === -1 ? targetIds.length : targetIndex;
      targetIds.splice(insertAt, 0, activeId);
      working.set(targetContainer, targetIds);
    }

    const activeChapter = orderedChapters.find((chapter) => chapter.id === activeId);
    const newActId = targetContainer === UNASSIGNED_ACT_ID ? null : targetContainer;
    const effectiveActId = activeChapter && !isChapterType(activeChapter.sectionType) ? null : newActId;
    if (activeChapter && activeChapter.act !== effectiveActId) {
      moveChapterToAct(activeId, effectiveActId);
    }

    const newOrder = containerOrder.flatMap((containerId) => working.get(containerId) ?? []);
    const currentOrder = orderedChapters.map((chapter) => chapter.id);
    if (newOrder.length === currentOrder.length && newOrder.some((id, index) => id !== currentOrder[index])) {
      reorderChaptersByIds(newOrder);
    }
  };

  const excludeNonChapters = useProjectStore((s) => s.exportConfig.excludeNonChapters);
  const totalWords = project.chapters
    .filter((ch) => !excludeNonChapters || isChapterType(ch.sectionType))
    .reduce((sum, ch) => sum + ch.wordCount, 0);

  return (
    <div className="content">
      <div className="content-wide">
        <div className="plan-header">
          <div className="plan-header-left">
            <div className="page-title page-title-tight">
              Chapter Plan
            </div>
            <span className="plan-header-stats">
              {project.chapters.length} section{project.chapters.length !== 1 ? "s" : ""}
              {totalWords > 0 && <>&ensp;&middot;&ensp;{totalWords.toLocaleString()} words</>}
            </span>
          </div>
          <div className="flex-row gap-sm" style={{ position: "relative" }}>
            <button className="btn" onClick={() => addAct()}>
              + Act
            </button>
            <button className="btn btn-primary" onClick={addChapter}>
              + Chapter
            </button>
            <button className="btn" onClick={() => setShowAddMenu(!showAddMenu)}>
              + Section ▾
            </button>
            {showAddMenu && (
              <div className="project-dropdown" style={{ position: "absolute", top: "100%", right: 0, minWidth: 170, zIndex: 100 }}>
                {SECTION_TYPE_OPTIONS.filter((o) => o.value !== "chapter").map((opt) => (
                  <div
                    key={opt.value}
                    className="project-list-item"
                    onClick={() => {
                      addSection(opt.value);
                      setShowAddMenu(false);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {project.chapters.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No chapters yet</div>
            <div className="empty-state-text">
              Start planning your novel by adding chapters.
              <br />
              Each chapter can contain scenes, summaries, and notes.
            </div>
            <button className="btn btn-primary" onClick={addChapter}>
              + Add First Chapter
            </button>
          </div>
        ) : (
          <div className="plan-act-stack">
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              {project.acts.map((act, actIndex) => {
                const chapters = chaptersByContainer.get(act.id) ?? [];
                const chapterIds = chapters.map((chapter) => chapter.id);
                return (
                  <section key={act.id} className="plan-act-section">
                    <ActHeader
                      act={act}
                      actNumber={actIndex + 1}
                      chapterCount={chapterIds.length}
                      onUpdate={(label) => updateAct(act.id, label)}
                      onDelete={() => deleteAct(act.id)}
                    />
                    <ActDropZone containerId={act.id} chapterIds={chapterIds}>
                      {chapters.map((chapter) => (
                        <SortableChapterCard
                          key={chapter.id}
                          chapter={chapter}
                          chapterNumber={chapterNumberMap.get(chapter.id) ?? null}
                          isExpanded={expandedIds.has(chapter.id)}
                          onToggle={() => toggleExpanded(chapter.id)}
                        />
                      ))}
                      {chapters.length === 0 && (
                        <div className="plan-drop-empty">Drop chapters here</div>
                      )}
                    </ActDropZone>
                  </section>
                );
              })}

              {/* Unassigned */}
              <section className="plan-act-section plan-act-unassigned">
                <div className="plan-act-header">
                  <div className="plan-act-label-static">Unassigned</div>
                  <span className="font-mono">
                    {(chaptersByContainer.get(UNASSIGNED_ACT_ID) ?? []).length} ch.
                  </span>
                </div>
                <ActDropZone
                  containerId={UNASSIGNED_ACT_ID}
                  chapterIds={(chaptersByContainer.get(UNASSIGNED_ACT_ID) ?? []).map((chapter) => chapter.id)}
                >
                  {(chaptersByContainer.get(UNASSIGNED_ACT_ID) ?? []).map((chapter) => (
                    <SortableChapterCard
                      key={chapter.id}
                      chapter={chapter}
                      chapterNumber={chapterNumberMap.get(chapter.id) ?? null}
                      isExpanded={expandedIds.has(chapter.id)}
                      onToggle={() => toggleExpanded(chapter.id)}
                    />
                  ))}
                  {(chaptersByContainer.get(UNASSIGNED_ACT_ID) ?? []).length === 0 && (
                    <div className="plan-drop-empty">Drop chapters here</div>
                  )}
                </ActDropZone>
              </section>
            </DndContext>
          </div>
        )}
      </div>
    </div>
  );
}
