#!/usr/bin/env python3
"""
Transkribiert eine Audiodatei mit whisper.cpp (tiny-Modell).

Verwendung:
  python whisper_tiny.py                        # interaktive Eingabe
  python whisper_tiny.py audio.wav              # direkt als Argument
  python whisper_tiny.py audio.wav -l de        # Sprache festlegen (z.B. de, en)
  python whisper_tiny.py audio.wav --output     # Ergebnis als .txt speichern
"""

import subprocess
import sys
import os
import argparse
from pathlib import Path

# ─── Konfiguration ────────────────────────────────────────────────────────────
# Pfade anpassen, falls whisper.cpp woanders liegt
WHISPER_EXE  = r"whisper.cpp\build\bin\Release\whisper-cli.exe"  # oder "main.exe"
MODEL_PATH   = r"whisper.cpp\models\ggml-tiny.bin"
# ──────────────────────────────────────────────────────────────────────────────


def find_whisper_exe() -> str:
    """Sucht whisper-cli.exe / main.exe in bekannten Pfaden."""
    candidates = [
        WHISPER_EXE,
        "whisper.cpp\\main.exe",
        "whisper.cpp\\build\\bin\\Release\\main.exe",
        "whisper.cpp\\build\\bin\\Debug\\whisper-cli.exe",
        "main.exe",
        "whisper-cli.exe",
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return ""


def find_model() -> str:
    """Sucht das tiny-Modell in bekannten Pfaden."""
    candidates = [
        MODEL_PATH,
        "models\\ggml-tiny.bin",
        "ggml-tiny.bin",
        "whisper.cpp\\models\\ggml-tiny.bin",
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return ""


def transcribe(audio_file: str, language: str = "", save_output: bool = False) -> None:
    exe = find_whisper_exe()
    model = find_model()

    if not exe:
        print("[Fehler] whisper-cli.exe / main.exe nicht gefunden.")
        print("  Bitte WHISPER_EXE in diesem Skript anpassen oder whisper.cpp kompilieren.")
        print("  Anleitung: https://github.com/ggerganov/whisper.cpp")
        sys.exit(1)

    if not model:
        print("[Fehler] ggml-tiny.bin nicht gefunden.")
        print("  Modell herunterladen:")
        print("    cd whisper.cpp && python models/download-ggml-model.py tiny")
        sys.exit(1)

    if not os.path.isfile(audio_file):
        print(f"[Fehler] Audiodatei nicht gefunden: {audio_file}")
        sys.exit(1)

    cmd = [exe, "-m", model, "-f", audio_file, "--no-timestamps"]
    if language:
        cmd += ["-l", language]

    print(f"\n>>> Starte Transkription: {audio_file}")
    print(f"    Modell : {model}")
    print(f"    Sprache: {language or 'auto'}\n")

    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")

    text = result.stdout.strip()

    if result.returncode != 0 or not text:
        error_info = result.stderr.strip()
        print("[Fehler] whisper.cpp gab einen Fehler zurück:")
        print(error_info or "(keine Fehlermeldung)")
        sys.exit(1)

    print("─" * 60)
    print(text)
    print("─" * 60)

    if save_output:
        out_path = Path(audio_file).with_suffix(".txt")
        out_path.write_text(text, encoding="utf-8")
        print(f"\n[Gespeichert] {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Transkription mit whisper.cpp tiny")
    parser.add_argument("audio", nargs="?", help="Pfad zur Audiodatei (.wav empfohlen)")
    parser.add_argument("-l", "--language", default="", help="Sprache (z.B. de, en, fr) – Standard: auto")
    parser.add_argument("--output", action="store_true", help="Ergebnis als .txt neben der Audiodatei speichern")
    args = parser.parse_args()

    audio = args.audio
    if not audio:
        audio = input("Pfad zur Audiodatei: ").strip().strip('"')

    transcribe(audio, language=args.language, save_output=args.output)


if __name__ == "__main__":
    main()
