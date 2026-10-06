"""The Back to the Value score: a heroic orchestral fanfare, 120 bpm, D major.

In the spirit of an eighties adventure film (brass fanfare, timpani, marching
snare, soaring strings), on an original melody. It opens on a hit, not a
build: a timpani roll into the jump, the fanfare under the title, brass stabs
on three slams; drives under the explanation; swells as the three forces
fire; counts down three hits to half a second of silence; and lands the
fanfare in full under the poster, ending on a held D major chord.
"""

from __future__ import annotations

import numpy as np

# The fanfare, as (beat, note, beats). Original: a rising fifth to the
# octave, a falling run, and an answer that climbs to the third above.
PHRASE_A = [(0, "D4", 1.5), (1.5, "A4", 0.5), (2, "D5", 2), (4, "C#5", 0.67), (4.67, "B4", 0.67),
            (5.33, "A4", 0.66), (6, "B4", 1), (7, "G4", 1)]
PHRASE_B = [(0, "A4", 1.5), (1.5, "F#4", 0.5), (2, "A4", 1), (3, "D5", 1), (4, "E5", 2), (6, "F#5", 2)]
CHORDS_A = [["D3", "F#3", "A3"], ["D3", "F#3", "A3"], ["A2", "E3", "A3", "C#4"], ["G2", "D3", "G3", "B3"]]
CHORDS_B = [["D3", "F#3", "A3"], ["B2", "D3", "F#3"], ["G2", "D3", "G3", "B3"], ["A2", "E3", "A3", "C#4"]]


def compose(cfg: dict, m) -> dict:
    SR, B = m.SR, 60.0 / cfg["bpm"]
    drums, bass, pads, keys, fx = m.track(), m.track(), m.track(), m.track(), m.track()
    rng = np.random.default_rng(1985)
    kicks: list[float] = []

    # ------------------------------------------------------- the orchestra
    def brass(note, length, g=1.0, bright=1.0, pan=0.0, bus=None):
        n = int((length + 0.25) * SR)
        t = np.arange(n) / SR
        f = m.hz(note) * (1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.25) / 0.3, 0, 1))
        ph = np.cumsum(f) / SR
        y = sum(((ph * (1 + d)) % 1.0) * 2 - 1 for d in (-0.003, 0.0, 0.004)) / 3
        y = y + np.sin(2 * np.pi * ph) * 0.5
        # The "blat": a bright layer that dies away fast over a warm one.
        out = m.lowpass(y, 2600 + 1600 * bright) + m.highpass(m.lowpass(y, 9000), 2000) * (0.35 + 0.9 * np.exp(-t * 6)) * bright
        e = m.env(n, 0.03, 0.15, 0.85, 0.2, hold=length)
        return np.tanh(out * e * 1.4) * 0.55 * g

    def play(bus, sig, t, g=1.0, pan=0.0):
        m.place(bus, sig, t, g, pan=pan)

    def horn_line(t0, phrase, g=1.0, octave_down=True, harm=True):
        for b, note, d in phrase:
            t = t0 + b * B
            play(keys, brass(note, d * B * 0.95, bright=1.1), t, 0.9 * g, pan=0.1)
            if octave_down:
                lo = note[:-1] + str(int(note[-1]) - 1)
                play(keys, brass(lo, d * B * 0.95, bright=0.7), t, 0.55 * g, pan=-0.15)
            if harm:
                # A third below, from the scale.
                scale = ["D", "E", "F#", "G", "A", "B", "C#"]
                name, octv = note[:-1], int(note[-1])
                i = scale.index(name)
                j = (i - 2) % 7
                o = octv - (1 if j > i else 0)
                play(keys, brass(scale[j] + str(o), d * B * 0.95, bright=0.8), t, 0.45 * g, pan=0.3)

    def strings(t0, chords, g=0.55, every=2):
        for k, ch in enumerate(chords):
            notes = ch + [n[:-1] + str(int(n[-1]) + 1) for n in ch]
            play(pads, m.pad(notes, every * B, cutoff=3800, attack=0.06, release=0.5), t0 + k * every * B, g)
            play(bass, m.sub(ch[0][:-1] + "1", every * B, 0.5), t0 + k * every * B)

    def timp(note, g=1.0):
        n = int(1.8 * SR)
        t = np.arange(n) / SR
        f = m.hz(note) * (1 + 0.08 * np.exp(-t * 18))
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
        y += m.lowpass(rng.normal(0, 1, n), 500) * np.exp(-t * 30) * 0.5
        return np.tanh(y * 1.6) * g

    def timp_roll(a, b, note="D2", g0=0.15, g1=0.9):
        t = a
        while t < b:
            u = (t - a) / (b - a)
            play(drums, timp(note, lerp(g0, g1, u ** 1.5)), t, 0.55)
            t += 0.055

    def snare():
        n = int(0.22 * SR)
        t = np.arange(n) / SR
        y = m.bandpass(rng.normal(0, 1, n), 1500, 7000) * np.exp(-t * 22) + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 35) * 0.6
        return y * 0.6

    def snare_roll(a, b, g0=0.2, g1=0.8):
        t = a
        while t < b:
            u = (t - a) / (b - a)
            play(drums, snare(), t, lerp(g0, g1, u), pan=rng.uniform(-0.15, 0.15))
            t += B / 8

    def march(a, b, g=0.7):
        # Snare on the march figure: 1 . (a 2) . 3 . (a 4) with triplet pickups.
        for t in m.beats(a, b, 2 * B):
            for off, v in ((0, 1.0), (B * 0.667, 0.55), (B * 0.833, 0.6), (B, 0.9), (B * 1.5, 0.5)):
                if t + off < b:
                    play(drums, snare(), t + off, g * v)
        for t in m.beats(a, b, 2 * B):
            play(drums, timp("D2", 0.8), t, 0.5)
            play(drums, timp("A1", 0.7), t + B, 0.45)

    def crash(t, g=0.8):
        n = int(3.0 * SR)
        tt = np.arange(n) / SR
        y = m.highpass(rng.normal(0, 1, (2, n)), 5000) * np.exp(-tt * 1.6)
        play(fx, y * 0.5, t, g)

    def hit(t, chord=("D3", "F#3", "A3", "D4", "F#4", "A4"), g=1.0, length=1.2):
        for k, note in enumerate(chord):
            play(keys, brass(note, length, bright=1.3), t, 0.45 * g, pan=(k / (len(chord) - 1) - 0.5) * 0.6)
        play(bass, m.sub("D1", length, 0.9), t)
        play(drums, timp("D2", 1.0), t, 0.9 * g)
        play(fx, m.boom(2.5), t, 0.7 * g)
        crash(t, 0.7 * g)

    def stab(t, chord, g=0.9):
        for note in chord:
            play(keys, brass(note, 0.32, bright=1.4), t, 0.5 * g)
        play(drums, timp("D2", 1.0), t, 0.8 * g)
        play(fx, m.boom(1.2), t, 0.45 * g)

    def ostinato(a, b, g=0.5, root="D"):
        # Driving sixteenths in the strings: root, fifth, octave.
        seq = {"D": ["D3", "D3", "A3", "D3", "D4", "D3", "A3", "D3"], "B": ["B2", "B2", "F#3", "B2", "B3", "B2", "F#3", "B2"],
               "G": ["G2", "G2", "D3", "G2", "G3", "G2", "D3", "G2"], "A": ["A2", "A2", "E3", "A2", "A3", "A2", "E3", "A2"]}[root]
        for k, t in enumerate(m.beats(a, b, B / 4)):
            play(pads, m.pluck(m.hz(seq[k % 8]), 0.16, 3200), t, g, pan=0.25 * np.sin(k * 0.9))

    def lerp(x, y, u):
        return x + (y - x) * u

    def rewind(t, length=0.8):
        n = int(length * SR)
        tt = np.arange(n) / SR
        f = 1800 * (0.12 ** (tt / length))
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + m.bandpass(rng.normal(0, 1, n), 800, 5000) * 0.25
        play(fx, y * np.exp(-tt * 1.2), t, 0.6)

    def whir(t, length=0.9):
        n = int(length * SR)
        tt = np.arange(n) / SR
        f = 300 * (6 ** (tt / length))
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + m.highpass(rng.normal(0, 1, n), 3000) * 0.2
        play(fx, y * (tt / length) ** 0.5 * np.exp(-tt * 0.8), t, 0.55)

    # ------------------------------------------------------------ 0-7.5: the kick
    hit(0.0, g=1.0)
    timp_roll(0.15, 1.85, "A1", 0.2, 1.0)
    snare_roll(0.6, 1.85, 0.2, 0.9)
    play(fx, m.riser(1.8), 0.05, 0.9)
    # The jump, and the fanfare under the title.
    hit(1.85, g=1.3)
    play(fx, m.boom(4.0), 1.85, 1.0)
    strings(1.85, CHORDS_A, 0.6)
    horn_line(1.85, PHRASE_A, 1.0)
    march(1.85, 5.35, 0.55)
    # Three slams.
    stab(5.35, ["D3", "A3", "D4", "F#4"], 1.0)
    stab(6.05, ["B2", "F#3", "B3", "D4"], 1.0)
    stab(6.75, ["G2", "D3", "G3", "B3"], 1.05)
    play(keys, brass("A4", 0.6, bright=1.4), 7.1, 0.6)
    snare_roll(7.1, 7.5, 0.4, 0.9)

    # --------------------------------------------------- 7.5-15.1: the montage
    crash(7.5, 0.6)
    for a, root in ((7.5, "D"), (9.5, "B"), (11.5, "G"), (13.5, "A")):
        ostinato(a, min(a + 2.0, 15.1), 0.55, root)
        play(bass, m.sub({"D": "D1", "B": "B0", "G": "G0", "A": "A0"}[root], min(2.0, 15.1 - a), 0.7), a)
    march(7.5, 15.1, 0.4)
    rewind(7.55)
    for k in range(6):  # frame advance through the tools
        play(fx, m.switch(), 11.04 + k * 0.234, 0.35)
    whir(12.6)
    for t, ph in ((7.9, [(0, "D4", 1), (1, "A4", 1), (2, "F#4", 1.5)]), (10.4, [(0, "E4", 1), (1, "A4", 1), (2, "C#5", 1.5)]),
                  (13.0, [(0, "F#4", 1), (1, "B4", 1), (2, "D5", 1.5)])):
        horn_line(t, ph, 0.5, harm=False)
    timp_roll(14.3, 15.1, "A1", 0.2, 0.9)

    # ------------------------------------------------- 15.1-24.1: choose your force
    hit(15.1, g=0.9)
    strings(15.1, [["D3", "F#3", "A3"]] * 3, 0.45, every=2)
    for a in (15.85, 16.98, 18.1):  # each force card lands on a horn call
        stab(a, ["D3", "A3", "D4", "F#4"], 0.9)
    strings(18.1, [["G2", "D3", "G3", "B3"], ["A2", "E3", "A3", "C#4"], ["A2", "E3", "A3", "C#4"]], 0.55)
    for a, root in ((18.1, "G"), (19.6, "A")):
        ostinato(a, a + 1.5, 0.55, root)
    march(18.1, 21.0, 0.45)
    for t in m.beats(18.85, 21.03, B / 2):  # the cursor
        play(fx, m.tick(), t, 0.5)
    play(fx, m.riser(2.2), 18.85, 0.8)
    snare_roll(20.35, 21.1, 0.3, 1.0)
    # The machine fires: the fanfare's answer, in full.
    hit(21.14, g=1.2)
    strings(21.14, CHORDS_B, 0.65)
    horn_line(21.14, PHRASE_B, 1.0)
    march(21.14, 24.1, 0.55)

    # ---------------------------------------------------- 24.1-30.1: the mission
    crash(24.1, 0.4)
    for a, root in ((25.1, "G"), (26.6, "A"), (28.1, "B")):
        ostinato(a, a + 1.5, 0.6, root)
    march(25.1, 28.45, 0.38)
    for k in range(40):  # the typing
        play(fx, m.keyclick(), 24.85 + k * 0.068, 0.3)
    snare_roll(28.45, 29.05, 0.3, 1.0)
    hit(29.05, ("D3", "A3", "D4", "F#4", "A4", "D5"), g=1.1)

    # ------------------------------------------------- 30.1-36.7: the countdown
    timp_roll(30.1, 34.27, "D2", 0.1, 0.8)
    for a, chord in ((30.1, CHORDS_A[0]), (31.3, CHORDS_B[1]), (32.5, CHORDS_A[3]), (33.4, CHORDS_A[2])):
        notes = chord + [n[:-1] + str(int(n[-1]) + 1) for n in chord]
        play(pads, m.pad(notes, 1.2, cutoff=3000, attack=0.3, release=0.3), a, 0.55)
    for k, note in enumerate(["A4", "B4", "C#5", "D5", "E5"]):  # brass climbing
        play(keys, brass(note, 0.75, bright=1.2), 30.5 + k * 0.75, 0.55)
    play(fx, m.riser(6.1), 30.2, 1.1)
    for a, chord in ((34.27, ["A2", "E3", "A3", "C#4"]), (34.93, ["A2", "E3", "A3", "C#4", "E4"]), (35.6, ["A2", "E3", "A3", "C#4", "E4", "A4"])):
        stab(a, chord, 1.15)
        crash(a, 0.6)
    snare_roll(35.6, 36.3, 0.5, 1.0)

    # ------------------------------------------------------ 36.7-45: the landing
    hit(36.7, g=1.5)
    play(fx, m.boom(5.0), 36.7, 1.1)
    strings(36.7, CHORDS_A, 0.75)
    horn_line(36.7, PHRASE_A, 1.15)
    march(36.7, 40.7, 0.6)
    timp_roll(40.7, 42.4, "D2", 0.3, 1.0)
    final = ["D3", "F#3", "A3", "D4", "F#4", "A4", "D5"]
    play(pads, m.pad(final + ["D2"], 3.4, cutoff=4500, attack=0.05, release=1.0), 40.7, 0.85)
    for note in ("D4", "F#4", "A4", "D5"):
        play(keys, brass(note, 1.6, bright=1.1), 40.7, 0.45)
    hit(42.4, final, g=1.3, length=1.4)

    return {"drums": drums, "bass": bass, "pads": pads, "keys": keys, "fx": fx, "kicks": np.array(kicks)}
