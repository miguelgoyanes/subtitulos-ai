#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

// ── tipos ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WordInfo {
    word: String,
    start: f64,
    end: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Segment {
    start: f64,
    end: f64,
    text: String,
    #[serde(default)]
    words: Vec<WordInfo>,
}

#[derive(Debug, Serialize)]
struct TranscribeResult {
    segments: Vec<Segment>,
}

// ── localización del script ──────────────────────────────────────────────────

fn get_script_path(app: &tauri::AppHandle) -> Result<String, String> {
    if let Some(p) = app
        .path_resolver()
        .resolve_resource("scripts/whisper_transcribe.py")
    {
        if p.exists() {
            return Ok(p.to_string_lossy().to_string());
        }
    }

    let exe = std::env::current_exe().unwrap_or_default();
    let exe_dir = exe.parent().unwrap_or_else(|| Path::new("."));
    for rel in &["scripts", "../scripts", "../../scripts", "../../../scripts"] {
        let p = exe_dir.join(rel).join("whisper_transcribe.py");
        if p.exists() {
            return Ok(p.to_string_lossy().to_string());
        }
    }

    Err("Script de transcripción no encontrado.\nReinstala la aplicación desde GitHub.".to_string())
}

// ── ejecución de Python (bloqueante, llamar desde spawn_blocking) ────────────

fn run_python_blocking(script: &str, args: &[String]) -> Result<String, String> {
    for python in ["python", "python3"] {
        let mut cmd = Command::new(python);
        cmd.arg(script).args(args);
        // Forzar CWD limpio: el instalador puede lanzar la app desde un directorio
        // temporal con reparse points; Python heredaría ese contexto problemático.
        cmd.current_dir(std::env::temp_dir());

        // Evita que aparezca una ventana de consola en Windows
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        match cmd.output() {
            Ok(out) => {
                if out.status.success() {
                    return Ok(String::from_utf8_lossy(&out.stdout).to_string());
                }
                let stderr = String::from_utf8_lossy(&out.stderr);
                if stderr.contains("No module named 'whisper'")
                    || stderr.contains("ModuleNotFoundError")
                {
                    return Err(
                        "Whisper no está instalado.\n\n\
                         Abre una terminal (cmd / PowerShell) y ejecuta:\n\
                         \n    pip install openai-whisper\n\n\
                         También necesitas tener ffmpeg instalado.\n\
                         Descárgalo en: https://ffmpeg.org/download.html"
                            .to_string(),
                    );
                }
                return Err(format!("Error de Python:\n{}", stderr));
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(format!("Error ejecutando Python: {}", e)),
        }
    }

    Err(
        "Python no está instalado o no está en el PATH.\n\n\
         Descárgalo desde: https://www.python.org/downloads\n\
         Durante la instalación marca la opción 'Add Python to PATH'."
            .to_string(),
    )
}

// ── comandos Tauri (async → no bloquean el hilo principal) ───────────────────

#[tauri::command]
async fn transcribe(
    app: tauri::AppHandle,
    video_path: String,
    language: Option<String>,
) -> Result<TranscribeResult, String> {
    let script = get_script_path(&app)?;

    let mut args: Vec<String> = vec!["--video".to_string(), video_path, "--json".to_string()];
    if let Some(lang) = language {
        args.push("--language".to_string());
        args.push(lang);
    }

    let stdout = tauri::async_runtime::spawn_blocking(move || run_python_blocking(&script, &args))
        .await
        .map_err(|e| format!("Error interno: {}", e))??;

    let segments: Vec<Segment> = serde_json::from_str(&stdout)
        .map_err(|e| format!("Error procesando resultado: {}", e))?;
    Ok(TranscribeResult { segments })
}

#[tauri::command]
async fn regroup_segments(
    app: tauri::AppHandle,
    words: String,
    max_words: u32,
    pause_threshold: f64,
    cut_by_pause: bool,
) -> Result<Vec<Segment>, String> {
    let script = get_script_path(&app)?;
    let args: Vec<String> = vec![
        "--regroup-words".to_string(),
        words,
        "--max-words".to_string(),
        max_words.to_string(),
        "--pause-threshold".to_string(),
        pause_threshold.to_string(),
        "--cut-by-pause".to_string(),
        cut_by_pause.to_string(),
    ];

    let stdout = tauri::async_runtime::spawn_blocking(move || run_python_blocking(&script, &args))
        .await
        .map_err(|e| format!("Error interno: {}", e))??;

    serde_json::from_str(&stdout).map_err(|e| format!("Error procesando resultado: {}", e))
}

#[tauri::command]
fn save_srt(segments: String, dest_path: String, file_name: String) -> Result<String, String> {
    let segments: Vec<Segment> =
        serde_json::from_str(&segments).map_err(|e| format!("Error parseando: {}", e))?;
    let mut name = file_name.clone();
    if !name.ends_with(".srt") {
        name.push_str(".srt");
    }
    let path = Path::new(&dest_path).join(&name);
    fs::write(&path, segments_to_srt(&segments))
        .map_err(|e| format!("Error guardando: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_srt_at(segments: String, path: String) -> Result<String, String> {
    let segments: Vec<Segment> =
        serde_json::from_str(&segments).map_err(|e| format!("Error parseando: {}", e))?;
    fs::write(&path, segments_to_srt(&segments))
        .map_err(|e| format!("Error guardando: {}", e))?;
    Ok(path)
}

// ── utilidades SRT ────────────────────────────────────────────────────────────

fn segments_to_srt(segments: &[Segment]) -> String {
    let mut out = String::new();
    for (i, seg) in segments.iter().enumerate() {
        out.push_str(&format!(
            "{}\n{} --> {}\n{}\n\n",
            i + 1,
            fmt_srt(seg.start),
            fmt_srt(seg.end),
            seg.text.trim()
        ));
    }
    out
}

fn fmt_srt(s: f64) -> String {
    let h = (s / 3600.0) as u32;
    let m = ((s % 3600.0) / 60.0) as u32;
    let se = (s % 60.0) as u32;
    let ms = ((s % 1.0) * 1000.0) as u32;
    format!("{:02}:{:02}:{:02},{:03}", h, m, se, ms)
}

// ── main ──────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            transcribe,
            regroup_segments,
            save_srt,
            save_srt_at
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
