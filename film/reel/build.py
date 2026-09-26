#!/usr/bin/env python3
"""Build the reel: narration, score, picture, and the mix of all three.

    python3 film/reel/build.py              everything
    python3 film/reel/build.py audio        narration, score and mix only
    python3 film/reel/build.py picture      the picture only (the long part)
    python3 film/reel/build.py mux          join a finished picture and mix

The picture is rendered in parts, one per browser, split at chapter changes
so a part's fast-forward is hidden by a cut. Parts run in parallel.

Output: film/out/NW-Digital-City-Reel.mp4, 1920x1080, 30 fps, AAC stereo.
"""

from __future__ import annotations

import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "film" / "out" / "reel"
FINAL = ROOT / "film" / "out" / "NW-Digital-City-Reel.mp4"
SR = 48000

sys.path.insert(0, str(HERE))
import voice  # noqa: E402
import music  # noqa: E402

CUES = json.loads((HERE / "cues.json").read_text())


def ffmpeg() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path)) as w:
        data = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32768
        if w.getnchannels() == 2:
            data = data.reshape(-1, 2).T
        assert w.getframerate() == SR, path
    return data


# ------------------------------------------------------------------- audio

def narration() -> np.ndarray:
    clips = voice.synthesise(CUES)
    n = int(CUES["length"] * SR)
    vo = np.zeros(n)
    for line in CUES["lines"]:
        x = read_wav(clips[line["id"]])
        # Trim the synthesiser's leading silence so a line lands on its mark.
        lead = np.argmax(np.abs(x) > 0.01)
        x = x[max(0, lead - int(0.02 * SR)):]
        i = int(line["at"] * SR)
        j = min(n, i + len(x))
        vo[i:j] += x[: j - i]
    # A voice for a big room: the mud out, a little presence, even level.
    vo = music.highpass(vo, 85)
    presence = music.bandpass(vo, 2500, 6000)
    vo = vo + presence * 0.25
    vo = compress(vo, threshold=0.18, ratio=3.0)
    vo /= np.abs(vo).max() / 0.7
    room = music.reverb(np.vstack([vo, vo]), 0.9, 5000)
    return np.vstack([vo, vo]) + room * 0.07


def compress(x: np.ndarray, threshold: float, ratio: float, attack: float = 0.005, release: float = 0.12) -> np.ndarray:
    level = np.abs(x)
    env = np.zeros_like(level)
    a = np.exp(-1 / (attack * SR))
    r = np.exp(-1 / (release * SR))
    e = 0.0
    # Envelope follower, a block at a time for speed: per-sample peak within
    # 64-sample blocks, then smoothed.
    block = 64
    peaks = level[: len(level) // block * block].reshape(-1, block).max(axis=1)
    out = np.zeros_like(peaks)
    ab, rb = a ** block, r ** block
    for k, p in enumerate(peaks):
        e = ab * e + (1 - ab) * p if p > e else rb * e + (1 - rb) * p
        out[k] = e
    env[: len(out) * block] = np.repeat(out, block)
    env[len(out) * block:] = out[-1] if len(out) else 0
    gain = np.ones_like(env)
    over = env > threshold
    gain[over] = (threshold + (env[over] - threshold) / ratio) / env[over]
    return x * gain


def duck(vo: np.ndarray, depth: float = 0.42, attack: float = 0.12, release: float = 0.6) -> np.ndarray:
    """Music gain: 1 in the clear, `depth` under the narration."""
    speaking = (np.abs(vo[0]) > 0.02).astype(float)
    # Hold across the gaps between words.
    hold = int(0.35 * SR)
    kernel = np.ones(hold)
    speaking = (np.convolve(speaking, kernel, "same") > 0).astype(float)
    g = 1 - (1 - depth) * speaking
    # Smooth: fast down, slow up.
    out = np.empty_like(g)
    e = 1.0
    a = np.exp(-1 / (attack * SR))
    r = np.exp(-1 / (release * SR))
    block = 48
    for k in range(0, len(g), block):
        target = g[k:k + block].min()
        coef = a if target < e else r
        coef_b = coef ** block
        e = coef_b * e + (1 - coef_b) * target
        out[k:k + block] = e
    return out


def limit(x: np.ndarray, ceiling: float = 0.89) -> np.ndarray:
    peak = np.abs(x).max(axis=0)
    # A look-ahead-free soft limiter: gain from a smoothed peak envelope.
    block = 96
    n = len(peak) // block * block
    blocks = peak[:n].reshape(-1, block).max(axis=1)
    env = np.zeros_like(blocks)
    e = 0.0
    rel = np.exp(-block / (0.08 * SR))
    for k, p in enumerate(blocks):
        e = max(p, e * rel)
        env[k] = e
    gain = np.minimum(1.0, ceiling / np.maximum(env, 1e-9))
    g = np.ones(len(peak))
    g[:n] = np.repeat(gain, block)
    if n < len(peak):
        g[n:] = gain[-1]
    return np.tanh(x * g / ceiling) * ceiling


def audio() -> Path:
    vo = narration()
    stems = music.compose()
    score = music.mix(stems)
    score = np.tanh(score * 0.9)
    score /= np.abs(score).max()
    g = duck(vo)
    mix = score * g * 0.62 + vo * 0.95
    # Fade the very end to silence with the picture.
    n = mix.shape[1]
    tail = int(0.9 * SR)
    mix[:, n - tail:] *= np.linspace(1, 0, tail) ** 2
    mix = limit(mix)
    mix /= np.abs(mix).max() / 0.89
    path = OUT / "mix.wav"
    music.write_wav(path, mix)
    music.write_wav(OUT / "music.wav", score * 0.89)
    rms = 20 * np.log10(np.sqrt((mix ** 2).mean()))
    print(f"wrote {path}  rms {rms:.1f} dBFS")
    return path


# ------------------------------------------------------------------- picture

def parts() -> list[tuple[float, float]]:
    m = CUES["marks"]
    cuts = [0.0, m["gap"], m["agent"], m["potential"], m["ask1"], CUES["length"]]
    return list(zip(cuts[:-1], cuts[1:]))


def picture(jobs: int = 2) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    pending = list(enumerate(parts()))
    running: list[subprocess.Popen] = []
    files = []
    for i, (a, b) in pending:
        files.append(OUT / f"part{i}.mp4")
    queue = list(pending)
    while queue or running:
        while queue and len(running) < jobs:
            i, (a, b) = queue.pop(0)
            log = open(OUT / f"part{i}.log", "w")
            running.append(subprocess.Popen(
                ["node", str(HERE / "capture.js"), "--from", str(a), "--to", str(b), "--out", str(files[i])],
                stdout=log, stderr=subprocess.STDOUT, cwd=ROOT))
            print(f"part {i}: {a:.1f}s to {b:.1f}s")
        for p in list(running):
            if p.poll() is not None:
                running.remove(p)
                if p.returncode:
                    raise SystemExit(f"a part failed; see {OUT}/part*.log")
        if running:
            try:
                running[0].wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
    listing = OUT / "parts.txt"
    listing.write_text("".join(f"file '{f}'\n" for f in files))
    path = OUT / "picture.mp4"
    subprocess.run([ffmpeg(), "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
                    "-c", "copy", str(path)], check=True)
    print(f"wrote {path}")
    return path


def mux(video_kbps: int = 3300) -> Path:
    """Two passes at a fixed average rate.

    The picture is a busy one, a city of small moving parts under a grain, and
    at a constant quality it comes out near ninety megabytes: more than a
    tracked file should carry. Two passes at 3.3 Mbps put it near fifty with
    no visible loss, because the bits go where the motion is.
    """
    log = OUT / "x264"
    common = ["-i", str(OUT / "picture.mp4"), "-c:v", "libx264", "-preset", "slow",
              "-b:v", f"{video_kbps}k", "-maxrate", f"{video_kbps * 2}k", "-bufsize", f"{video_kbps * 3}k",
              "-pix_fmt", "yuv420p", "-passlogfile", str(log)]
    subprocess.run([ffmpeg(), "-v", "error", "-y", *common, "-pass", "1", "-an", "-f", "mp4", "/dev/null"], check=True)
    subprocess.run([ffmpeg(), "-v", "error", "-y", *common[:2], "-i", str(OUT / "mix.wav"), *common[2:],
                    "-pass", "2", "-map", "0:v", "-map", "1:a", "-movflags", "+faststart",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", str(FINAL)], check=True)
    print(f"wrote {FINAL}  {FINAL.stat().st_size / 1e6:.0f} MB")
    return FINAL


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("all", "audio"):
        audio()
    if what in ("all", "picture"):
        picture()
    if what in ("all", "mux"):
        mux()
