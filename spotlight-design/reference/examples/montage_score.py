"""Coming to VP&C: one score under ten films, 120 bpm in D minor.

A held build under the proof, a hit as each chapter lands, a groove that
lifts for the agents, a breakdown for Digital City, tension under the
roadmap, and the biggest hit of the film for the Marketplace and the close.
"""

from __future__ import annotations

import numpy as np


def compose(cfg: dict, m) -> dict:
    B = m.BEAT
    L = cfg["length"]
    ch = {c["id"]: c["at"] for c in cfg["chapters"]}
    drums, bass, pads, keys, fx = m.track(), m.track(), m.track(), m.track(), m.track()
    kicks: list[float] = []
    rng = np.random.default_rng(29)

    def hit(t, g=0.8, length=3.0, swell=1.0):
        m.place(fx, m.reverse_swell(swell), t - swell, 0.5 * g)
        m.place(fx, m.boom(length), t, g)
        m.place(drums, m.kick(), t, 0.95 * g)
        kicks.append(t)

    def groove(a, b, *, kick=True, half=False, hats=True, hats16=False, clap=False, pulse=0.6, arp=0.5, gain=0.8):
        for t in m.beats(a, b, B * (2 if half else 1)):
            if kick:
                m.place(drums, m.kick(), t, 0.9 * gain)
                kicks.append(t)
        for t in m.beats(a, b, B):
            if hats:
                m.place(drums, m.hat(), t + B / 2, 0.42 * gain, pan=0.25)
            if hats16:
                m.place(drums, m.hat(), t + B / 4, 0.18 * gain, pan=-0.25)
                m.place(drums, m.hat(), t + 3 * B / 4, 0.18 * gain, pan=-0.25)
            if clap and round((t - a) / B) % 2 == 1:
                m.place(drums, m.clap(), t, 0.45 * gain)
        for t in m.beats(a, b, B / 2):
            _, _, note = m.chord_at(t, m.PROG_LIFT, 0.0)
            m.place(bass, m.bassnote(note, B / 2 * 0.9), t, 0.5 * pulse)
        for t in m.beats(a, b, B / 4):
            chord, _, _ = m.chord_at(t, m.PROG_LIFT, 0.0)
            seq = m.ARP_MINOR.get(chord[0][:-1], m.ARP_MINOR["D"])
            step = round(t / (B / 4))
            m.place(keys, m.pluck(m.hz(seq[step % 8]), 0.3, 2500 + 3000 * arp), t, 0.2 * arp,
                    pan=0.35 * np.sin(step * 0.7))

    def pads_over(a, b, cutoff=2400, gain=0.5):
        for t in m.beats(a, b, 8 * B):
            chord, sub_note, _ = m.chord_at(t, m.PROG_LIFT, 0.0)
            span = min(8 * B, b - t)
            m.place(pads, m.pad(chord, span, cutoff=cutoff, attack=0.3, release=0.6), t, gain)
            m.place(bass, m.sub(sub_note, span, 0.3), t)

    def chime(t, g=0.16):
        for i, n in enumerate(["D6", "F#6", "A6"]):
            m.place(keys, m.bell(m.hz(n), 2.0), t + 0.05 + i * 0.06, g)

    # 0-12, the proof: a held build, a pulse that quickens, a bell per number.
    m.place(pads, m.pad(["D2", "A2", "D3", "F3"], ch["pa"], cutoff=900, attack=1.2, release=0.4), 0.0, 0.7)
    m.place(bass, m.sub("D1", ch["pa"], 0.4), 0.0)
    for t in m.beats(1.0, ch["pa"] - 0.2, B):
        m.place(drums, m.kick(), t, 0.35 + 0.35 * t / ch["pa"])
        kicks.append(t)
    for t in (3.6, 6.2, 7.8, 9.4):
        chime(t, 0.14)
    m.place(fx, m.riser(4.0), ch["pa"] - 4.0, 0.7)

    # Prompt Academy: light and curious, no kick until the agents.
    hit(ch["pa"], 0.8, 3.0)
    pads_over(ch["pa"], ch["ava"], cutoff=3000, gain=0.45)
    groove(ch["pa"], ch["ava"] - 0.2, kick=False, hats=True, pulse=0.45, arp=0.6, gain=0.65)
    m.place(fx, m.riser(2.0), ch["ava"] - 2.0, 0.6)

    # The agents: the groove, lifting at the money moments.
    agents = ["ava", "neg", "hw", "sw", "obl", "ex", "lk"]
    pads_over(ch["ava"], ch["dc"], cutoff=2600, gain=0.42)
    groove(ch["ava"], ch["dc"] - 0.3, pulse=0.6, arp=0.5, gain=0.75)
    groove(ch["neg"], ch["hw"] - 0.3, hats16=True, clap=True, pulse=0.8, arp=0.7, gain=0.55)
    groove(ch["obl"], ch["ex"] - 0.3, hats16=True, clap=True, pulse=0.8, arp=0.7, gain=0.55)
    for k in agents:
        hit(ch[k], 0.7, 2.5, 0.6)
        m.place(fx, m.switch(), ch[k], 0.3)
    for t in (67.2, 117.2):  # the savings, the claim
        chime(t, 0.2)
    m.place(fx, m.riser(3.0), ch["dc"] - 3.0, 0.6)

    # Digital City: the breakdown, half-time, the city rising on bells.
    hit(ch["dc"], 0.9, 4.0)
    pads_over(ch["dc"], ch["road"], cutoff=3600, gain=0.55)
    groove(ch["dc"], ch["road"] - 0.3, half=True, hats=False, pulse=0.4, arp=0.8, gain=0.6)
    for i, n in enumerate(["A5", "D6", "E6", "F6", "A6", "D7"]):
        m.place(keys, m.bell(m.hz(n), 2.5), ch["dc"] + 0.5 + i * 0.9, 0.12)

    # The roadmap: ticking tension that counts the use cases in, then a breath.
    hit(ch["road"], 0.8, 3.0)
    m.place(pads, m.pad(["D2", "A2", "D3", "E3", "A3"], ch["mp"] - ch["road"], cutoff=1400, attack=0.4, release=0.3), ch["road"], 0.6)
    for t in m.beats(ch["road"] + 0.4, ch["road"] + 6.0, B / 4):
        m.place(fx, m.tick(), t, 0.25 + 0.2 * rng.random())
    m.place(fx, m.riser(4.4), ch["mp"] - 4.4, 0.9)

    # The Marketplace: everything, the biggest hit of the film.
    hit(ch["mp"], 1.1, 4.0, 1.4)
    pads_over(ch["mp"], ch["end"], cutoff=3800, gain=0.55)
    groove(ch["mp"], ch["end"] - 0.3, hats16=True, clap=True, pulse=0.9, arp=0.9, gain=0.85)

    # The close: one last hit and a chord left ringing.
    e = ch["end"]
    hit(e, 1.0, 5.0)
    m.place(pads, m.pad(["D3", "F#3", "A3", "D4", "F#4", "A4", "D5"], L - e - 0.2, cutoff=4200, attack=0.05, release=1.5), e, 0.9)
    m.place(bass, m.sub("D1", L - e - 0.2, 0.6), e)
    for i, n in enumerate(["F#5", "A5", "D6"]):
        m.place(keys, m.bell(m.hz(n), 3.0), e + 0.6 + i * 0.4, 0.22)
    return {"drums": drums, "bass": bass, "pads": pads, "keys": keys, "fx": fx, "kicks": np.array(kicks)}
