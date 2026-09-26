"""The score, synthesised from nothing, so there is no licence to clear.

120 bpm in D minor, cut to the same marks as the picture (cues.json). The
climb adds one layer per rung, from a pulse on empty ground to the full groove
on the lot in use, and lifts to the major side at the top; the lights go out
on a switch and a heartbeat; every verb of the call to action lands on a hit;
and it resolves to D major on the end card.

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

    def hit(t, g=0.8, length=3.0, swell=1.2):
        """An impact on a mark, with a reversed cymbal leading into it."""
        place(fx, reverse_swell(swell), t - swell, 0.55 * g)
        place(fx, boom(length), t, g)

    def pads_over(a, b, prog, origin, cutoff=2400, gain=0.55, octave_up=False):
        for t in beats(a, b, 8 * BEAT, offset=origin % (8 * BEAT)):
            if t < a - 1e-6:
                continue
            ch, sub_note, _ = chord_at(t, prog, origin)
            if octave_up:
                ch = ch + [ch[-1][:-1] + str(int(ch[-1][-1]) + 1)]
            L = min(8 * BEAT, b - t)
            place(pads, pad(ch, L, cutoff=cutoff, attack=0.3, release=0.6), t, gain)
            place(bass, sub(sub_note, L, 0.35), t)

    def layer(a, b, origin, *, kick_on=False, hats=False, hats16=False, clap_on=False,
              pulse=0.0, arp=0.0, prog=PROG_MINOR, intensity=1.0):
        """One section of the groove, with only the layers asked for."""
        for t in beats(a, b, BEAT, offset=origin % BEAT):
            if kick_on:
                add_kick(t, intensity)
            if hats:
                place(drums, hat(), t + BEAT / 2, 0.5 * intensity, pan=0.25)
            if hats16:
                place(drums, hat(), t + BEAT / 4, 0.22 * intensity, pan=-0.25)
                place(drums, hat(), t + 3 * BEAT / 4, 0.22 * intensity, pan=-0.25)
            if clap_on and round((t - origin) / BEAT) % 2 == 1:
                place(drums, clap(), t, 0.5 * intensity)
        if pulse:
            for t in beats(a, b, BEAT / 2, offset=origin % (BEAT / 2)):
                _, _, bass_note = chord_at(t, prog, origin)
                place(bass, bassnote(bass_note, BEAT / 2 * 0.9), t, 0.55 * pulse)
        if arp:
            for t in beats(a, b, BEAT / 4, offset=origin % (BEAT / 4)):
                ch, _, _ = chord_at(t, prog, origin)
                seq = ARP_MINOR.get(ch[0][:-1], ARP_MINOR["D"])
                step = round((t - origin) / (BEAT / 4))
                place(keys, pluck(hz(seq[step % 8]), 0.3, 2500 + 3000 * arp), t, 0.22 * arp,
                      pan=0.35 * np.sin(step * 0.7))

    # ---- the promise: one plot, then all of them, then the city.
    place(pads, pad(["D2", "A2", "D3"], M["reveal"] - 0.4, cutoff=500, attack=4.0, release=1.5), 0.0, 0.8)
    place(bass, sub("D1", M["reveal"] + 0.2, 0.35), 0.0)
    place(keys, bell(hz("A5"), 4.0), 1.0, 0.3)
    for t in beats(5.0, M["reveal"] - 1.2, BEAT / 4):
        g = 0.18 if (round(t / (BEAT / 4)) % 4) else 0.32
        place(fx, tick(), t, g, pan=0.3 if round(t / (BEAT / 4)) % 2 else -0.3)
    for t in (5.0, 7.3):
        place(fx, boom(2.5), t, 0.4)
    place(fx, riser(3.5), M["reveal"] - 3.5, 0.55)
    hit(M["reveal"], 0.9, 4.0, 1.6)

    # ---- the title.
    place(pads, pad(["D3", "A3", "D4", "E4", "A4"], M["climb"] - M["reveal"] - 0.2, cutoff=2600, attack=0.3), M["reveal"], 0.9)
    place(bass, sub("D1", M["climb"] - M["reveal"], 0.55), M["reveal"])
    for t in beats(M["reveal"] + 2.0, M["climb"] - 0.5, BEAT * 2):
        add_kick(t, 0.8)

    # ---- the climb: every rung adds a layer.
    o = M["climb"]
    hit(M["climb"], 0.6, 2.5)
    pads_over(M["climb"], M["stop4"], PROG_MINOR, o, cutoff=1400, gain=0.5)
    layer(M["stop0"], M["stop1"], o, pulse=0.5)
    layer(M["stop1"], M["stop2"], o, pulse=0.6, hats=True, arp=0.4)
    layer(M["stop2"], M["stop3"], o, pulse=0.8, hats=True, kick_on=True, arp=0.6, intensity=0.85)
    layer(M["stop3"], M["stop4"], o, pulse=1.0, hats=True, hats16=True, kick_on=True, clap_on=True, arp=0.9, intensity=1.0)
    for k in ("stop1", "stop2", "stop3", "stop4"):
        place(fx, boom(1.6), M[k], 0.35)
    # Up to the top: the drums drop to a roll and everything rises.
    place(fx, riser(M["hero"] - M["stop4"]), M["stop4"], 0.6)
    place(pads, pad(["D3", "A3", "D4", "E4"], M["hero"] - M["stop4"], cutoff=900, attack=1.0, release=0.1), M["stop4"], 0.6)
    roll = 0
    for t in beats(M["hero"] - 2.0, M["hero"], BEAT / 4):
        roll += 1
        place(drums, clap(), t, 0.12 + 0.4 * roll / 16)

    # ---- the top: the whole journey. A lift to the major side.
    hit(M["hero"], 1.0, 5.0, 1.4)
    place(drums, hat(True), M["hero"], 0.7)
    pads_over(M["hero"], M["challenge"] - 0.6, PROG_LIFT, M["hero"], cutoff=4200, gain=0.8, octave_up=True)
    layer(M["hero"], M["challenge"] - 0.8, M["hero"], kick_on=True, hats=True, hats16=True, clap_on=True, pulse=0.9, intensity=1.05, prog=PROG_LIFT)
    for t in beats(M["hero"], M["challenge"] - 1.0, BEAT / 2):
        ch, _, _ = chord_at(t, PROG_LIFT, M["hero"])
        notes = [n[:-1] + str(int(n[-1]) + 2) for n in ch[1:4]]
        step = round((t - M["hero"]) / (BEAT / 2))
        place(keys, bell(hz(notes[step % 3]), 1.2), t, 0.09, pan=0.5 * np.sin(step))

    # ---- where we are: dark, then the lights go out.
    hit(M["challenge"], 0.6, 3.0, 1.0)
    place(pads, pad(["D2", "A2", "F3", "C4"], M["lightsOff"] - M["challenge"], cutoff=700, attack=0.8, release=0.2), M["challenge"], 0.8)
    place(bass, sub("D1", M["lightsOff"] - M["challenge"], 0.45), M["challenge"])
    for t in beats(M["challenge"] + 1.0, M["lightsOff"] - 0.5, BEAT * 2):
        place(drums, kick(0.5), t, 0.55)
        kicks.append(t)
    place(fx, riser(2.6), M["lightsOff"] - 2.6, 0.45)
    place(fx, switch(), M["lightsOff"] - 0.02, 1.1)
    place(fx, boom(4.5), M["lightsOff"], 0.75)
    place(pads, pad(["D2", "A2", "E3"], M["agent"] - M["lightsOff"] - 0.8, cutoff=420, attack=2.0, release=0.8), M["lightsOff"] + 0.4, 0.9)
    for t in beats(M["lightsOff"] + 1.0, M["agent"] - 1.4, 1.0):
        place(drums, kick(0.55), t, 0.7)
        place(drums, kick(0.35), t + 0.22, 0.5)
        kicks.append(t)
    for i in range(4):
        place(keys, bell(hz(["A5", "D6", "F5", "A5"][i]), 3.5), M["lightsOff"] + 0.5 + i * 0.3, 0.16, pan=[-0.4, 0.4, -0.2, 0.2][i])
    place(keys, bell(hz("D5"), 5.0), M["four"], 0.35)
    place(keys, bell(hz("D4"), 5.0), M["score"], 0.3)
    place(fx, riser(2.0), M["agent"] - 2.0, 0.55)

    # ---- the agent: lighter, and the keys typing.
    hit(M["agent"], 0.6, 2.5, 1.0)
    pads_over(M["agent"], M["potential"] - 0.4, PROG_MINOR, M["agent"], cutoff=2200, gain=0.45)
    layer(M["agent"], M["potential"] - 0.5, M["agent"], kick_on=True, hats=True, pulse=0.6, arp=0.5, intensity=0.6)
    q = "Which category is doing best?"
    for i in range(len(q)):
        place(fx, keyclick(), M["agent"] + 1.3 + i * 0.055, 0.35 * (0.7 + 0.3 * RNG.random()), pan=RNG.uniform(-0.2, 0.2))
    place(fx, riser(2.0), M["potential"] - 2.0, 0.55)

    # ---- the city we could be.
    hit(M["potential"], 0.8, 4.0, 1.2)
    pads_over(M["potential"], M["cta1"], PROG_LIFT, M["potential"], cutoff=3000, gain=0.75, octave_up=True)
    for t in beats(M["potential"] + 0.5, M["cta1"], BEAT / 2):
        ch, _, _ = chord_at(t, PROG_LIFT, M["potential"])
        notes = [n[:-1] + str(int(n[-1]) + 2) for n in ch[1:4]]
        step = round((t - M["potential"]) / (BEAT / 2))
        place(keys, bell(hz(notes[step % 3]), 1.2), t, 0.07, pan=0.5 * np.sin(step))
    for t in beats(M["potentialOn"] + 2.5, M["lift"] - 2.0, BEAT):
        if round((t - M["potential"]) / BEAT) % 2 == 0:
            add_kick(t, 0.75)
        else:
            place(drums, clap(), t, 0.4)
    roll = 0
    for t in beats(M["lift"] - 2.0, M["lift"], BEAT / 4):
        roll += 1
        place(drums, clap(), t, 0.15 + 0.35 * roll / 16)
    hit(M["lift"], 0.85, 4.0, 1.0)
    layer(M["lift"], M["cta1"] - 0.4, M["lift"], kick_on=True, hats=True, pulse=0.8, intensity=0.9, prog=PROG_LIFT)
    place(fx, riser(2.0), M["cta1"] - 2.0, 0.6)

    # ---- your move: a hit on every verb.
    for k in ("cta1", "cta2", "cta3"):
        hit(M[k], 0.9, 2.5, 0.9)
        place(drums, hat(True), M[k], 0.6)
    pads_over(M["cta1"], M["finale"], PROG_MINOR, M["cta1"], cutoff=3600, gain=0.6)
    layer(M["cta1"], M["finale"], M["cta1"], kick_on=True, hats=True, hats16=True, clap_on=True, pulse=1.0, arp=1.0, intensity=1.15)
    place(fx, riser(2.0), M["finale"] - 2.0, 0.6)

    # ---- the sign-off, and the lift to D major.
    hit(M["finale"], 0.9, 4.0, 1.4)
    half = (M["end"] - M["finale"]) / 2
    place(pads, pad(["Bb2", "D3", "F3", "Bb3", "D4", "F4"], half + 0.2, cutoff=3500, attack=0.1, release=0.4), M["finale"], 0.9)
    place(pads, pad(["C3", "E3", "G3", "C4", "E4", "G4"], half, cutoff=3800, attack=0.2, release=0.3), M["finale"] + half, 0.9)
    place(bass, sub("Bb0", half, 0.5), M["finale"])
    place(bass, sub("C1", half, 0.5), M["finale"] + half)
    for t in beats(M["finale"], M["end"] - 0.1, BEAT):
        add_kick(t, 0.9)
        place(drums, hat(), t + BEAT / 2, 0.45)
    hit(M["end"], 1.0, 5.0, 1.4)
    end_len = LENGTH - M["end"]
    place(pads, pad(["D3", "F#3", "A3", "D4", "F#4", "A4", "D5"], end_len - 0.5, cutoff=4200, attack=0.05, release=1.5), M["end"], 1.0)
    place(bass, sub("D1", end_len - 0.3, 0.6), M["end"])
    place(keys, bell(hz("F#5"), 4.0), M["end"] + 0.4, 0.25)
    place(keys, bell(hz("A5"), 4.0), M["end"] + 0.9, 0.2)
    place(keys, bell(hz("D6"), 4.0), M["end"] + 1.4, 0.18)

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
