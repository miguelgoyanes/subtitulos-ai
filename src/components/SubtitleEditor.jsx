import { useState, useCallback } from 'react';

function formatSRT(s) {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  const se = Math.floor(s % 60); const ms = Math.floor((s % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(se).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function parseTime(t) {
  try { const p = t.replace(',', '.').split(':'); return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseFloat(p[2]); } catch { return null; }
}

function SubtitleBlock({ segment, index, onUpdate, onDelete, onInsert, onTransfer, canDelete, hasPrev, hasNext }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(segment.text);
  const [startTime, setStartTime] = useState(formatSRT(segment.start));
  const [endTime, setEndTime] = useState(formatSRT(segment.end));

  const handleSave = useCallback(() => {
    setEditing(false);
    const ini = parseTime(startTime); const fin = parseTime(endTime);
    onUpdate({ ...segment, text: editText.trim() || segment.text, start: ini !== null ? ini : segment.start, end: fin !== null ? fin : segment.end });
  }, [editText, startTime, endTime, segment, onUpdate]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setEditing(false); setEditText(segment.text); setStartTime(formatSRT(segment.start)); setEndTime(formatSRT(segment.end)); }
  };

  return (
    <div className={`subtitle-block ${editing ? 'editing' : ''}`}>
      <div className="block-header">
        <span className="block-number">#{index + 1}</span>
        <div className="block-actions">
          <button className="btn-icon btn-insert" onClick={() => onInsert(index)} title="Insertar bloque después">+→</button>
          {canDelete && <button className="btn-icon btn-delete" onClick={() => onDelete(index)} title="Eliminar (solo si vacío)">✕</button>}
        </div>
      </div>

      <div className="block-times">
        <input className="time-input" value={startTime} onChange={e => setStartTime(e.target.value)} onBlur={handleSave} />
        <input className="time-input" value={endTime} onChange={e => setEndTime(e.target.value)} onBlur={handleSave} />
      </div>

      <div className="block-text-wrapper">
        {editing ? (
          <input className="text-input-edit" value={editText} onChange={e => setEditText(e.target.value)} onBlur={handleSave} onKeyDown={handleKeyDown} autoFocus />
        ) : (
          <div className="block-text" onDoubleClick={() => setEditing(true)}>{segment.text || '(vacío)'}</div>
        )}
      </div>

      <div className="block-transfer">
        {hasPrev && <button className="btn-icon btn-transfer" onClick={() => onTransfer(index, 'left')} title="Mover palabra al anterior">←</button>}
        {hasNext && <button className="btn-icon btn-transfer" onClick={() => onTransfer(index, 'right')} title="Mover palabra al siguiente">→</button>}
      </div>
    </div>
  );
}

export default function SubtitleEditor({ segments, onChange }) {
  const handleUpdate = useCallback((index, updated) => { const newSegments = [...segments]; newSegments[index] = updated; onChange(newSegments); }, [segments, onChange]);
  const handleDelete = useCallback((index) => { if (!segments[index].text.trim()) onChange(segments.filter((_, i) => i !== index)); }, [segments, onChange]);
  const handleInsert = useCallback((index) => { const ref = segments[index] || { start: 0, end: 0, text: '' }; const newBlock = { start: ref.end, end: ref.end, text: '' }; const newSegments = [...segments]; newSegments.splice(index + 1, 0, newBlock); onChange(newSegments); }, [segments, onChange]);

  const handleTransfer = useCallback((index, direction) => {
    const newSegments = [...segments];
    if (direction === 'right' && index < segments.length - 1) {
      const src = newSegments[index]; const dst = newSegments[index + 1]; const words = src.text.split(' ').filter(Boolean);
      if (!words.length) return; const lastWord = words.pop(); src.text = words.join(' '); dst.text = lastWord + (dst.text ? ' ' + dst.text : ''); onChange(newSegments);
    } else if (direction === 'left' && index > 0) {
      const src = newSegments[index]; const dst = newSegments[index - 1]; const words = src.text.split(' ').filter(Boolean);
      if (!words.length) return; const firstWord = words.shift(); src.text = words.join(' '); dst.text = (dst.text ? dst.text + ' ' : '') + firstWord; onChange(newSegments);
    }
  }, [segments, onChange]);

  if (!segments.length) {
    return (
      <div className="editor-empty">
        <div className="empty-icon">🎬</div>
        <h3>Editor de bloques</h3>
        <p>Selecciona un vídeo y pulsa "Transcribir audio" para empezar</p>
      </div>
    );
  }

  return (
    <div className="subtitle-editor">
      <div className="editor-header">
        <h2>Editor de bloques</h2>
        <p className="editor-hint">Doble clic = editar · ← → mover palabra · +→ insertar · ✕ eliminar</p>
      </div>
      <div className="blocks-grid">
        {segments.map((seg, i) => (
          <SubtitleBlock key={i} segment={seg} index={i} onUpdate={(updated) => handleUpdate(i, updated)} onDelete={handleDelete} onInsert={handleInsert} onTransfer={handleTransfer} canDelete={!seg.text.trim()} hasPrev={i > 0} hasNext={i < segments.length - 1} />
        ))}
      </div>
    </div>
  );
}
