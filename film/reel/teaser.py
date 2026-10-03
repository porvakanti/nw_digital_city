#!/usr/bin/env python3
"""Build the teaser: a cut of the reel for leaders outside Networks.

    python3 film/reel/teaser.py              everything
    python3 film/reel/teaser.py audio        narration, captions, score and mix
    python3 film/reel/teaser.py picture      the picture only (the long part)
    python3 film/reel/teaser.py mux          join a finished picture and mix

teaser.json lists the spans of the reel the teaser is cut from, its own
narration, and the marks its score and graphics are keyed to. The picture is
the reel's own city and camera, rendered with capture.js --teaser; the
captions are timed here, from the synthesised narration, and burned in by
the director.

Output: film/out/Digital-City-Teaser.mp4, 1920x1080, 30 fps, AAC stereo.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
RNG = np.random.default_rng(11)
ROOT = HERE.parent.parent
OUT = ROOT / "film" / "out" / "teaser"
FINAL = ROOT / "film" / "out" / "Digital-City-Teaser.mp4"

sys.path.insert(0, str(HERE))
import build  # noqa: E402
import music  # noqa: E402
import voice  # noqa: E402

CUES = json.loads((HERE / "teaser.json").read_text())
SR = music.SR
LENGTH = CUES["length"]
TM = CUES["marks"]
BEAT = 60.0 / CUES["bpm"]

# The score's helpers write into buses the length of the reel; the teaser's
# are its own length.
music.N = int(LENGTH * SR)


# ------------------------------------------------------------------- voice

def speech(x: np.ndarray) -> tuple[int, int]:
    """First and last sample above the noise floor."""
    loud = np.where(np.abs(x) > 0.01)[0]
    return int(loud[0]), int(loud[-1])


def narration() -> tuple[np.ndarray, list[dict]]:
    """The voice on its marks, and how long each line actually speaks."""
    clips = voice.synthesise(CUES)
    n = int(LENGTH * SR)
    vo = np.zeros(n)
    spoken = []
    for line in CUES["lines"]:
        x = build.read_wav(clips[line["id"]])
        a, b = speech(x)
        x = x[max(0, a - int(0.02 * SR)):]
        i = int(line["at"] * SR)
        j = min(n, i + len(x))
        vo[i:j] += x[: j - i]
        spoken.append({"at": line["at"], "dur": (b - a) / SR, "text": line["text"],
                        "caption": line.get("caption", True)})
    vo = music.highpass(vo, 85)
    vo = vo + music.bandpass(vo, 2500, 6000) * 0.25
    vo = build.compress(vo, threshold=0.18, ratio=3.0)
    vo /= np.abs(vo).max() / 0.7
    room = music.reverb(np.vstack([vo, vo]), 0.9, 5000)
    return np.vstack([vo, vo]) + room * 0.07, spoken


def phrases(text: str, most: int = 44) -> list[str]:
    """A line broken into caption-sized phrases, at punctuation where it can."""
    # The narration is spelled for the voice; the captions as written.
    text = text.replace("A.I.", "AI").replace("V P and C", "VP&C").replace("gaymif", "gamif")
    parts = [p.strip() for p in re.split(r"(?<=[,.])\s+", text) if p.strip()]
    out: list[str] = []
    for p in parts:
        if out and len(out[-1]) + 1 + len(p) <= most:
            out[-1] += " " + p
        else:
            out.append(p)
    return out


def captions(spoken: list[dict]) -> list[dict]:
    """Each phrase on screen for its share of the line, by length."""
    caps = []
    for k, s in enumerate(spoken):
        # A line already on screen in big type needs no caption under it.
        if not s["caption"]:
            continue
        ps = phrases(s["text"])
        weights = np.array([len(p) for p in ps], float)
        edges = s["at"] + np.concatenate([[0], np.cumsum(weights)]) / weights.sum() * s["dur"]
        for i, p in enumerate(ps):
            end = edges[i + 1] + (0.35 if i == len(ps) - 1 else 0)
            if k + 1 < len(spoken):
                end = min(end, spoken[k + 1]["at"] - 0.05)
            caps.append({"a": round(float(edges[i]), 3), "b": round(float(end), 3), "text": p})
    return caps


# ------------------------------------------------------------------- score

def compose() -> dict[str, np.ndarray]:
    m = music
    drums, bass, pads, keys, fx = m.track(), m.track(), m.track(), m.track(), m.track()
    K = m.kick()
    kicks = []

    def add_kick(t, g=1.0):
        m.place(drums, K, t, 0.9 * g)
        kicks.append(t)

    def hit(t, g=0.8, length=3.0, swell=1.2):
        m.place(fx, m.reverse_swell(swell), t - swell, 0.55 * g)
        m.place(fx, m.boom(length), t, g)

    def pads_over(a, b, prog, origin, cutoff=2400, gain=0.55):
        for t in m.beats(a, b, 8 * BEAT, offset=origin % (8 * BEAT)):
            if t < a - 1e-6:
                continue
            ch, sub_note, _ = m.chord_at(t, prog, origin)
            L = min(8 * BEAT, b - t)
            m.place(pads, m.pad(ch, L, cutoff=cutoff, attack=0.3, release=0.6), t, gain)
            m.place(bass, m.sub(sub_note, L, 0.35), t)

    def layer(a, b, origin, *, kick_on=False, hats=False, hats16=False, clap_on=False,
              pulse=0.0, arp=0.0, prog=m.PROG_MINOR, intensity=1.0):
        for t in m.beats(a, b, BEAT, offset=origin % BEAT):
            if kick_on:
                add_kick(t, intensity)
            if hats:
                m.place(drums, m.hat(), t + BEAT / 2, 0.5 * intensity, pan=0.25)
            if hats16:
                m.place(drums, m.hat(), t + BEAT / 4, 0.22 * intensity, pan=-0.25)
                m.place(drums, m.hat(), t + 3 * BEAT / 4, 0.22 * intensity, pan=-0.25)
            if clap_on and round((t - origin) / BEAT) % 2 == 1:
                m.place(drums, m.clap(), t, 0.5 * intensity)
        if pulse:
            for t in m.beats(a, b, BEAT / 2, offset=origin % (BEAT / 2)):
                _, _, bass_note = m.chord_at(t, prog, origin)
                m.place(bass, m.bassnote(bass_note, BEAT / 2 * 0.9), t, 0.55 * pulse)
        if arp:
            for t in m.beats(a, b, BEAT / 4, offset=origin % (BEAT / 4)):
                ch, _, _ = m.chord_at(t, prog, origin)
                seq = m.ARP_MINOR.get(ch[0][:-1], m.ARP_MINOR["D"])
                step = round((t - origin) / (BEAT / 4))
                m.place(keys, m.pluck(m.hz(seq[step % 8]), 0.3, 2500 + 3000 * arp), t, 0.22 * arp,
                        pan=0.35 * np.sin(step * 0.7))

    title = TM["title"]
    # ---- the hook: a low drone and a riser, the question, then the hit.
    m.place(pads, m.pad(["D2", "A2", "D3"], title, cutoff=600, attack=0.6, release=0.4), 0.0, 0.8)
    m.place(bass, m.sub("D1", title, 0.4), 0.0)
    m.place(fx, m.boom(2.5), 0.05, 0.5)
    m.place(keys, m.bell(m.hz("A4"), 3.0), 0.45, 0.22)
    # The plots tick into place on the plan, faster and louder into the name.
    for t in m.beats(0.3, title - 0.1, BEAT / 4):
        g = 0.1 + 0.22 * t / title
        m.place(fx, m.tick(), t, g, pan=0.3 if round(t / (BEAT / 4)) % 2 else -0.3)
    m.place(fx, m.riser(title - 0.2), 0.2, 0.55)
    hit(title, 1.0, 4.0, 1.0)

    # ---- the title.
    m.place(pads, m.pad(["D3", "A3", "D4", "E4", "A4"], TM["draft"] - title, cutoff=2600, attack=0.3), title, 0.9)
    m.place(bass, m.sub("D1", TM["draft"] - title, 0.55), title)
    for t in m.beats(TM["title"], TM["draft"] - 0.4, BEAT * 2):
        add_kick(t, 0.8)

    # ---- the climb: every rung adds a layer.
    o = TM["draft"]
    hit(o, 0.6, 2.5)
    pads_over(o, TM["league"], m.PROG_MINOR, o, cutoff=1600, gain=0.5)
    layer(TM["draft"], TM["live"], o, pulse=0.6, hats=True, arp=0.4)
    layer(TM["live"], TM["used"], o, pulse=0.8, hats=True, kick_on=True, arp=0.6, intensity=0.85)
    layer(TM["used"], TM["top"], o, pulse=1.0, hats=True, hats16=True, kick_on=True, clap_on=True, arp=0.9)
    for k in ("live", "used"):
        m.place(fx, m.switch(), TM[k], 0.5)
    m.place(keys, m.bell(m.hz("A5"), 3.0), TM["ai"], 0.3)
    m.place(keys, m.bell(m.hz("E6"), 3.0), TM["ai"] + 0.12, 0.2)
    m.place(fx, m.riser(1.6), TM["top"] - 1.6, 0.5)
    hit(TM["top"] + 0.3, 1.0, 4.0, 0.8)
    layer(TM["top"] + 0.3, TM["league"] - 0.3, o, pulse=1.0, hats=True, kick_on=True, arp=1.0, intensity=1.0, prog=m.PROG_LIFT)

    # ---- the game sounds: a level up is a rising arpeggio, the achievement
    # a brighter one with a hit under it.
    def sting(at, notes, gain=0.3):
        for i, n in enumerate(notes):
            m.place(keys, m.pluck(m.hz(n), 0.5, 6000), at + i * 0.07, gain)
            m.place(keys, m.bell(m.hz(n), 1.5), at + i * 0.07, gain * 0.5)
    sting(TM["level1"], ["D5", "F5", "A5", "D6"])
    sting(TM["level2"], ["D5", "F5", "A5", "D6", "F6"])
    sting(TM["level3"], ["D5", "F#5", "A5", "D6", "F#6", "A6"], 0.32)
    sting(TM["achieve"], ["A5", "D6", "F#6", "A6", "D7"], 0.32)
    hit(TM["achieve"], 0.7, 3.0, 0.6)

    # ---- the league: the race, at full tilt, and the winner.
    o = TM["league"]
    hit(o, 0.8, 2.5, 0.9)
    pads_over(o, TM["atlas"], m.PROG_LIFT, o, cutoff=3200, gain=0.55)
    layer(o, TM["atlas"] - 0.3, o, kick_on=True, hats=True, hats16=True, clap_on=True, pulse=1.0, arp=1.0,
          intensity=1.1, prog=m.PROG_LIFT)
    for t in m.beats(TM["race"], TM["leader"], BEAT / 4):
        m.place(fx, m.tick(), t, 0.12, pan=0.4 if round(t / (BEAT / 4)) % 2 else -0.4)
    sting(TM["leader"], ["A5", "D6", "F#6", "A6"], 0.3)
    hit(TM["leader"], 0.6, 2.5, 0.5)

    # ---- Atlas: keys, the flight slowed to a long swell, the landing.
    o = TM["atlas"]
    m.place(pads, m.pad(["D3", "A3", "D4"], TM["fly"] - o, cutoff=1400, attack=0.1, release=0.3), o, 0.5)
    for t in m.beats(o, TM["fly"] - 0.3, BEAT):
        add_kick(t, 0.5)
    for i in range(len("Batteries")):
        m.place(fx, m.keyclick(), TM["ask"] + i * 0.07, 0.35 * (0.7 + 0.3 * RNG.random()), pan=RNG.uniform(-0.2, 0.2))
    flight = TM["land"] - TM["fly"]
    m.place(fx, m.riser(flight + 0.2), TM["fly"] - 0.2, 0.65)
    m.place(pads, m.pad(["D3", "A3", "D4", "E4", "A4"], flight, cutoff=2600, attack=0.4, release=0.6), TM["fly"], 0.7)
    m.place(bass, m.sub("D1", flight, 0.4), TM["fly"])
    hit(TM["land"], 0.9, 3.5, 0.6)
    # The deed is dealt: a card snap, then a bright chime.
    m.place(fx, m.switch(), TM["land"] + 0.35, 0.7)
    sting(TM["land"] + 0.55, ["D5", "F#5", "A5", "D6"], 0.25)
    m.place(fx, m.riser(1.4), TM["rising"] - 1.4, 0.45)

    # ---- the city rising.
    o = TM["rising"]
    hit(o, 0.9, 4.0, 1.0)
    m.place(fx, m.riser(TM["end"] - o), o, 0.35)
    pads_over(o, TM["end"], m.PROG_LIFT, o, cutoff=3600, gain=0.6)
    layer(o + 0.5, TM["end"] - 0.3, o, kick_on=True, hats=True, pulse=0.8, arp=0.8, intensity=0.9, prog=m.PROG_LIFT)

    # ---- the end card, and the lift to D major.
    o = TM["end"]
    hit(o, 1.0, 5.0, 1.2)
    rest = LENGTH - o
    m.place(pads, m.pad(["D3", "F#3", "A3", "D4", "F#4", "A4", "D5"], rest - 0.4, cutoff=4200, attack=0.05, release=1.5), o, 1.0)
    m.place(bass, m.sub("D1", rest - 0.3, 0.6), o)
    for i, n in enumerate(["F#5", "A5", "D6"]):
        m.place(keys, m.bell(m.hz(n), 4.0), TM["card"] + 1.0 + i * 0.3, 0.24 - i * 0.03)
    hit(TM["move"], 0.9, 3.0, 0.7)
    return {"drums": drums, "bass": bass, "pads": pads, "keys": keys, "fx": fx, "kicks": np.array(kicks)}


# ------------------------------------------------------------------- audio

def audio() -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    vo, spoken = narration()
    for s, nxt in zip(spoken, spoken[1:] + [{"at": LENGTH}]):
        if s["at"] + s["dur"] > nxt["at"] - 0.1:
            print(f"warning: {s['text'][:40]!r} runs to {s['at'] + s['dur']:.2f}s, next at {nxt['at']}")
    caps = captions(spoken)
    (OUT / "captions.json").write_text(json.dumps(caps, indent=1))
    score = music.mix(compose())
    score = np.tanh(score * 0.9)
    score /= np.abs(score).max()
    mix = score * build.duck(vo) * 0.62 + vo * 0.95
    tail = int(1.2 * SR)
    mix[:, -tail:] *= np.linspace(1, 0, tail) ** 2
    mix = build.limit(mix)
    mix /= np.abs(mix).max() / 0.89
    music.write_wav(OUT / "mix.wav", mix)
    music.write_wav(OUT / "music.wav", score * 0.89)
    music.write_wav(OUT / "voiceover.wav", vo * 0.95)
    print(f"wrote {OUT / 'mix.wav'} and {len(caps)} captions")
    return OUT / "mix.wav"


# ------------------------------------------------------------------- picture

def picture(jobs: int = 3) -> Path:
    """The cuts in `jobs` groups of about equal length, one browser each."""
    cuts = CUES["cuts"]
    groups: list[list[dict]] = [[] for _ in range(jobs)]
    share = LENGTH / jobs
    for c in cuts:
        groups[min(jobs - 1, int((c["at"] + 1e-6) // share))].append(c)
    groups = [g for g in groups if g]
    procs, files = [], []
    for i, g in enumerate(groups):
        f = OUT / f"part{i}.mp4"
        files.append(f)
        log = open(OUT / f"part{i}.log", "w")
        ids = ",".join(c["id"] for c in g)
        procs.append(subprocess.Popen(["node", str(HERE / "capture.js"), "--teaser", "--cuts", ids, "--out", str(f)],
                                      stdout=log, stderr=subprocess.STDOUT, cwd=ROOT))
        print(f"part {i}: {ids}")
    for p in procs:
        if p.wait():
            raise SystemExit(f"a part failed; see {OUT}/part*.log")
    listing = OUT / "parts.txt"
    listing.write_text("".join(f"file '{f}'\n" for f in files))
    path = OUT / "picture.mp4"
    subprocess.run([build.ffmpeg(), "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
                    "-c", "copy", str(path)], check=True)
    print(f"wrote {path}")
    return path


def mux(video_kbps: int = 4000) -> Path:
    """Two passes; under thirty megabytes at this length, so it can be sent."""
    log = OUT / "x264"
    common = ["-i", str(OUT / "picture.mp4"), "-c:v", "libx264", "-preset", "slow",
              "-b:v", f"{video_kbps}k", "-maxrate", f"{video_kbps * 2}k", "-bufsize", f"{video_kbps * 3}k",
              "-pix_fmt", "yuv420p", "-passlogfile", str(log)]
    ff = build.ffmpeg()
    subprocess.run([ff, "-v", "error", "-y", *common, "-pass", "1", "-an", "-f", "mp4", "/dev/null"], check=True)
    subprocess.run([ff, "-v", "error", "-y", *common[:2], "-i", str(OUT / "mix.wav"), *common[2:],
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
