"""Back to the Value, v6: an 80s synthwave drive, 120 bpm in A minor.

Pulsing eighth-note bass, gated-reverb snare on two and four, a sixteenth
arpeggio, lush detuned pads and a singing saw lead on an original melody,
over i-VI-III-VII (Am F C G), one chord a bar. Bars are two seconds, so the
picture's gates at 4, 8, 12 and 16 seconds fall on downbeats.
"""

from __future__ import annotations

import numpy as np

PROG = [("A", ["A3", "C4", "E4"], "A1"), ("F", ["F3", "A3", "C4"], "F1"),
        ("C", ["C4", "E4", "G4"], "C2"), ("G", ["G3", "B3", "D4"], "G1")]
ARP = {"A": ["A4", "C5", "E5", "A5", "E5", "C5", "E5", "C5"], "F": ["F4", "A4", "C5", "F5", "C5", "A4", "C5", "A4"],
       "C": ["C5", "E5", "G5", "C6", "G5", "E5", "G5", "E5"], "G": ["G4", "B4", "D5", "G5", "D5", "B4", "D5", "B4"]}
# The lead: (beat, note, beats), two bars a phrase.
LEAD_1 = [(0, "E5", 1.5), (1.5, "D5", 0.5), (2, "C5", 1), (3, "D5", 1), (4, "E5", 1.5), (5.5, "G5", 0.5), (6, "A5", 2)]
LEAD_2 = [(0, "G5", 1.5), (1.5, "E5", 0.5), (2, "D5", 1), (3, "C5", 1), (4, "D5", 1), (5, "E5", 1), (6, "C5", 1), (7, "A4", 1)]
LEAD_3 = [(0, "A5", 1.5), (1.5, "G5", 0.5), (2, "E5", 1), (3, "G5", 1), (4, "A5", 1), (5, "C6", 1), (6, "B5", 2)]


def compose(cfg: dict, m) -> dict:
    SR, B = m.SR, 60.0 / cfg["bpm"]
    BAR = 4 * B
    drums, bass, pads, keys, fx = m.track(), m.track(), m.track(), m.track(), m.track()
    rng = np.random.default_rng(1985)
    kicks: list[float] = []

    def chord(t):
        return PROG[int(t // BAR) % 4]

    # ---------------------------------------------------------- instruments
    def gated_snare():
        n = int(0.34 * SR)
        t = np.arange(n) / SR
        body = m.bandpass(rng.normal(0, 1, n), 900, 7000) * np.exp(-t * 4) * 0.8
        tone = np.sin(2 * np.pi * 200 * t) * np.exp(-t * 30) * 0.7
        c = m.clap()
        y = body + tone
        y[: len(c)] += c[:n]
        gate = np.where(t < 0.26, 1.0, np.exp(-(t - 0.26) * 120))
        return y * gate * 0.75

    def tom(note, g=1.0):
        n = int(0.6 * SR)
        t = np.arange(n) / SR
        f = m.hz(note) * (1 + 0.6 * np.exp(-t * 20))
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
        return np.tanh(y * 1.5) * g

    def synth_bass(note, length):
        n = int(length * SR)
        t = np.arange(n) / SR
        f = m.hz(note)
        y = ((t * f) % 1.0) * 2 - 1 + (((t * f * 1.005) % 1.0) * 2 - 1)
        y = m.lowpass(y * 0.5, 700) * 0.7 + m.lowpass(y * 0.5, 2400) * np.exp(-t * 18) * 0.5
        return y * m.env(n, 0.004, 0.08, 0.7, 0.03, hold=length - 0.03) * 0.9

    def lead(note, length, g=1.0):
        n = int((length + 0.2) * SR)
        t = np.arange(n) / SR
        f = m.hz(note) * (1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.2) / 0.3, 0, 1))
        ph = np.cumsum(f) / SR
        y = sum(((ph * (1 + d)) % 1.0) * 2 - 1 for d in (-0.006, 0.0, 0.007)) / 3
        y += np.sign(np.sin(2 * np.pi * ph * 0.5)) * 0.25
        y = m.lowpass(y, 3200) + m.highpass(m.lowpass(y, 7000), 2500) * np.exp(-t * 5) * 0.4
        return y * m.env(n, 0.012, 0.2, 0.8, 0.18, hold=length) * 0.5 * g

    def play(bus, sig, t, g=1.0, pan=0.0):
        m.place(bus, sig, t, g, pan=pan)

    def lead_line(t0, phrase, g=1.0):
        for b, note, d in phrase:
            s = lead(note, d * B * 0.96, g)
            play(keys, s, t0 + b * B, 0.85, pan=0.05)
            play(keys, s * 0.35, t0 + b * B + 0.75 * B, 1.0, pan=-0.45)  # dotted-eighth echo
            play(keys, s * 0.18, t0 + b * B + 1.5 * B, 1.0, pan=0.45)

    # -------------------------------------------------------------- layers
    def drums_full(a, b, g=1.0, half=False):
        for t in m.beats(a, b, B * (2 if half else 1)):
            play(drums, m.kick(), t, 0.95 * g)
            kicks.append(t)
        for t in m.beats(a, b, 2 * B, offset=B if not half else 2 * B):
            if half and round((t - a) / (2 * B)) % 2 == 0:
                continue
            play(drums, gated_snare(), t, 0.9 * g)
        for t in m.beats(a, b, B / 2):
            play(drums, m.hat(open_=round(t / (B / 2)) % 2 == 1), t, 0.28 * g, pan=0.2)

    def bassline(a, b, g=1.0):
        for k, t in enumerate(m.beats(a, b, B / 2)):
            _, _, root = chord(t)
            note = root if k % 2 == 0 else root[:-1] + str(int(root[-1]) + 1)
            play(bass, synth_bass(note, B / 2 * 0.9), t, 0.75 * g)

    def arp(a, b, g=0.5, bright=5000):
        for k, t in enumerate(m.beats(a, b, B / 4)):
            name = chord(t)[0]
            play(keys, m.pluck(m.hz(ARP[name][k % 8]), 0.22, bright), t, 0.22 * g, pan=0.4 * np.sin(k * 0.6))

    def padline(a, b, g=0.55, cutoff=2600):
        for t in m.beats(a, b, BAR):
            _, notes, root = chord(t)
            span = min(BAR, b - t)
            play(pads, m.pad(notes + [notes[0][:-1] + str(int(notes[0][-1]) + 1)], span, cutoff=cutoff, attack=0.25, release=0.6), t, g)
            play(bass, m.sub(root, span, 0.35), t)

    def hit(t, g=1.0):
        play(fx, m.reverse_swell(1.0), t - 1.0, 0.5 * g)
        play(fx, m.boom(3.0), t, 0.9 * g)
        play(drums, gated_snare(), t, 0.9 * g)
        play(drums, m.kick(), t, 1.0 * g)

    def tom_fill(a, b):
        notes = ["A2", "F2", "D2", "A1"]
        for k, t in enumerate(m.beats(a, b, B / 4)):
            play(drums, tom(notes[min(3, int(4 * (t - a) / (b - a)))], 0.8), t, 0.6, pan=0.5 - (t - a) / (b - a))

    def whirl(t, length=1.8):
        # The time circuits spinning: a fast ticking that rises.
        n = int(length * SR)
        tt = np.arange(n) / SR
        rate = 14 + 30 * tt / length
        clicks = (np.sin(2 * np.pi * np.cumsum(rate) / SR) > 0.97).astype(float)
        y = m.bandpass(clicks + rng.normal(0, 0.05, n), 1500, 6000) * 0.8
        f = 400 * (4 ** (tt / length))
        y += np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.12 * tt / length
        play(fx, y, t, 0.6)

    def lock(t):
        play(fx, m.switch(), t, 0.8)
        for k, n in enumerate(["A5", "E6", "A6"]):
            play(keys, m.bell(m.hz(n), 1.6), t + k * 0.05, 0.16)
        play(fx, m.boom(1.6), t, 0.55)

    # ----------------------------------------------------------- 0-4 ignition
    play(pads, m.pad(["A2", "E3", "A3", "C4"], 4.0, cutoff=900, attack=1.0, release=0.3), 0.0, 0.7)
    play(bass, m.sub("A1", 4.0, 0.4), 0.0)
    hit(1.0, 1.0)  # the lightning
    for k, t in enumerate(m.beats(1.0, 4.0, B / 2)):  # the bass wakes, filter opening
        play(bass, m.lowpass(synth_bass("A1", B / 2 * 0.9), 300 + 2200 * (t - 1) / 3), t, 0.6)
    play(fx, m.riser(2.0), 2.0, 0.9)
    tom_fill(3.5, 4.0)

    # ----------------------------------------------------------- 4-16 the drive
    hit(4.0, 1.1)
    drums_full(4.0, 16.0)
    bassline(4.0, 16.0)
    arp(4.0, 16.0, 0.55)
    padline(4.0, 16.0, 0.45)
    lead_line(4.0, LEAD_1, 0.9)
    lead_line(8.0, LEAD_2, 0.75)   # under the voice line, softer
    lead_line(12.0, LEAD_3, 1.0)
    for t in (8.0, 12.0):           # each gate is a crash and a whoosh
        play(fx, m.reverse_swell(0.8), t - 0.8, 0.45)
        play(fx, m.boom(1.5), t, 0.4)
    tom_fill(15.5, 16.0)

    # ------------------------------------------------- 16-30 the destinations
    hit(16.0, 0.9)
    drums_full(16.0, 28.0, 0.8, half=True)
    bassline(16.0, 28.0, 0.7)
    padline(16.0, 30.0, 0.55, cutoff=3200)
    arp(20.0, 28.0, 0.4, 3800)
    for land in (18.0, 22.0, 26.0):
        whirl(land - 1.8)
        lock(land)
    play(fx, m.riser(2.0), 28.0, 1.0)
    tom_fill(29.0, 30.0)

    # ------------------------------------------------------ 30-35.6 the run to 88
    hit(30.0, 1.1)
    drums_full(30.0, 35.5, 1.05)
    bassline(30.0, 35.5, 1.05)
    arp(30.0, 35.5, 0.7, 6000)
    padline(30.0, 35.5, 0.5)
    lead_line(30.0, LEAD_1, 1.05)
    lead_line(34.0, LEAD_3[:4], 1.1)
    play(fx, m.riser(5.5), 30.0, 0.9)

    # ------------------------------------------------------ 36-45 reassembled
    hit(36.0, 1.4)
    play(fx, m.boom(5.0), 36.0, 1.0)
    drums_full(38.0, 44.0, 1.0)
    bassline(36.0, 44.0)
    arp(36.0, 44.0, 0.6)
    padline(36.0, 44.0, 0.6, cutoff=3400)
    lead_line(38.0, LEAD_2, 1.0)
    lead_line(42.0, [(0, "A5", 1), (1, "E5", 1), (2, "A5", 4)], 1.05)
    play(pads, m.pad(["A2", "E3", "A3", "C4", "E4", "A4"], 2.6, cutoff=3800, attack=0.05, release=1.0), 42.0, 0.6)
    hit(44.0, 0.9)

    return {"drums": drums, "bass": bass, "pads": pads, "keys": keys, "fx": fx, "kicks": np.array(kicks)}
