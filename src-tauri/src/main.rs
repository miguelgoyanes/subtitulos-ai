#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::process::Command;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WordInfo { word: String, start: f64, end: f64 }

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Segment {
    start: f64,
    end: f64,
    text: String,
    #[serde(default)]
    words: Vec<WordInfo>,
}

#[derive(Debug, Serialize)]
struct TranscribeResult { segments: Vec<Segment> }

#[tauri::command]
fn transcribe(video_path: String, language: Option<String>) -> Result<TranscribeResult, String> {
    let script_path = get_script_path();
    if !Path::new(&script_path).exists() { return Err(format!("Script Python no encontrado: {}", script_path)); }

    let mut cmd = Command::new("python");
    cmd.arg(&script_path).arg("--video").arg(&video_path).arg("--json");
    if let Some(lang) = &language { cmd.arg("--language").arg(lang); }

    let output = cmd.output().map_err(|e| format!("Error ejecutando Python: {}", e))?;
    if !output.status.success() { return Err(format!("Error en transcripción: {}", String::from_utf8_lossy(&output.stderr))); }

    let segments: Vec<Segment> = serde_json::from_str(&String::from_utf8_lossy(&output.stdout)).map_err(|e| format!("Error parseando: {}", e))?;
    Ok(TranscribeResult { segments })
}

#[tauri::command]
fn regroup_segments(words: String, max_words: u32, pause_threshold: f64, cut_by_pause: bool) -> Result<Vec<Segment>, String> {
    let script_path = get_script_path();
    let mut cmd = Command::new("python");
    cmd.arg(&script_path)
        .arg("--regroup-words").arg(&words)
        .arg("--max-words").arg(max_words.to_string())
        .arg("--pause-threshold").arg(pause_threshold.to_string())
        .arg("--cut-by-pause").arg(cut_by_pause.to_string());

    let output = cmd.output().map_err(|e| format!("Error ejecutando Python: {}", e))?;
    if !output.status.success() { return Err(format!("Error reagrupando: {}", String::from_utf8_lossy(&output.stderr))); }

    serde_json::from_str(&String::from_utf8_lossy(&output.stdout)).map_err(|e| format!("Error parseando: {}", e))
}

#[tauri::command]
fn save_srt(segments: String, dest_path: String, file_name: String) -> Result<String, String> {
    let segments: Vec<Segment> = serde_json::from_str(&segments).map_err(|e| format!("Error parseando: {}", e))?;
    let mut name = file_name.clone(); if !name.ends_with(".srt") { name.push_str(".srt"); }
    let path = Path::new(&dest_path).join(&name);
    fs::write(&path, segments_to_srt(&segments)).map_err(|e| format!("Error guardando: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_srt_at(segments: String, path: String) -> Result<String, String> {
    let segments: Vec<Segment> = serde_json::from_str(&segments).map_err(|e| format!("Error parseando: {}", e))?;
    fs::write(&path, segments_to_srt(&segments)).map_err(|e| format!("Error guardando: {}", e))?;
    Ok(path)
}

fn segments_to_srt(segments: &[Segment]) -> String {
    let mut out = String::new();
    for (i, seg) in segments.iter().enumerate() {
        out.push_str(&format!("{}\n{} --> {}\n{}\n\n", i + 1, fmt_srt(seg.start), fmt_srt(seg.end), seg.text.trim()));
    }
    out
}

fn fmt_srt(s: f64) -> String {
    let h = (s / 3600.0) as u32; let m = ((s % 3600.0) / 60.0) as u32;
    let se = (s % 60.0) as u32; let ms = ((s % 1.0) * 1000.0) as u32;
    format!("{:02}:{:02}:{:02},{:03}", h, m, se, ms)
}

fn get_script_path() -> String {
    let current_exe = std::env::current_exe().unwrap_or_default();
    let exe_dir = current_exe.parent().unwrap_or_else(|| std::path::Path::new("."));
    let possible = [
        exe_dir.join("..").join("..").join("..").join("scripts").join("whisper_transcribe.py"),
        exe_dir.join("..").join("..").join("scripts").join("whisper_transcribe.py"),
        exe_dir.join("..").join("scripts").join("whisper_transcribe.py"),
        exe_dir.join("scripts").join("whisper_transcribe.py"),
        std::path::Path::new("scripts").join("whisper_transcribe.py").to_path_buf(),
    ];
    for p in &possible { if p.exists() { return p.to_string_lossy().to_string(); } }
    possible[0].to_string_lossy().to_string()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![transcribe, regroup_segments, save_srt, save_srt_at])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
