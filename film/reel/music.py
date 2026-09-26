"""The score, synthesised from nothing, so there is no licence to clear.

120 bpm in D minor, cut to the same marks as the picture (cues.json), with a
hit on every chapter change, a riser into each, the lights going out on a
switch and a silence, and a lift to a major chord at the end.

    python3 film/reel/music.py            writes film/out/reel/music.wav
"""

from __future__ import annotations

import json
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter, sosfilt

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "film" / "out" / "reel"
SR = 48000
RNG = np.random.default_rng(7)

CUES = json.loads((HERE / "cues.json").read_text())
M = CUES["marks"]
LENGTH = CUES["length"]
BEAT = 60.0 / CUES["bpm"]
N = int(LENGTH * SR)


def hz(note: str) -> float:
    names = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6,
             "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
    name, octave = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((names[name] + 12 * (octave + 1) - 69) / 12)


def track() -> np.ndarray:
    return np.zeros((2, N))


def place(bus: np.ndarray, sig: np.ndarray, at: float, gain: float = 1.0, pan: float = 0.0) -> None:
    """Add a mono or stereo signal into a bus at a time in seconds."""
    i = int(at * SR)
    if i >= N:
        return
    if sig.ndim == 1:
        left = np.cos((pan + 1) * np.pi / 4)
        right = np.sin((pan + 1) * np.pi / 4)
        sig = np.vstack([sig * left * 1.414, sig * right * 1.414])
    j = min(N, i + sig.shape[1])
    if i < 0:
        sig = sig[:, -i:]
        i = 0
        j = min(N, sig.shape[1])
    bus[:, i:j] += sig[:, : j - i] * gain


def env(n: int, a: float, d: float, s: float = 0.0, r: float = 0.0, hold: float | None = None) -> np.ndarray:
    """Attack, decay to sustain, hold, release: times in seconds."""
    t = np.arange(n) / SR
    e = np.ones(n) * s
    e[t < a] = t[t < a] / max(a, 1e-4)
    mask = (t >= a) & (t < a + d)
    e[mask] = 1 - (1 - s) * (t[mask] - a) / max(d, 1e-4)
    if hold is not None and r > 0:
        rel = t >= hold
        e[rel] = e[rel] * np.clip(1 - (t[rel] - hold) / r, 0, 1)
    return e


def lowpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    sos = butter(order, min(cutoff, SR * 0.45), "low", fs=SR, output="sos")
    return sosfilt(sos, x, axis=-1)


def highpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    sos = butter(order, cutoff, "high", fs=SR, output="sos")
    return sosfilt(sos, x, axis=-1)


def bandpass(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    sos = butter(order, [lo, min(hi, SR * 0.45)], "band", fs=SR, output="sos")
    return sosfilt(sos, x, axis=-1)


def sweep_lowpass(x: np.ndarray, start: float, end: float, block: int = 512) -> np.ndarray:
    """A lowpass whose cutoff moves exponentially from start to end."""
    out = np.zeros_like(x)
    zi = None
    blocks = max(1, int(np.ceil(x.shape[-1] / block)))
    for k in range(blocks):
        f = start * (end / start) ** (k / max(1, blocks - 1))
        b, a = butter(2, min(f, SR * 0.45), "low", fs=SR)
        seg = x[..., k * block:(k + 1) * block]
        if zi is None:
            zi = np.zeros(seg.shape[:-1] + (2,))
        y, zi = lfilter(b, a, seg, axis=-1, zi=zi)
        out[..., k * block:(k + 1) * block] = y
    return out


def saw(freq: float, n: int, phase: float = 0.0) -> np.ndarray:
    t = np.arange(n) / SR
    # A band-limited-ish saw: sum of harmonics up to the Nyquist.
    y = np.zeros(n)
    k = 1
    while freq * k < SR * 0.45 and k < 40:
        y += np.sin(2 * np.pi * freq * k * t + phase * k) / k
        k += 1
    return y * 0.6


def supersaw(freq: float, n: int, voices: int = 7, detune: float = 0.012) -> np.ndarray:
    out = np.zeros((2, n))
    for v in range(voices):
        d = (v - (voices - 1) / 2) / ((voices - 1) / 2) * detune
        # Naive saws: every pad goes through a lowpass well below where the
        # aliasing would be heard, and this is forty times cheaper.
        ph = (np.arange(n) * freq * (1 + d) / SR + RNG.uniform(0, 1)) % 1.0
        s = (2 * ph - 1) * 0.6
        pan = (v / (voices - 1)) * 2 - 1
        out[0] += s * np.cos((pan * 0.8 + 1) * np.pi / 4)
        out[1] += s * np.sin((pan * 0.8 + 1) * np.pi / 4)
    return out / voices


# ---------------------------------------------------------------- instruments

def kick(gain: float = 1.0) -> np.ndarray:
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 6.5)
    click = highpass(RNG.normal(0, 1, n), 2000) * np.exp(-t * 200) * 0.25
    return np.tanh((body + click) * 1.6) * gain


def boom(length: float = 3.5) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 32 + 70 * np.exp(-t * 7)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.3)
    noise = lowpass(RNG.normal(0, 1, n), 900) * np.exp(-t * 5) * 0.5
    crack = highpass(RNG.normal(0, 1, n), 3000) * np.exp(-t * 30) * 0.35
    return np.tanh((body * 1.2 + noise + crack) * 1.3)


def clap() -> np.ndarray:
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = bandpass(RNG.normal(0, 1, n), 900, 5000)
    e = np.zeros(n)
    for off in (0.0, 0.011, 0.023):
        m = t >= off
        e[m] += np.exp(-(t[m] - off) * (60 if off < 0.02 else 14))
    return noise * e * 0.7


def hat(open_: bool = False) -> np.ndarray:
    n = int((0.3 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return highpass(RNG.normal(0, 1, n), 7000) * np.exp(-t * (14 if open_ else 70)) * 0.35


def tick() -> np.ndarray:
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 3200 * t) * np.exp(-t * 260) * 0.5


def keyclick() -> np.ndarray:
    n = int(0.04 * SR)
    t = np.arange(n) / SR
    return bandpass(RNG.normal(0, 1, n), 1500, 6000) * np.exp(-t * 180) * 0.5


def pluck(freq: float, length: float = 0.35, bright: float = 4500) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    s = saw(freq, n) * 0.7 + np.sin(2 * np.pi * freq * 2 * t) * 0.2
    e = np.exp(-t * 11)
    return sweep_lowpass(s * e, bright, 500) * 0.8


def bell(freq: float, length: float = 4.0) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * 2.2 * np.exp(-t * 2)
    y = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t * 1.2)
    y += np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t * 3) * 0.25
    return y * 0.6


def switch() -> np.ndarray:
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    c1 = bandpass(RNG.normal(0, 1, n), 600, 4000) * np.exp(-t * 90)
    thunk = np.sin(2 * np.pi * 90 * t) * np.exp(-t * 25)
    return (c1 * 0.8 + thunk * 0.9)


def riser(length: float) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    noise = np.vstack([RNG.normal(0, 1, n), RNG.normal(0, 1, n)])
    y = sweep_lowpass(noise, 300, 9000) * (t / length) ** 2.2
    # A pitched whine under it.
    f = 200 * (8 ** (t / length))
    y += np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / length) ** 3 * 0.15
    return y * 0.5


def reverse_swell(length: float = 1.6) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    cym = highpass(RNG.normal(0, 1, (2, n)), 4000) * np.exp(-t * 2.5)
    return cym[:, ::-1] * 0.5


def pad(notes: list[str], length: float, cutoff: float = 2200, attack: float = 0.8, release: float = 1.2) -> np.ndarray:
    n = int((length + release) * SR)
    y = np.zeros((2, n))
    for note in notes:
        y += supersaw(hz(note), n)
    y = lowpass(y, cutoff, 2)
    e = env(n, attack, 0.5, 0.85, release, hold=length)
    return y * e / max(1, len(notes)) * 1.6


def sub(note: str, length: float, gain: float = 1.0) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * hz(note) * t)
    return np.tanh(y * 1.4) * env(n, 0.02, 0.1, 0.9, 0.08, hold=length - 0.08) * gain


def bassnote(note: str, length: float) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    s = saw(hz(note), n) + np.sin(2 * np.pi * hz(note) * t) * 0.8
    e = env(n, 0.005, 0.12, 0.55, 0.04, hold=length - 0.04)
    return lowpass(s * e, 700) * 0.9


# ---------------------------------------------------------------- the chords

PROG_MINOR = [  # i – VI – III – VII in D minor, one chord per two bars
    (["D3", "F3", "A3", "D4"], "D1", "D2"),
    (["Bb2", "D3", "F3", "Bb3"], "Bb0", "Bb1"),
    (["F3", "A3", "C4", "F4"], "F1", "F2"),
    (["C3", "E3", "G3", "C4"], "C1", "C2"),
]
PROG_LIFT = [  # VI – VII – i – III, then the lift
    (["Bb2", "D3", "F3", "A3", "D4"], "Bb0", "Bb1"),
    (["C3", "E3", "G3", "D4"], "C1", "C2"),
    (["D3", "F3", "A3", "E4"], "D1", "D2"),
    (["F3", "A3", "C4", "G4"], "F1", "F2"),
]
ARP_MINOR = {"D": ["D4", "F4", "A4", "D5", "A4", "F4", "E4", "F4"],
             "Bb": ["D4", "F4", "Bb4", "D5", "Bb4", "F4", "D4", "F4"],
             "F": ["C4", "F4", "A4", "C5", "A4", "F4", "C4", "F4"],
             "C": ["C4", "E4", "G4", "C5", "G4", "E4", "D4", "E4"]}


def chord_at(t: float, prog: list, origin: float = 0.0) -> tuple:
    k = int((t - origin) // (4 * BEAT * 2)) % len(prog)
    return prog[k]


def beats(a: float, b: float, every: float = BEAT, offset: float = 0.0):
    t = np.ceil((a - offset) / every - 1e-9) * every + offset
    while t < b - 1e-9:
        yield round(t, 6)
        t += every


# ---------------------------------------------------------------- the score

def compose() -> dict[str, np.ndarray]:
    drums, bass, pads, keys, fx = track(), track(), track(), track(), track()
    K = kick()
    kicks = []  # for the sidechain

    def add_kick(t, g=1.0):
        place(drums, K, t, 0.9 * g)
        kicks.append(t)

    # ---- intro: 0 to the reveal. A drone, and the data ticking.
    place(pads, pad(["D2", "A2", "D3"], M["reveal"] - 0.4, cutoff=500, attack=4.0, release=1.5), 0.0, 0.8)
    place(bass, sub("D1", M["reveal"] + 0.2, 0.35), 0.0)
    for t in beats(2.6, M["reveal"] - 1.5, BEAT / 4):
        g = 0.18 if (round(t / (BEAT / 4)) % 4) else 0.32
        place(fx, tick(), t, g, pan=0.3 if round(t / (BEAT / 4)) % 2 else -0.3)
    for t in (2.6, 8.0):
        place(fx, boom(2.5), t, 0.35)
    place(fx, riser(3.5), M["reveal"] - 3.5, 0.55)
    place(fx, reverse_swell(1.6), M["reveal"] - 1.6, 0.6)

    # ---- the reveal and the title.
    place(fx, boom(4.0), M["reveal"], 0.9)
    place(pads, pad(["D3", "A3", "D4", "F4", "A4"], M["grammar"] - M["reveal"] - 0.2, cutoff=2600, attack=0.3), M["reveal"], 0.9)
    place(bass, sub("D1", M["grammar"] - M["reveal"], 0.55), M["reveal"])
    for t in beats(M["reveal"] + 2.0, M["grammar"] - 0.5, BEAT * 2):
        add_kick(t, 0.8)
    place(fx, reverse_swell(1.2), M["grammar"] - 1.2, 0.6)

    def groove(a, b, intensity=1.0, clap_on=True, arp=True, hats16=False, origin=None):
        origin = a if origin is None else origin
        for t in beats(a, b, BEAT):
            add_kick(t, intensity)
            place(drums, hat(), t + BEAT / 2, 0.55 * intensity, pan=0.25)
            if hats16:
                place(drums, hat(), t + BEAT / 4, 0.25 * intensity, pan=-0.25)
                place(drums, hat(), t + 3 * BEAT / 4, 0.25 * intensity, pan=-0.25)
            beat_no = round((t - origin) / BEAT)
            if clap_on and beat_no % 2 == 1:
                place(drums, clap(), t, 0.55 * intensity)
        for t in beats(a, b, BEAT / 2):
            ch, sub_note, bass_note = chord_at(t, PROG_MINOR, origin)
            place(bass, bassnote(bass_note, BEAT / 2 * 0.9), t, 0.55 * intensity)
        for t in beats(a, b, 8 * BEAT):
            ch, sub_note, _ = chord_at(t, PROG_MINOR, origin)
            L = min(8 * BEAT, b - t)
            place(pads, pad(ch, L, cutoff=1800 + 1400 * intensity, attack=0.25, release=0.6), t, 0.55)
            place(bass, sub(sub_note, L, 0.35), t)
        if arp:
            for t in beats(a, b, BEAT / 4):
                ch, _, _ = chord_at(t, PROG_MINOR, origin)
                root = ch[0][:-1]
                seq = ARP_MINOR.get(root, ARP_MINOR["D"])
                step = round((t - origin) / (BEAT / 4))
                place(keys, pluck(hz(seq[step % 8]), 0.3, 3000 + 2500 * intensity), t, 0.22 * intensity,
                      pan=0.35 * np.sin(step * 0.7))

    # ---- the language of the city.
    place(fx, boom(3.0), M["grammar"], 0.7)
    groove(M["grammar"], M["written"], 0.8, clap_on=False, origin=M["grammar"])
    for t in (M["tower"], M["hotel"], M["roof"]):
        place(fx, boom(1.5), t, 0.35)
        place(fx, reverse_swell(0.8), t - 0.8, 0.35)

    # ---- forty-four written; then the lights go out.
    place(pads, pad(["D3", "F3", "A3", "C4"], M["lightsOff"] - M["written"], cutoff=900, attack=0.4, release=0.2), M["written"], 0.8)
    place(bass, sub("D1", M["lightsOff"] - M["written"], 0.45), M["written"])
    for t in beats(M["written"], M["lightsOff"] - 0.5, BEAT / 2):
        place(keys, pluck(hz("A4" if round(t / (BEAT / 2)) % 2 else "D5"), 0.2, 2000), t, 0.16)
    place(fx, riser(3.2), M["lightsOff"] - 3.2, 0.5)
    place(fx, switch(), M["lightsOff"] - 0.02, 1.1)
    place(fx, boom(4.5), M["lightsOff"], 0.75)

    # ---- in the dark: a heartbeat, and a bell for the four.
    place(pads, pad(["D2", "A2", "E3"], M["gap"] - M["lightsOff"] - 1.0, cutoff=420, attack=2.5, release=1.0), M["lightsOff"] + 0.4, 0.9)
    for t in beats(M["lightsOff"] + 1.0, M["gap"] - 1.5, 1.0):
        place(drums, kick(0.55), t, 0.7)
        place(drums, kick(0.35), t + 0.22, 0.5)
        kicks.append(t)
    for i in range(4):
        place(keys, bell(hz(["A5", "D6", "F5", "A5"][i]), 3.5), M["lightsOff"] + 0.8 + i * 0.45, 0.16, pan=[-0.4, 0.4, -0.2, 0.2][i])
    place(keys, bell(hz("D5"), 5.0), M["four"], 0.35)
    place(fx, riser(2.2), M["gap"] - 2.2, 0.6)
    place(fx, reverse_swell(1.2), M["gap"] - 1.2, 0.6)

    # ---- where the money is: the full groove.
    place(fx, boom(3.0), M["gap"], 0.9)
    groove(M["gap"], M["agent"], 1.0, clap_on=True, hats16=True, origin=M["gap"])
    place(fx, boom(2.0), M["gapWide"], 0.5)
    place(fx, riser(2.5), M["agent"] - 2.5, 0.55)

    # ---- ask the city: lighter, and the keys typing.
    place(fx, boom(2.5), M["agent"], 0.6)
    groove(M["agent"], M["potential"] - 0.5, 0.6, clap_on=False, origin=M["agent"])
    q = "Where are the biggest gaps?"
    for i in range(len(q)):
        place(fx, keyclick(), M["agent"] + 0.9 + i * 0.055, 0.35 * (0.7 + 0.3 * RNG.random()), pan=RNG.uniform(-0.2, 0.2))
    place(fx, riser(2.0), M["potential"] - 2.0, 0.55)
    place(fx, reverse_swell(1.2), M["potential"] - 1.2, 0.55)

    # ---- the city we could be: the lift.
    place(fx, boom(4.0), M["potential"], 0.8)
    for t in beats(M["potential"], M["ask1"], 8 * BEAT):
        ch, sub_note, _ = chord_at(t, PROG_LIFT, M["potential"])
        L = min(8 * BEAT, M["ask1"] - t)
        bright = 1400 + 3200 * (t - M["potential"]) / (M["ask1"] - M["potential"])
        place(pads, pad(ch + [ch[-1][:-1] + str(int(ch[-1][-1]) + 1)], L, cutoff=bright, attack=0.6, release=0.8), t, 0.75)
        place(bass, sub(sub_note, L, 0.45), t)
    for t in beats(M["potential"] + 0.5, M["ask1"], BEAT / 2):
        ch, _, _ = chord_at(t, PROG_LIFT, M["potential"])
        notes = [n[:-1] + str(int(n[-1]) + 2) for n in ch[1:4]]
        step = round((t - M["potential"]) / (BEAT / 2))
        place(keys, bell(hz(notes[step % 3]), 1.2), t, 0.07, pan=0.5 * np.sin(step))
    for t in beats(M["score"], M["lift"] - 2.0, BEAT):
        if round((t - M["score"]) / BEAT) % 2 == 0:
            add_kick(t, 0.75)
        else:
            place(drums, clap(), t, 0.4)
    # A roll into the lift.
    roll = 0.0
    for t in beats(M["lift"] - 2.0, M["lift"], BEAT / 4):
        roll += 1
        place(drums, clap(), t, 0.15 + 0.35 * roll / 16)
    place(fx, boom(4.0), M["lift"], 0.8)
    for t in beats(M["lift"], M["ask1"] - 0.4, BEAT):
        add_kick(t, 0.85)
        place(drums, hat(), t + BEAT / 2, 0.5)
    place(fx, riser(2.0), M["ask1"] - 2.0, 0.6)

    # ---- four asks: the climax, a hit on every cut.
    groove(M["ask1"], M["finale"], 1.15, clap_on=True, hats16=True, origin=M["ask1"])
    for k in ("ask1", "ask2", "ask3", "ask4"):
        place(fx, boom(2.0), M[k], 0.75)
        place(drums, hat(True), M[k], 0.6)
    place(fx, riser(2.0), M["finale"] - 2.0, 0.6)
    place(fx, reverse_swell(1.4), M["finale"] - 1.4, 0.6)

    # ---- the sign-off, and the lift to D major.
    place(fx, boom(4.0), M["finale"], 0.9)
    place(pads, pad(["Bb2", "D3", "F3", "Bb3", "D4", "F4"], 2 * BEAT * 2 + 0.2, cutoff=3500, attack=0.1, release=0.4), M["finale"], 0.9)
    place(pads, pad(["C3", "E3", "G3", "C4", "E4", "G4"], M["end"] - M["finale"] - 2 * BEAT * 2, cutoff=3800, attack=0.2, release=0.3), M["finale"] + 2 * BEAT * 2, 0.9)
    place(bass, sub("Bb0", 2 * BEAT * 2, 0.5), M["finale"])
    place(bass, sub("C1", M["end"] - M["finale"] - 2 * BEAT * 2, 0.5), M["finale"] + 2 * BEAT * 2)
    for t in beats(M["finale"], M["end"] - 0.1, BEAT):
        add_kick(t, 0.9)
        place(drums, hat(), t + BEAT / 2, 0.45)
    place(fx, reverse_swell(1.4), M["end"] - 1.4, 0.7)
    place(fx, boom(5.0), M["end"], 1.0)
    end_len = LENGTH - M["end"]
    place(pads, pad(["D3", "F#3", "A3", "D4", "F#4", "A4", "D5"], end_len - 0.5, cutoff=4200, attack=0.05, release=1.5), M["end"], 1.0)
    place(bass, sub("D1", end_len - 0.3, 0.6), M["end"])
    place(keys, bell(hz("F#5"), 4.0), M["end"] + 0.4, 0.25)
    place(keys, bell(hz("A5"), 4.0), M["end"] + 0.9, 0.2)

    return {"drums": drums, "bass": bass, "pads": pads, "keys": keys, "fx": fx, "kicks": np.array(kicks)}


def reverb(x: np.ndarray, length: float = 2.6, damp: float = 3000) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = RNG.normal(0, 1, (2, n)) * np.exp(-t * 3.2 / length * 2.2)
    ir = lowpass(ir, damp)
    ir[:, : int(0.012 * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    return np.vstack([fftconvolve(x[0], ir[0])[: x.shape[1]], fftconvolve(x[1], ir[1])[: x.shape[1]]])


def sidechain(kicks: np.ndarray, depth: float = 0.55, release: float = 0.22) -> np.ndarray:
    g = np.ones(N)
    t = np.arange(int(release * 1.5 * SR)) / SR
    dip = 1 - depth * np.exp(-t / (release / 3))
    for k in kicks:
        i = int(k * SR)
        j = min(N, i + len(dip))
        if i < N:
            g[i:j] = np.minimum(g[i:j], dip[: j - i])
    return g


def mix(stems: dict) -> np.ndarray:
    pump = sidechain(stems["kicks"])
    pads = stems["pads"] * pump
    bass = stems["bass"] * (0.35 + 0.65 * pump)
    keys = stems["keys"]
    wet = reverb(pads * 0.5 + keys * 0.9 + stems["fx"] * 0.35, 3.2)
    out = (stems["drums"] * 0.8 + bass * 0.9 + pads * 0.7 + keys * 0.8 + stems["fx"] * 0.8 + wet * 0.45)
    out = highpass(out, 28)
    return out


def write_wav(path: Path, x: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").T.copy()
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    stems = compose()
    music = mix(stems)
    music = np.tanh(music * 0.9)
    music /= np.abs(music).max() / 0.89
    write_wav(OUT / "music.wav", music)
    print(f"wrote {OUT / 'music.wav'}  peak {np.abs(music).max():.2f}  rms {np.sqrt((music ** 2).mean()):.3f}")
