import { useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import type { ChapterDiff } from "../lib/supabase-service";

export function SnapshotBrowser() {
  const { snapshots, saveSnapshot, compareSnapshots, restoreSnapshot } =
    useProjectStore();
  const currentProjectRole = useProjectStore((s) => s.currentProjectRole);
  const canEdit = currentProjectRole === "owner" || currentProjectRole === "coauthor" || currentProjectRole === "editor";

  const isBookkit = useProjectStore(s=>!!s.currentProject()?.bookkitSlug);
  const [error,setError]=useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [diffResult, setDiffResult] = useState<ChapterDiff[] | null>(null);
  const [diffTitle, setDiffTitle] = useState("");
  const [comparing, setComparing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleSaveSnapshot = async () => {
    if(saving||!canEdit)return;
    setSaving(true);setError("");
    try {
      await saveSnapshot(note || undefined);
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCompare = async (snapshotId: string, message: string) => {
    setComparing(true);setError("");
    setDiffTitle(message);
    try {
      const diffs = await compareSnapshots(snapshotId, "current");
      setDiffResult(diffs);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setComparing(false);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    if (!confirm("Restore this snapshot? A safety snapshot of the current state will be created first.")) return;
    setRestoring(true);setError("");
    try {
      await restoreSnapshot(snapshotId);
      setDiffResult(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="manage-card">
      {isBookkit && <p>A snapshot keeps the whole book: every chapter, page and attached file. Restoring one first saves a safety snapshot, so nothing is lost.</p>}
      {error && <p role="alert">{error}</p>}
      {/* Create snapshot */}
      <div className="snapshot-create">
        <input
          type="text"
          placeholder="Snapshot note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="form-input snapshot-note-input"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSaveSnapshot();
          }}
        />
        <button
          onClick={handleSaveSnapshot}
          disabled={saving || !canEdit}
          className="btn btn-primary btn-sm"
        >
          {saving ? "Saving\u2026" : "Save Snapshot"}
        </button>
      </div>

      {/* Snapshot list */}
      {snapshots.length === 0 ? (
        <p className="snapshot-empty">No snapshots yet. Save one to start tracking versions.</p>
      ) : (
        <div className="snapshot-list">
          {snapshots.map((snap) => (
            <div key={snap.id} className="snapshot-row">
              <div className="snapshot-row-info">
                <span className="snapshot-message">{snap.message}</span>
                <span className="snapshot-date">
                  {new Date(snap.date).toLocaleDateString("en-GB", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {snap.wordCount > 0 && (
                    <> &middot; {snap.wordCount.toLocaleString("en-US")} words</>
                  )}
                </span>
              </div>
              <div className="snapshot-row-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => handleCompare(snap.id, snap.message)}
                  disabled={comparing}
                >
                  Compare
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => handleRestore(snap.id)}
                  disabled={restoring || useProjectStore.getState().currentProjectRole!=='owner'}
                >
                  Restore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Diff viewer */}
      {diffResult && (
        <div className="snapshot-diff">
          <div className="snapshot-diff-header">
            <div>
              <div className="manage-option-label">Changes since</div>
              <div className="snapshot-diff-title">{diffTitle}</div>
            </div>
            <button onClick={() => setDiffResult(null)} className="btn btn-sm">
              Close
            </button>
          </div>
          <div className="snapshot-diff-body">
            {diffResult.length===0 && <p>No file changes since this snapshot.</p>}
            {diffResult.map((chDiff) => {
              const wordDelta = chDiff.wordCountB - chDiff.wordCountA;
              const hasChanges = chDiff.diff.some((seg) => seg.type !== "same");
              if (!hasChanges && !chDiff.fileChange) return null;
              return (
                <div key={chDiff.chapterId} className="snapshot-diff-chapter">
                  <div className="snapshot-diff-chapter-header">
                    <span className="snapshot-diff-chapter-title">{chDiff.title}{chDiff.fileChange && ` · ${chDiff.fileChange}`}</span>
                    <span className={wordDelta >= 0 ? "diff-positive" : "diff-negative"}>
                      {wordDelta >= 0 ? "+" : ""}{wordDelta} words
                    </span>
                  </div>
                  <div className="diff-content">
                    {chDiff.diff.map((seg, i) => (
                      <span
                        key={i}
                        className={
                          seg.type === "added"
                            ? "diff-added"
                            : seg.type === "removed"
                            ? "diff-removed"
                            : ""
                        }
                      >
                        {seg.value}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
