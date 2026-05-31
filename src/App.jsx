import { useState, useCallback } from 'react';
import VideoSelector from './components/VideoSelector';
import TranscriptionPanel from './components/TranscriptionPanel';
import SubtitleEditor from './components/SubtitleEditor';
import { invoke } from '@tauri-apps/api/tauri';

function regroupWords(words, maxWords, pauseThreshold, cutByPause) {
  if (!words.length) return [];
  const segs = [];
  let group = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    group.push(w);
    const last = i === words.length - 1;
    const full = group.length >= maxWords;
    const hasPause = !last && (words[i + 1].start - w.end) >= pauseThreshold;
    const hasPunct = w.word.trim().length > 0 && '.,:;!?¡¿'.includes(w.word.trim().at(-1));
    const cut = cutByPause ? (last || hasPause || full) : (last || hasPunct || full);
    if (cut) {
      segs.push({
        start: group[0].start,
        end: group.at(-1).end,
        text: group.map(x => x.word.trim()).join(' '),
        words: [...group],
      });
      group = [];
    }
  }
  return segs;
}

function App() {
  const [videoPath, setVideoPath] = useState('');
  const [destPath, setDestPath] = useState('');
  const [fileName, setFileName] = useState('');
  const [language, setLanguage] = useState('Automático');
  const [maxWords, setMaxWords] = useState(6);
  const [pauseThreshold, setPauseThreshold] = useState(0.25);
  const [cutByPause, setCutByPause] = useState(true);
  const [segments, setSegments] = useState([]);
  const [originalWords, setOriginalWords] = useState([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState({ type: '', text: '' });
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const handleSelectVideo = useCallback(async () => {
    const { open } = await import('@tauri-apps/api/dialog');
    const selected = await open({
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }],
    });
    if (selected) {
      setVideoPath(selected);
      const parts = selected.split(/[/\\]/);
      const name = parts[parts.length - 1];
      setFileName(name.replace(/\.[^/.]+$/, ''));
      setDestPath(selected.replace(/[/\\][^/\\]+$/, ''));
    }
  }, []);

  const handleSelectDest = useCallback(async () => {
    const { open } = await import('@tauri-apps/api/dialog');
    const selected = await open({ directory: true });
    if (selected) setDestPath(selected);
  }, []);

  const handleTranscribe = useCallback(async () => {
    if (!videoPath) { setStatus({ type: 'error', text: 'Selecciona un vídeo primero' }); return; }
    if (!destPath) { setStatus({ type: 'error', text: 'Selecciona una carpeta de destino' }); return; }

    setIsTranscribing(true); setElapsed(0); setProgress(0); setSegments([]); setOriginalWords([]); setStatus({ type: 'info', text: 'Cargando modelo Whisper...' });
    const timer = setInterval(() => setElapsed(prev => prev + 1), 1000);

    const progressTimer = setInterval(() => {
      setProgress(prev => Math.min(prev + 0.75, 90));
    }, 1000);

    try {
      const langMap = { 'Automático': null, 'Español': 'es', 'Gallego': 'gl', 'Inglés': 'en' };
      const result = await invoke('transcribe', { videoPath, language: langMap[language] });
      clearInterval(timer); clearInterval(progressTimer);
      setProgress(100);

      const allWords = [];
      for (const seg of result.segments) {
        if (seg.words) allWords.push(...seg.words);
      }
      setOriginalWords(allWords);

      setSegments(result.segments);
      setStatus({ type: 'success', text: `${result.segments.length} bloques generados. Ajusta si quieres.` });
    } catch (err) {
      clearInterval(timer); clearInterval(progressTimer);
      if (String(err).includes('RESTART_REQUIRED')) {
        setStatus({ type: 'restart', text: '' });
      } else {
        setStatus({ type: 'error', text: `Error: ${err}` });
      }
    } finally {
      setIsTranscribing(false);
    }
  }, [videoPath, destPath, language]);

  const handleRegroup = useCallback(() => {
    if (!originalWords.length) return;
    const result = regroupWords(originalWords, maxWords, pauseThreshold, cutByPause);
    setSegments(result);
    setStatus({ type: 'success', text: `${result.length} bloques después de reagrupar` });
  }, [originalWords, maxWords, pauseThreshold, cutByPause]);

  const handleSave = useCallback(async () => {
    if (!segments.length) return;
    try {
      const path = await invoke('save_srt', { segments: JSON.stringify(segments), destPath, fileName: fileName || 'subtitulos' });
      setStatus({ type: 'success', text: `Guardado: ${path}` });
    } catch (err) { setStatus({ type: 'error', text: `Error: ${err}` }); }
  }, [segments, destPath, fileName]);

  const handleExport = useCallback(async () => {
    if (!segments.length) return;
    try {
      const { save } = await import('@tauri-apps/api/dialog');
      const path = await save({ filters: [{ name: 'SRT', extensions: ['srt'] }], defaultPath: `${fileName || 'subtitulos'}.srt` });
      if (path) {
        await invoke('save_srt_at', { segments: JSON.stringify(segments), path });
        setStatus({ type: 'success', text: `Exportado: ${path}` });
      }
    } catch (err) { setStatus({ type: 'error', text: `Error: ${err}` }); }
  }, [segments, fileName]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="title-row">
            <img src="/vite.svg" alt="" className="title-logo" />
            <h1>Subtítulos</h1>
          </div>
          <p className="subtitle">Genera subtítulos SRT para tus vídeos</p>
        </div>

        <div className="section">
          <div className="section-badge"><span className="badge-num">1</span><span className="badge-text">VÍDEO</span></div>
          <VideoSelector videoPath={videoPath} destPath={destPath} fileName={fileName} onSelectVideo={handleSelectVideo} onSelectDest={handleSelectDest} onFileNameChange={setFileName} />
        </div>

        <div className="section">
          <div className="section-badge"><span className="badge-num">2</span><span className="badge-text">TRANSCRIBIR</span></div>
          <TranscriptionPanel language={language} onLanguageChange={setLanguage} onTranscribe={handleTranscribe} isTranscribing={isTranscribing} elapsed={elapsed} progress={progress} status={status} />
        </div>

        <div className="section">
          <div className="section-badge"><span className="badge-num">3</span><span className="badge-text">AJUSTAR</span></div>
          <div className="settings-row">
            <label>Palabras</label>
            <div className="slider-container">
              <input type="range" min="1" max="20" value={maxWords} onChange={e => setMaxWords(Number(e.target.value))} />
              <span className="slider-value">{maxWords}</span>
            </div>
          </div>
          <div className="settings-row">
            <label>Pausa</label>
            <div className="slider-container">
              <input type="range" min="0.1" max="1.0" step="0.05" value={pauseThreshold} onChange={e => setPauseThreshold(Number(e.target.value))} />
              <span className="slider-value">{pauseThreshold.toFixed(2)}s</span>
            </div>
          </div>
          <div className="settings-row">
            <label>Corte</label>
            <div className="toggle-group">
              <button className={`toggle-btn ${!cutByPause ? 'active' : ''}`} onClick={() => setCutByPause(false)}>Puntuación</button>
              <button className={`toggle-btn ${cutByPause ? 'active' : ''}`} onClick={() => setCutByPause(true)}>Tiempo</button>
            </div>
          </div>
          <button className="btn btn-secondary full-width" onClick={handleRegroup} disabled={!segments.length}>↺ Reagrupar bloques</button>
        </div>

        <div className="section">
          <div className="section-badge"><span className="badge-num">4</span><span className="badge-text">EXPORTAR</span></div>
          <button className="btn btn-primary full-width" onClick={handleSave} disabled={!segments.length}>💾 Guardar SRT</button>
          <button className="btn btn-outline full-width" onClick={handleExport} disabled={!segments.length}>Exportar como...</button>
        </div>
      </aside>

      <main className="main-panel">
        <SubtitleEditor segments={segments} onChange={setSegments} />
      </main>
    </div>
  );
}

export default App;
