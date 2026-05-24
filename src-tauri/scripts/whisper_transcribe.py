#!/usr/bin/env python3
"""
whisper_transcribe.py — Backend de transcripción para Subtítulos Automáticos 2.0

Modos de uso:
  python whisper_transcribe.py --video <ruta> [--language <lang>] --json
  python whisper_transcribe.py --regroup-words <json> --max-words <n>
                                --pause-threshold <f> --cut-by-pause <bool>
"""
import argparse
import json
import sys


def error(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(1)


def cortar(words: list, max_words: int, pause_threshold: float, cut_by_pause: bool) -> list:
    if not words:
        return []
    segs, grupo = [], []
    for i, w in enumerate(words):
        grupo.append(w)
        ultima  = (i == len(words) - 1)
        hay_p   = cut_by_pause and not ultima and (words[i + 1]["start"] - w["end"]) >= pause_threshold
        puntuac = bool(w["word"].strip()) and w["word"].strip()[-1] in ".,:;!?¡¿"
        lleno   = len(grupo) >= max_words
        if ultima or hay_p or puntuac or lleno:
            segs.append({
                "start": grupo[0]["start"],
                "end":   grupo[-1]["end"],
                "text":  " ".join(x["word"].strip() for x in grupo),
                "words": list(grupo),
            })
            grupo = []
    return segs


def mode_transcribe(video_path: str, language) -> None:
    try:
        import whisper
    except ImportError:
        error(
            "ModuleNotFoundError: No module named 'whisper'\n"
            "Instala Whisper con:  pip install openai-whisper"
        )

    try:
        model = whisper.load_model("turbo")
    except Exception as e:
        error(f"Error cargando el modelo Whisper: {e}")

    opts = {"word_timestamps": True}
    if language:
        opts["language"] = language

    try:
        result = model.transcribe(video_path, **opts)
    except Exception as e:
        error(f"Error transcribiendo el vídeo: {e}")

    segments = []
    for seg in result["segments"]:
        words = [
            {"word": w["word"], "start": w["start"], "end": w["end"]}
            for w in seg.get("words", [])
        ]
        segments.append({
            "start": seg["start"],
            "end":   seg["end"],
            "text":  seg["text"],
            "words": words,
        })

    print(json.dumps(segments, ensure_ascii=False))


def mode_regroup(words_json: str, max_words: int, pause_threshold: float, cut_by_pause: bool) -> None:
    try:
        words = json.loads(words_json)
    except json.JSONDecodeError as e:
        error(f"JSON de palabras inválido: {e}")

    segs = cortar(words, max_words, pause_threshold, cut_by_pause)
    print(json.dumps(segs, ensure_ascii=False))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--video")
    p.add_argument("--language")
    p.add_argument("--json", action="store_true")
    p.add_argument("--regroup-words")
    p.add_argument("--max-words",       type=int,   default=6)
    p.add_argument("--pause-threshold", type=float, default=0.25)
    p.add_argument("--cut-by-pause",    default="true")
    args = p.parse_args()

    if args.regroup_words:
        cut = args.cut_by_pause.lower() not in ("false", "0", "no")
        mode_regroup(args.regroup_words, args.max_words, args.pause_threshold, cut)
    elif args.video:
        lang = args.language
        if lang and lang.lower() in ("none", "automático", "automatico", ""):
            lang = None
        mode_transcribe(args.video, lang)
    else:
        error("Indica --video o --regroup-words")


if __name__ == "__main__":
    main()
