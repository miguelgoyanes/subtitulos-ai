export default function TranscriptionPanel({ language, onLanguageChange, onTranscribe, isTranscribing, elapsed, progress, status }) {
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="transcription-panel">
      <div className="settings-row">
        <label>Idioma</label>
        <select className="select-field" value={language} onChange={e => onLanguageChange(e.target.value)}>
          <option value="Automático">Automático</option>
          <option value="Español">Español</option>
          <option value="Gallego">Gallego</option>
          <option value="Inglés">Inglés</option>
        </select>
      </div>

      <button className="btn btn-primary btn-lg full-width" onClick={onTranscribe} disabled={isTranscribing}>
        {isTranscribing ? 'Transcribiendo...' : 'Transcribir audio'}
      </button>

      {isTranscribing && (
        <div className="progress-container">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          <div className="progress-info">
            <span className="status-text">{status.text}</span>
            <span className="timer">{formatTime(elapsed)}</span>
          </div>
        </div>
      )}

      {!isTranscribing && status.type === 'restart' && (
        <div className="status-message status-restart">
          <strong>Cierra la aplicación y vuelve a abrirla.</strong>
          <br />
          Este error ocurre solo en el primer arranque después de instalar.
        </div>
      )}

      {!isTranscribing && status.type !== 'restart' && status.text && (
        <div className={`status-message status-${status.type}`}>{status.text}</div>
      )}
    </div>
  );
}
