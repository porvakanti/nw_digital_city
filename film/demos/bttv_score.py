"""The Back to the Value score: a trailer cue at 120 bpm in D minor.

Cut to the picture's hits rather than left to the generic demo score: four
booms and brass stabs in the cold open, a ticking clock that tightens into a
riser, a drop on the VCR montage, a breakdown for "choose your force", a
second drop when the flux capacitor fires, a long riser to 88, half a second
of silence, and the biggest hit of the film on the arrival, resolving to D
major under the poster.
"""

from __future__ import annotations

import numpy as np


def compose(cfg: dict, m) -> dict:
    SR, B = m.SR, 60.0 / cfg["bpm"]
    L = cfg["length"]
    drums, bass, pads, keys, fx = m.track(), m.track(), m.track(), m.track(), m.track()
    kicks = []
    rng = np.random.default_rng(88)

    def kick(t, g=1.0):
        m.place(drums, m.kick(), t, 0.95 * g)
        kicks.append(t)

    def braam(t, notes=("D1", "D2", "A2", "D3"), length=1.6, g=0.9, cutoff=1300):
        m.place(pads, m.pad(list(notes), length, cutoff=cutoff, attack=0.015, release=0.9), t, g)
        m.place(bass, m.sub(notes[0], length, 0.9), t)

    def hit(t, g=1.0, length=3.5, big=False):
        m.place(fx, m.reverse_swell(0.9), t - 0.9, 0.45 * g)
        m.place(fx, m.boom(length), t, 1.0 * g)
        if big:
            m.place(fx, m.boom(length + 1.5), t, 0.8 * g)

    def roll(a, b, g=0.6):
        # A snare roll that tightens from eighths to thirty-seconds.
        t = a
        while t < b - 1e-6:
            u = (t - a) / (b - a)
            m.place(drums, m.clap(), t, g * (0.35 + 0.65 * u), pan=rng.uniform(-0.2, 0.2))
            t += B / (2 if u < 0.4 else 4 if u < 0.75 else 8)

    def groove(a, b, prog, *, clap=True, hats16=True, gain=1.0, arp=0.6):
        for t in m.beats(a, b, B):
            kick(t, gain)
            m.place(drums, m.hat(open_=True), t + B / 2, 0.35 * gain, pan=0.2)
            if clap and round((t - a) / B) % 2 == 1:
                m.place(drums, m.clap(), t, 0.6 * gain)
        if hats16:
            for t in m.beats(a, b, B / 4):
                m.place(drums, m.hat(), t, 0.22 * gain, pan=-0.25)
        for t in m.beats(a, b, B / 2):
            _, _, note = m.chord_at(t, prog, a)
            m.place(bass, m.bassnote(note, B / 2 * 0.9), t, 0.6 * gain)
        for t in m.beats(a, b, B / 4):
            ch, _, _ = m.chord_at(t, prog, a)
            seq = m.ARP_MINOR.get(ch[0][:-1], m.ARP_MINOR["D"])
            k = round((t - a) / (B / 4))
            m.place(keys, m.pluck(m.hz(seq[k % 8]), 0.28, 5200), t, 0.2 * arp, pan=0.4 * np.sin(k * 0.7))
        for t in m.beats(a, b, 8 * B):
            ch, sub_note, _ = m.chord_at(t, prog, a)
            span = min(8 * B, b - t)
            m.place(pads, m.pad(ch, span, cutoff=2800, attack=0.2, release=0.5), t, 0.45 * gain)

    def rewind(t, length=0.8):
        n = int(length * SR)
        tt = np.arange(n) / SR
        f = 1800 * (0.12 ** (tt / length))
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + m.bandpass(rng.normal(0, 1, n), 800, 5000) * 0.25
        m.place(fx, y * np.exp(-tt * 1.2), t, 0.7)

    def whir(t, length=0.9):
        n = int(length * SR)
        tt = np.arange(n) / SR
        f = 300 * (6 ** (tt / length))
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + m.highpass(rng.normal(0, 1, n), 3000) * 0.2
        m.place(fx, y * (tt / length) ** 0.5 * np.exp(-tt * 0.8), t, 0.6)

    # 0-6: the cold open. A clock, and four slams.
    m.place(bass, m.sub("D1", 6.0, 0.35), 0.0)
    for t in m.beats(0.2, 4.0, B):
        m.place(fx, m.tick(), t, 0.55)
    for t in m.beats(4.0, 6.0, B / 2):
        m.place(fx, m.tick(), t, 0.65)
    for t in (0.5, 2.0, 3.5, 5.0):
        hit(t, 0.8, 2.0)
        braam(t, length=1.3, g=0.75 + 0.05 * (t / 1.5))

    # 6-14: ignition. Pulse, ticks tightening, a riser into the drop.
    for t in m.beats(6.0, 14.0, B / 2):
        m.place(bass, m.bassnote("D1", B / 2 * 0.8), t, 0.45)
    for t in m.beats(6.0, 10.0, B / 2):
        m.place(fx, m.tick(), t, 0.5)
    for t in m.beats(10.0, 14.0, B / 4):
        m.place(fx, m.tick(), t, 0.45)
    m.place(pads, m.pad(["D2", "A2", "D3", "F3"], 8.0, cutoff=900, attack=1.5, release=0.4), 6.0, 0.6)
    m.place(fx, m.riser(4.0), 10.0, 0.9)
    roll(12.0, 14.0, 0.5)

    # 14-26: the drop, under the VCR montage.
    hit(14.0, 1.0, 3.0)
    groove(14.0, 26.0, m.PROG_MINOR)
    rewind(14.05)
    m.place(fx, m.switch(), 18.0, 0.7)
    for k in range(6):  # frame-advance clicks on the tool flashes
        m.place(fx, m.switch(), 19.6 + k * 0.36, 0.35)
    whir(22.0)

    # 26-34: breakdown for "choose your force", then a build.
    m.place(pads, m.pad(["D3", "F3", "A3", "C4"], 8.0, cutoff=1800, attack=0.3, release=0.6), 26.0, 0.55)
    for t in m.beats(26.0, 34.0, 2 * B):
        kick(t, 0.8)
    for t in (27.0, 28.5, 30.0):
        hit(t, 0.75, 2.2)
        braam(t, ("D1", "D2", "A2"), length=1.0, g=0.6)
    for t in m.beats(31.0, 34.0, B):
        m.place(fx, m.switch(), t, 0.4)
        m.place(keys, m.bell(m.hz("A5"), 0.8), t, 0.12)
    m.place(fx, m.riser(4.0), 30.0, 0.8)
    roll(32.0, 34.0, 0.6)

    # 34-46: the flux capacitor fires. Full groove, lifted.
    hit(34.0, 1.1, 3.5, big=True)
    braam(34.0, ("D1", "D2", "A2", "D3", "F3"), length=2.0, g=0.9, cutoff=2200)
    groove(34.0, 46.0, m.PROG_LIFT, gain=1.05, arp=0.8)
    hit(38.0, 0.6, 2.0)
    for k, n in enumerate(["D6", "F6", "A6", "D7"]):
        m.place(keys, m.bell(m.hz(n), 2.5), 44.6 + k * 0.08, 0.16)
    hit(44.6, 0.8, 2.5)

    # 46-52.6: the run to 88. Four on the floor and a long riser.
    for t in m.beats(46.0, 52.6, B):
        kick(t, 0.9)
    for t in m.beats(46.0, 52.6, B / 2):
        m.place(bass, m.bassnote("D1", B / 2 * 0.85), t, 0.6)
    m.place(fx, m.riser(6.6), 46.0, 1.2)
    roll(50.0, 52.6, 0.75)
    m.place(pads, m.pad(["D2", "A2", "D3", "F3", "A3"], 6.6, cutoff=600, attack=4.0, release=0.1), 46.0, 0.7)

    # 52.6-53.0: silence. Then the jump.
    a, b = int(52.6 * SR), int(53.0 * SR)
    for bus in (drums, bass, pads, keys, fx):
        bus[:, a:b] *= np.linspace(1, 0, b - a) ** 3
        bus[:, b:b + int(0.02 * SR)] = 0

    # 53-60: arrival, resolving to D major under the poster.
    hit(53.0, 1.3, 5.0, big=True)
    m.place(pads, m.pad(["D2", "A2", "D3", "F#3", "A3", "D4", "F#4", "A4"], L - 53.3, cutoff=4200, attack=0.03, release=1.4), 53.0, 1.0)
    m.place(bass, m.sub("D1", L - 53.3, 0.8), 53.0)
    for k, n in enumerate(["D5", "F#5", "A5", "D6"]):
        m.place(keys, m.bell(m.hz(n), 4.0), 54.2 + k * 0.5, 0.22)
    for t in m.beats(55.5, L - 1.4, B):
        m.place(drums, m.hat(open_=True), t, 0.18)
    hit(57.0, 0.6, 3.0)

    return {"drums": drums, "bass": bass, "pads": pads, "keys": keys, "fx": fx, "kicks": np.array(kicks)}
