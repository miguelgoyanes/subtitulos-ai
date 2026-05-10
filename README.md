# Subtítulos Automáticos 2.0

Versión moderna con **Tauri + React**.

## Requisitos

- **Node.js** 18+
- **Rust** (https://rustup.rs/)
- **Python** con `openai-whisper` instalado
- **ffmpeg** (`winget install ffmpeg`)

## Instalación

```bash
cd subtitulos-2.0
npm install
```

## Desarrollo

```bash
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

El ejecutable se genera en `src-tauri/target/release/bundle/`.

## Stack

- **Frontend**: React + Vite
- **Backend**: Tauri (Rust)
- **Transcripción**: Whisper (vía Python subprocess)
