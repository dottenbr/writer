import { useMemo, useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useBookStore } from "../../store/useBookStore";
import { planReorder, type ReorderPlan } from "../../lib/reorder";
import { applyBookReorder } from "../../lib/supabase-service";
import type { ChapterInfo } from "../../lib/book-model";
import { chapterState, formatWords, Icon, useAccess } from "./common";

function Row({ id, c, canDrag, onOpen }: { id: number; c: ChapterInfo; canDrag: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canDrag });
  const st = chapterState(c);
  return (
    <div ref={setNodeRef} className={`plan-row ${isDragging ? "dragging" : ""}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      {canDrag ? <button className="drag-handle" aria-label={`Move chapter ${c.number}`} {...attributes} {...listeners}>⠿</button> : <span className="drag-handle off" />}
      <span className="plan-row-num">{c.number}</span>
      <button className="plan-row-title" onClick={onOpen}>
        <span>{c.title || `Chapter ${c.number}`}</span>
        {c.purpose && <span className="plan-row-purpose">{c.purpose.replace(/[*_]/g, "")}</span>}
      </button>
      <span className={`chapter-state ${st.key}`}>{st.label}</span>
      <span className="plan-row-meta">{c.sceneTitles.length ? `${c.sceneTitles.length} scene${c.sceneTitles.length === 1 ? "" : "s"} · ` : ""}{formatWords(c.authorPath ? c.authorWords : c.referenceWords)} w</span>
    </div>
  );
}

export function PlanList() {
  const model = useBookStore(s => s.model)!;
  const files = useBookStore(s => s.files);
  const go = useBookStore(s => s.go);
  const { isOwner, projectId } = useAccess();
  const [order, setOrder] = useState<number[] | null>(null);
  const [pending, setPending] = useState<{ plan: ReorderPlan; order: number[]; summary: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const numbers = order ?? model.chapters.map(c => c.number);
  const byNumber = useMemo(() => new Map(model.chapters.map(c => [c.number, c])), [model]);
  const groups = useMemo(() => {
    const out: Array<{ key: string; title: string; numbers: number[] }> = [];
    for (const n of numbers) {
      const c = byNumber.get(n)!;
      const key = c.part?.key ?? "_";
      const last = out[out.length - 1];
      if (last?.key === key) last.numbers.push(n);
      else out.push({ key, title: c.part?.title ?? "", numbers: [n] });
    }
    return out;
  }, [numbers, byNumber]);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = numbers.indexOf(Number(e.active.id)), to = numbers.indexOf(Number(e.over.id));
    const a = byNumber.get(Number(e.active.id))!, b = byNumber.get(Number(e.over.id))!;
    if ((a.part?.key ?? "") !== (b.part?.key ?? "")) { setError("Chapters can only be moved within their part."); return; }
    const next = arrayMove(numbers, from, to);
    setError("");
    try {
      const plan = planReorder(model, files, next);
      if (!plan.mapping.size) return;
      const renamed = plan.mapping.size;
      const pages = plan.writes.filter(w => !/^(manuscript|draft)\//.test(w.path) && !w.path.startsWith("outline/scenes/")).length;
      setOrder(next);
      setPending({ plan, order: next, summary: `Chapter ${a.number} “${a.title}” moves to position ${to + 1}. ${renamed} chapters get new numbers, and chapter references on ${pages} plan and bible page${pages === 1 ? "" : "s"} are updated to match.` });
    } catch (err) { setError((err as Error).message); }
  }

  async function apply() {
    if (!pending || !projectId) return;
    setBusy("Starting…"); setError("");
    try {
      await applyBookReorder(projectId, pending.plan, new Map(files.map(f => [f.path, f.version])), setBusy);
      const store = useBookStore.getState();
      store.unload();
      await store.load(projectId);
      useBookStore.getState().setView("plan");
      setPending(null); setOrder(null);
    } catch (e) { setError((e as Error).message); setOrder(null); setPending(null); } finally { setBusy(""); }
  }

  const written = model.chapters.filter(c => c.authorPath && !c.started).length;
  const total = model.chapters.reduce((n, c) => n + (c.authorPath ? c.authorWords : c.referenceWords), 0);
  return (
    <div className="plan-list">
      <div className="plan-list-summary">{model.chapters.length} chapters · {written} written · {formatWords(total)} words{isOwner ? <span className="muted"> · drag ⠿ to reorder</span> : null}</div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {pending && (
        <div className="reorder-confirm" role="alertdialog">
          <p>{pending.summary} A snapshot is saved first, so you can undo this from History.</p>
          {pending.plan.warnings.map(w => <p key={w} className="muted">{w}</p>)}
          <div className="dialog-actions">
            <button className="btn btn-sm" disabled={!!busy} onClick={() => { setPending(null); setOrder(null); }}>Cancel</button>
            <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => void apply()}>{busy || "Reorder chapters"}</button>
          </div>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {groups.map(g => (
          <section key={g.key} className="plan-group">
            {g.title && (
              <button className="plan-group-head" onClick={() => setCollapsed(c => ({ ...c, [g.key]: !c[g.key] }))}>
                <span className={`nav-caret ${collapsed[g.key] ? "" : "open"}`}><Icon name="chevron" size={12} /></span>
                <span>{g.title}</span>
                <span className="muted">{g.numbers.length} chapters · {formatWords(g.numbers.reduce((n, x) => { const c = byNumber.get(x)!; return n + (c.authorPath ? c.authorWords : c.referenceWords); }, 0))} words</span>
              </button>
            )}
            {!collapsed[g.key] && (
              <SortableContext items={g.numbers} strategy={verticalListSortingStrategy}>
                {g.numbers.map(n => {
                  const c = byNumber.get(n)!;
                  const position = model.chapters[numbers.indexOf(n)]?.number ?? n;
                  return <Row key={n} id={n} c={position === n ? c : { ...c, number: position }} canDrag={isOwner && !busy && !pending} onOpen={() => go(c.authorPath ?? c.currentPath)} />;
                })}
              </SortableContext>
            )}
          </section>
        ))}
      </DndContext>
    </div>
  );
}
