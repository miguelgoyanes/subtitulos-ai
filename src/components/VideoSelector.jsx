function FileRow({ label, value, placeholder, onBrowse }) {
  return (
    <div className="file-row">
      <label>{label}</label>
      <input type="text" className="input-field" value={value} readOnly placeholder={placeholder} />
      <button className="btn btn-sm" onClick={onBrowse}>Buscar</button>
    </div>
  );
}

export default function VideoSelector({ videoPath, destPath, fileName, onSelectVideo, onSelectDest, onFileNameChange }) {
  return (
    <div className="video-selector">
      <FileRow label="Vídeo" value={videoPath} placeholder="Selecciona un vídeo..." onBrowse={onSelectVideo} />
      <FileRow label="Destino" value={destPath} placeholder="Carpeta de destino..." onBrowse={onSelectDest} />
      <div className="file-row">
        <label>Nombre</label>
        <input type="text" className="input-field" value={fileName} onChange={e => onFileNameChange(e.target.value)} placeholder="nombre del archivo" />
      </div>
    </div>
  );
}
