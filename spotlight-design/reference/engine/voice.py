"""The narration: one neural text-to-speech clip per line in cues.json.

Each clip is cached under film/out/reel/vo by a hash of its text and voice,
so re-running only re-synthesises the lines that changed. Reports each line's
length and fails if one would run into the next.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "film" / "out" / "reel" / "vo"
SR = 48000


def ffmpeg() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def _trust_proxy_ca() -> None:
    # edge-tts builds its TLS context from certifi. Behind a re-terminating
    # proxy the bundle it needs is the one the environment names.
    bundle = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
    if Path(bundle).exists():
        import certifi
        certifi.where = lambda: bundle


async def _speak(text: str, voice: str, rate: str, pitch: str, into: Path) -> None:
    import edge_tts
    await edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(str(into))


def synthesise(cues: dict) -> dict[str, Path]:
    OUT.mkdir(parents=True, exist_ok=True)
    _trust_proxy_ca()
    clips = {}
    for line in cues["lines"]:
        voice = line.get("voice", cues["voice"])
        key = hashlib.sha1(f"{voice}|{cues['rate']}|{cues['pitch']}|{line['text']}".encode()).hexdigest()[:12]
        wav = OUT / f"{line['id']}-{key}.wav"
        if not wav.exists():
            mp3 = wav.with_suffix(".mp3")
            asyncio.run(_speak(line["text"], voice, cues["rate"], cues["pitch"], mp3))
            subprocess.run([ffmpeg(), "-v", "error", "-y", "-i", str(mp3),
                            "-ar", str(SR), "-ac", "1", str(wav)], check=True)
            mp3.unlink()
        clips[line["id"]] = wav
    return clips


def length(wav: Path) -> float:
    import wave
    with wave.open(str(wav)) as w:
        return w.getnframes() / w.getframerate()


if __name__ == "__main__":
    cues = json.loads((HERE / "cues.json").read_text())
    clips = synthesise(cues)
    lines = cues["lines"]
    bad = False
    for i, line in enumerate(lines):
        n = length(clips[line["id"]])
        end = line["at"] + n
        nxt = lines[i + 1]["at"] if i + 1 < len(lines) else cues["length"]
        flag = "" if end <= nxt - 0.15 else "  <-- overruns"
        bad |= bool(flag)
        print(f"{line['id']} {line['at']:6.1f} + {n:4.1f} = {end:6.1f}  (next {nxt:6.1f}){flag}")
    raise SystemExit(1 if bad else 0)
