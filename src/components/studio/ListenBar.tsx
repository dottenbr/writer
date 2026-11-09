import { SPEEDS, useListenStore, VOICES } from "../../store/useListenStore";
import { Icon } from "./common";

/** The player while a chapter is being read aloud. Lock-screen controls work too. */
export function ListenBar() {
  const s = useListenStore();
  if (s.chapter == null) return null;
  const progress = s.chunks.length ? Math.round(((s.index + 1) / s.chunks.length) * 100) : 0;
  return (
    <div className="listen-bar" role="region" aria-label="Reading aloud">
      <div className="listen-progress"><span style={{ width: `${progress}%` }} /></div>
      <div className="listen-title">
        <Icon name="headphones" size={15} />
        <span><strong>Chapter {s.chapter}</strong> · {s.title}</span>
        <span className="muted">{s.index + 1}/{s.chunks.length}</span>
      </div>
      <div className="listen-controls">
        <button className="icon-btn" onClick={() => s.skip(-1)} aria-label="Back a paragraph" title="Back"><Icon name="prev" size={16} /></button>
        <button className="listen-play" onClick={s.toggle} aria-label={s.playing ? "Pause" : "Play"} disabled={s.loading && !s.playing}>
          {s.loading && !s.playing ? <span className="spinner tiny" /> : <Icon name={s.playing ? "pause" : "play"} size={18} />}
        </button>
        <button className="icon-btn" onClick={() => s.skip(1)} aria-label="Forward a paragraph" title="Forward"><Icon name="next" size={16} /></button>
      </div>
      <div className="listen-options">
        <select value={s.rate} onChange={e => s.setRate(Number(e.target.value))} aria-label="Speed">{SPEEDS.map(r => <option key={r} value={r}>{r}×</option>)}</select>
        <select value={s.voice} onChange={e => s.setVoice(e.target.value)} aria-label="Voice">{VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
        <label className="listen-follow" title="Scroll along with the reading"><input type="checkbox" checked={s.follow} onChange={e => s.setFollow(e.target.checked)} /> Follow</label>
        <button className="icon-btn" onClick={s.stop} aria-label="Stop reading" title="Stop"><Icon name="close" size={15} /></button>
      </div>
      {s.error && <div className="listen-error" role="alert">{s.error}</div>}
    </div>
  );
}
