#!/usr/bin/env python3
"""Build a demo film: narration, captions, score, picture, and the mix.

    python3 film/demos/build.py askava --frames <dir>           everything
    python3 film/demos/build.py askava audio                    narration, captions, score
    python3 film/demos/build.py askava picture --frames <dir>   the picture only
    python3 film/demos/build.py askava mux                      join picture and mix

<film>.json is the timeline: the shots, the narration and where each line
starts. The team's recording is passed as a folder of numbered frames and
never enters the repository. Output goes to film/out/demos/<film>/.

The series shares a voice, a type kit and a way of scoring; each film has its
own tempo and accent, and the score answers its own shots: a key click for
every typed letter, a lift when an answer lands.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "film" / "reel"))
import build as reel  # noqa: E402
import music  # noqa: E402
import voice  # noqa: E402

SR = music.SR
RNG = np.random.default_rng(5)


def load(film: str) -> dict:
    cfg = json.loads((HERE / f"{film}.json").read_text())
    music.N = int(cfg["length"] * SR)
    music.BEAT = 60.0 / cfg["bpm"]
    return cfg


# ------------------------------------------------------------------- voice

def narration(cfg: dict) -> tuple[np.ndarray, list[dict]]:
    clips = voice.synthesise(cfg)
    n = int(cfg["length"] * SR)
    vo = np.zeros(n)
    spoken = []
    for line in cfg["lines"]:
        x = reel.read_wav(clips[line["id"]])
        loud = np.where(np.abs(x) > 0.01)[0]
        a, b = int(loud[0]), int(loud[-1])
        x = x[max(0, a - int(0.02 * SR)):]
        i = int(line["at"] * SR)
        j = min(n, i + len(x))
        vo[i:j] += x[: j - i]
        spoken.append({"at": line["at"], "dur": (b - a) / SR, "text": line["text"],
                       "caption": line.get("caption", True)})
    vo = music.highpass(vo, 85)
    vo = vo + music.bandpass(vo, 2500, 6000) * 0.25
    vo = reel.compress(vo, threshold=0.18, ratio=3.0)
    vo /= np.abs(vo).max() / 0.7
    room = music.reverb(np.vstack([vo, vo]), 0.9, 5000)
    return np.vstack([vo, vo]) + room * 0.07, spoken


def phrases(text: str, most: int = 46) -> list[str]:
    text = text.replace("A.I.", "AI")
    parts = [p.strip() for p in re.split(r"(?<=[,.])\s+", text) if p.strip()]
    out: list[str] = []
    for p in parts:
        if out and len(out[-1]) + 1 + len(p) <= most:
            out[-1] += " " + p
        else:
            out.append(p)
    return out


def captions(spoken: list[dict]) -> list[dict]:
    caps = []
    for k, s in enumerate(spoken):
        if not s["caption"]:
            continue
        ps = phrases(s["text"])
        w = np.array([len(p) for p in ps], float)
        edges = s["at"] + np.concatenate([[0], np.cumsum(w)]) / w.sum() * s["dur"]
        for i, p in enumerate(ps):
            end = edges[i + 1] + (0.35 if i == len(ps) - 1 else 0)
            if k + 1 < len(spoken):
                end = min(end, spoken[k + 1]["at"] - 0.05)
            caps.append({"a": round(float(edges[i]), 3), "b": round(float(end), 3), "text": p})
    return caps


# ------------------------------------------------------------------- score

def compose(cfg: dict) -> dict:
    m = music
    BEAT = m.BEAT
    L = cfg["length"]
    cuts = {c["id"]: c for c in cfg["cuts"]}
    drums, bass, pads, keys, fx = m.track(), m.track(), m.track(), m.track(), m.track()
    K = m.kick()
    kicks = []

    def add_kick(t, g=1.0):
        m.place(drums, K, t, 0.9 * g)
        kicks.append(t)

    def hit(t, g=0.8, length=3.0, swell=1.0):
        m.place(fx, m.reverse_swell(swell), t - swell, 0.5 * g)
        m.place(fx, m.boom(length), t, g)

    def groove(a, b, *, kick=True, hats=True, hats16=False, clap=False, pulse=0.6, arp=0.5, gain=0.8):
        for t in m.beats(a, b, BEAT):
            if kick:
                add_kick(t, gain)
            if hats:
                m.place(drums, m.hat(), t + BEAT / 2, 0.45 * gain, pan=0.25)
            if hats16:
                m.place(drums, m.hat(), t + BEAT / 4, 0.2 * gain, pan=-0.25)
                m.place(drums, m.hat(), t + 3 * BEAT / 4, 0.2 * gain, pan=-0.25)
            if clap and round((t - a) / BEAT) % 2 == 1:
                m.place(drums, m.clap(), t, 0.45 * gain)
        for t in m.beats(a, b, BEAT / 2):
            _, _, note = m.chord_at(t, m.PROG_LIFT, a)
            m.place(bass, m.bassnote(note, BEAT / 2 * 0.9), t, 0.5 * pulse)
        for t in m.beats(a, b, BEAT / 4):
            ch, _, _ = m.chord_at(t, m.PROG_LIFT, a)
            seq = m.ARP_MINOR.get(ch[0][:-1], m.ARP_MINOR["D"])
            step = round((t - a) / (BEAT / 4))
            m.place(keys, m.pluck(m.hz(seq[step % 8]), 0.3, 2500 + 3000 * arp), t, 0.2 * arp,
                    pan=0.35 * np.sin(step * 0.7))

    def pads_over(a, b, cutoff=2400, gain=0.5):
        for t in m.beats(a, b, 8 * BEAT):
            ch, sub_note, _ = m.chord_at(t, m.PROG_LIFT, a)
            span = min(8 * BEAT, b - t)
            m.place(pads, m.pad(ch, span, cutoff=cutoff, attack=0.3, release=0.6), t, gain)
            m.place(bass, m.sub(sub_note, span, 0.3), t)

    first = cfg["cuts"][1]["at"]
    m.place(pads, m.pad(["D2", "A2", "D3"], first, cutoff=700, attack=1.5, release=0.6), 0.0, 0.7)
    m.place(fx, m.riser(first - 0.3), 0.3, 0.5)
    for i in range(6):
        m.place(keys, m.bell(m.hz(["A5", "D6", "E6", "F6", "A6", "D7"][i]), 2.0), 0.5 + i * 0.5, 0.14)
    hit(first, 0.9, 4.0)
    pads_over(first, L - 1.0, cutoff=2600, gain=0.5)

    # The groove runs from the first question to the end card.
    ends = cuts.get("end", {"at": L})["at"]
    asks = [c for c in cfg["cuts"] if c["id"] in cfg.get("questions", {})]
    start = asks[0]["at"] if asks else first
    groove(start, ends - 0.3, pulse=0.6, arp=0.45, gain=0.7)
    if "value" in cuts:
        v = cuts["value"]
        groove(v["at"], v["at"] + v["dur"] - 0.3, hats16=True, clap=True, pulse=0.9, arp=0.9, gain=0.9)
        hit(v["at"], 0.8, 3.0)

    # A key click per letter typed, a whoosh as the question is sent.
    for c in asks:
        q = cfg["questions"][c["id"]]
        per = min(0.045, (c["dur"] - 0.9) / len(q))
        for i in range(len(q)):
            m.place(fx, m.keyclick(), c["at"] + 0.25 + i * per, 0.3 * (0.7 + 0.3 * RNG.random()),
                    pan=RNG.uniform(-0.2, 0.2))
        m.place(fx, m.reverse_swell(0.5), c["at"] + c["dur"] - 0.5, 0.35)
    # A bright chime where each answer lands.
    for c in cfg["cuts"]:
        if c["id"].endswith("ans"):
            for i, n in enumerate(["D6", "F#6", "A6"]):
                m.place(keys, m.bell(m.hz(n), 2.0), c["at"] + 0.05 + i * 0.06, 0.16)

    if "end" in cuts:
        e = cuts["end"]["at"]
        hit(e, 1.0, 5.0)
        m.place(pads, m.pad(["D3", "F#3", "A3", "D4", "F#4", "A4", "D5"], L - e - 0.3, cutoff=4200, attack=0.05, release=1.5), e, 0.9)
        m.place(bass, m.sub("D1", L - e - 0.3, 0.6), e)
        for i, n in enumerate(["F#5", "A5", "D6"]):
            m.place(keys, m.bell(m.hz(n), 4.0), e + 0.6 + i * 0.4, 0.22)
    return {"drums": drums, "bass": bass, "pads": pads, "keys": keys, "fx": fx, "kicks": np.array(kicks)}


# ------------------------------------------------------------------- build

def audio(film: str, cfg: dict, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    vo, spoken = narration(cfg)
    for s, nxt in zip(spoken, spoken[1:] + [{"at": cfg["length"]}]):
        if s["at"] + s["dur"] > nxt["at"] - 0.1:
            print(f"warning: {s['text'][:40]!r} runs to {s['at'] + s['dur']:.2f}s, next at {nxt['at']}")
    (out / "captions.json").write_text(json.dumps(captions(spoken), indent=1))
    score = music.mix(compose(cfg))
    score = np.tanh(score * 0.9)
    score /= np.abs(score).max()
    mix = score * reel.duck(vo) * 0.6 + vo * 0.95
    tail = int(1.0 * SR)
    mix[:, -tail:] *= np.linspace(1, 0, tail) ** 2
    mix = reel.limit(mix)
    mix /= np.abs(mix).max() / 0.89
    music.write_wav(out / "mix.wav", mix)
    music.write_wav(out / "music.wav", score * 0.89)
    music.write_wav(out / "voiceover.wav", vo * 0.95)
    print(f"wrote {out / 'mix.wav'}")


def picture(film: str, frames: str, out: Path) -> None:
    subprocess.run(["node", str(HERE / "render.js"), film, "--frames", frames, "--out", str(out / "picture.mp4")],
                   check=True, cwd=ROOT)


def mux(film: str, out: Path, kbps: int = 4500) -> Path:
    ff = reel.ffmpeg()
    final = out / f"{film}.mp4"
    common = ["-i", str(out / "picture.mp4"), "-c:v", "libx264", "-preset", "slow", "-b:v", f"{kbps}k",
              "-maxrate", f"{kbps * 2}k", "-bufsize", f"{kbps * 3}k", "-pix_fmt", "yuv420p", "-passlogfile", str(out / "x264")]
    subprocess.run([ff, "-v", "error", "-y", *common, "-pass", "1", "-an", "-f", "mp4", "/dev/null"], check=True)
    subprocess.run([ff, "-v", "error", "-y", *common[:2], "-i", str(out / "mix.wav"), *common[2:], "-pass", "2",
                    "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                    "-shortest", str(final)], check=True)
    print(f"wrote {final}  {final.stat().st_size / 1e6:.0f} MB")
    return final


if __name__ == "__main__":
    film = sys.argv[1]
    what = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else "all"
    frames = sys.argv[sys.argv.index("--frames") + 1] if "--frames" in sys.argv else None
    cfg = load(film)
    out = ROOT / "film" / "out" / "demos" / film
    if what in ("all", "audio"):
        audio(film, cfg, out)
    if what in ("all", "picture"):
        picture(film, frames, out)
    if what in ("all", "mux"):
        mux(film, out)
