import { useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import type { ChapterDiff } from "../lib/supabase-service";

export function SnapshotBrowser() {
  const { snapshots, saveSnapshot, compareSnapshots, restoreSnapshot, progressStats } =
    useProjectStore();

  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [diffResult, setDiffResult] = useState<ChapterDiff[] | null>(null);
  const [diffTitle, setDiffTitle] = useState("");
  const [comparing, setComparing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleSaveSnapshot = async () => {
    setSaving(true);
    try {
      await saveSnapshot(note || undefined);
      setNote("");
    } catch (err) {
      console.error("Snapshot failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleCompare = async (snapshotId: string, message: string) => {
    setComparing(true);
    setDiffTitle(`Changes since: ${message}`);
    try {
      const diffs = await compareSnapshots(snapshotId, "current");
      setDiffResult(diffs);
    } catch (err) {
      console.error("Diff failed:", err);
    } finally {
      setComparing(false);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    if (!confirm("Restore this snapshot? A safety snapshot of the current state will be created first.")) return;
    setRestoring(true);
    try {
      await restoreSnapshot(snapshotId);
      setDiffResult(null);
    } catch (err) {
      console.error("Restore failed:", err);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="snapshot-browser">
      <h3>Snapshots & History</h3>

      {/* Progress stats */}
      <div className="snapshot-progress">
        <div className="progress-stat">
          <span className="progress-label">Today</span>
          <span className="progress-value">+{progressStats.todayWords} words</span>
        </div>
        <div className="progress-stat">
          <span className="progress-label">This week</span>
          <span className="progress-value">+{progressStats.weekWords} words</span>
        </div>
        <div className="progress-stat">
          <span className="progress-label">This month</span>
          <span className="progress-value">+{progressStats.monthWords} words</span>
        </div>
      </div>

      {/* Create snapshot */}
      <div className="snapshot-create">
        <input
          type="text"
          placeholder="Snapshot note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="snapshot-note-input"
        />
        <button onClick={handleSaveSnapshot} disabled={saving} className="snapshot-save-btn">
          {saving ? "Saving..." : "Save Snapshot"}
        </button>
      </div>

      {/* Snapshot list */}
      <div className="snapshot-list">
        {snapshots.length === 0 && (
          <p className="snapshot-empty">No snapshots yet. Save one to start tracking versions.</p>
        )}
        {snapshots.map((snap) => (
          <div key={snap.id} className="snapshot-item">
            <div className="snapshot-item-info">
              <span className="snapshot-message">{snap.message}</span>
              <span className="snapshot-date">
                {new Date(snap.date).toLocaleDateString()} {new Date(snap.date).toLocaleTimeString()}
              </span>
            </div>
            <div className="snapshot-item-actions">
              <button
                className="snapshot-compare-btn"
                onClick={() => handleCompare(snap.id, snap.message)}
                disabled={comparing}
              >
                Compare
              </button>
              <button
                className="snapshot-restore-btn"
                onClick={() => handleRestore(snap.id)}
                disabled={restoring}
              >
                Restore
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Diff viewer */}
      {diffResult && (
        <div className="snapshot-diff">
          <div className="snapshot-diff-header">
            <h4>{diffTitle}</h4>
            <button onClick={() => setDiffResult(null)} className="snapshot-diff-close">
              Close
            </button>
          </div>
          {diffResult.map((chDiff) => {
            const wordDelta = chDiff.wordCountB - chDiff.wordCountA;
            const hasChanges = chDiff.diff.some((seg) => seg.type !== "same");
            if (!hasChanges) return null;
            return (
              <div key={chDiff.chapterId} className="snapshot-diff-chapter">
                <h5>
                  {chDiff.title}{" "}
                  <span className={wordDelta >= 0 ? "diff-positive" : "diff-negative"}>
                    ({wordDelta >= 0 ? "+" : ""}{wordDelta} words)
                  </span>
                </h5>
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
      )}
    </div>
  );
}
