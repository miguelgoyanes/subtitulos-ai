import argparse
import json
import sys

def transcribe(video_path, language=None):
    import whisper
    model = whisper.load_model("turbo")
    opts = {"word_timestamps": True}
    if language: opts["language"] = language
    result = model.transcribe(video_path, **opts)
    segments = []
    for seg in result["segments"]:
        words = seg.get("words", [])
        segments.append({
            "start": seg["start"],
            "end": seg["end"],
            "text": seg["text"].strip(),
            "words": [{"word": w["word"], "start": w["start"], "end": w["end"]} for w in words] if words else []
        })

    # DEBUG: muestra las primeras 20 palabras con sus timestamps
    all_words = [w for seg in segments for w in seg.get("words", [])]
    print(f"\n=== DEBUG: {len(all_words)} palabras totales ===", file=sys.stderr)
    for w in all_words[:20]:
        print(f"  '{w['word']}' start={w['start']:.3f} end={w['end']:.3f}", file=sys.stderr)
    if len(all_words) > 20:
        print(f"  ... ({len(all_words) - 20} más)", file=sys.stderr)
    # Calcula brechas entre palabras consecutivas
    gaps = [all_words[i+1]["start"] - all_words[i]["end"] for i in range(min(19, len(all_words)-1))]
    print(f"  Brechas: {[f'{g:.3f}' for g in gaps]}", file=sys.stderr)
    print(f"  Pausa > 0.25s: {sum(1 for g in gaps if g >= 0.25)} de {len(gaps)}", file=sys.stderr)
    print("=====================================\n", file=sys.stderr)

    return segments

def regroup_words(words_json, max_words, pause_threshold):
    all_words = json.loads(words_json)
    if not all_words: return []
    new_segments, group = [], []
    for i, w in enumerate(all_words):
        group.append(w)
        last = i == len(all_words) - 1
        pause = not last and (all_words[i + 1]["start"] - w["end"]) >= pause_threshold
        punct = w["word"].strip() and w["word"].strip()[-1] in ".,:;!?¡¿"
        full = len(group) >= max_words
        if last or pause or punct or full:
            new_segments.append({"start": group[0]["start"], "end": group[-1]["end"], "text": " ".join(x["word"].strip() for x in group)})
            group = []
    return new_segments

def regroup(segments_json, max_words, pause_threshold):
    segments = json.loads(segments_json)
    all_words = []
    for seg in segments:
        words = seg.get("words", [])
        if not words:
            words_text = seg["text"].split()
            duration = seg["end"] - seg["start"]
            step = duration / max(len(words_text), 1)
            for i, w in enumerate(words_text):
                words.append({"word": w, "start": seg["start"] + i * step, "end": seg["start"] + (i + 1) * step})
        all_words.extend(words)

    if not all_words: return []
    new_segments, group = [], []
    for i, w in enumerate(all_words):
        group.append(w)
        last = i == len(all_words) - 1
        pause = not last and (all_words[i + 1]["start"] - w["end"]) >= pause_threshold
        punct = w["word"].strip() and w["word"].strip()[-1] in ".,:;!?¡¿"
        full = len(group) >= max_words
        if last or pause or punct or full:
            new_segments.append({"start": group[0]["start"], "end": group[-1]["end"], "text": " ".join(x["word"].strip() for x in group)})
            group = []
    return new_segments

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", type=str)
    parser.add_argument("--language", type=str, default=None)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--regroup", type=str)
    parser.add_argument("--regroup-words", type=str)
    parser.add_argument("--max-words", type=int, default=6)
    parser.add_argument("--pause-threshold", type=float, default=0.25)
    args = parser.parse_args()

    if args.regroup_words:
        print(json.dumps(regroup_words(args.regroup_words, args.max_words, args.pause_threshold), ensure_ascii=False))
        sys.exit(0)
    if args.regroup:
        print(json.dumps(regroup(args.regroup, args.max_words, args.pause_threshold), ensure_ascii=False))
        sys.exit(0)
    if args.video:
        print(json.dumps(transcribe(args.video, args.language), ensure_ascii=False))
        sys.exit(0)
    parser.print_help()

if __name__ == "__main__":
    main()
