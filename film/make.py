#!/usr/bin/env python3
"""Build the product film from film.yaml.

    python3 run.py film            record what is missing, then cut
    python3 run.py film record     re-record every shot, then cut
    python3 run.py film cut        cut from the recordings already on disk

Three stages. Recording drives the renderer in a browser and keeps one video
per shot. Trimming finds where the usable footage of each recording starts, by
looking at the frames rather than by trusting the shoot's clock. Cutting draws
the text frames, encodes one file per beat to identical settings, and joins
them with the concat demuxer, which keeps the joins frame accurate without a
second encode of the footage.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cards  # noqa: E402  (after the path is set, by design)

ROOT = Path(__file__).resolve().parent.parent
CONFIG = Path(__file__).resolve().parent / "film.yaml"


def ffmpeg() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def run(args: list[str]) -> None:
    subprocess.run([ffmpeg(), "-v", "error", "-y"] + args, check=True)


def duration(path: Path) -> float:
    probe = subprocess.run([ffmpeg(), "-i", str(path)], capture_output=True, text=True)
    line = next(line for line in probe.stderr.splitlines() if "Duration:" in line)
    clock = line.split("Duration:")[1].split(",")[0].strip()
    hours, minutes, seconds = clock.split(":")
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


# ------------------------------------------------------------------ recording

def record(config: dict, only: list[str] | None = None) -> None:
    """Drive the renderer in a browser and keep one video per shot."""
    if shutil.which("node") is None:
        raise SystemExit(
            "recording needs node and playwright:\n"
            "    npm install playwright\n"
            "    npx playwright install chromium\n"
            "Cutting from recordings already on disk does not: python3 run.py film cut")
    record_config = config["record"]
    into = ROOT / record_config["dir"]
    into.mkdir(parents=True, exist_ok=True)
    shots = [s for s in config["shots"] if only is None or s["id"] in only]
    if not shots:
        return

    plan = {
        "dir": str(into),
        "url": record_config["url"] or (ROOT / "renderer" / "index.html").as_uri(),
        "chromium": record_config.get("chromium"),
        "width": config["output"]["width"],
        "height": config["output"]["height"],
        "settle_ms": record_config["settle_ms"],
        "after_dismiss_ms": record_config["after_dismiss_ms"],
        "ready_timeout_ms": record_config["ready_timeout_ms"],
        "hide_ids": record_config["hide_ids"],
        "hide_model_badge": record_config["hide_model_badge"],
        "shots": shots,
    }
    plan_file = into / "shots.json"
    plan_file.write_text(json.dumps(plan, indent=1), encoding="utf-8")
    print(f"· recording {len(shots)} shot(s)")
    if subprocess.call(["node", "film/record.js", str(plan_file)], cwd=ROOT):
        raise SystemExit("recording failed")

    for shot in shots:
        folder = into / shot["id"]
        webm = next(iter(folder.glob("*.webm")), None)
        if webm is None:
            raise SystemExit(f"{shot['id']} produced no video")
        # Re-encode rather than remux: the cut seeks into these, and seeking
        # into a webm from a screen recorder does not land on an exact frame.
        middle = config["output"]["intermediate"]
        run(["-i", str(webm), "-c:v", "libx264", "-preset", middle["preset"],
             "-crf", str(middle["crf"]), "-pix_fmt", "yuv420p",
             "-r", str(config["output"]["fps"]), str(into / f"{shot['id']}.mp4")])
        shutil.rmtree(folder)


# -------------------------------------------------------------------- trimming

def head(config: dict, clip: Path) -> float:
    """Where the usable footage starts, measured from the frames.

    The welcome dialog holds a large block of saturated red in the middle of
    an unfocused city, so counting red pixels inside a fixed window finds the
    frames it is on. It is on screen from the moment the page draws until it
    is dismissed, once, so what is wanted is the end of the first run of those
    frames and not the last one anywhere in the recording.

    The difference is not academic. Two shots fly to a category whose lot
    carries a red hotel, which fills the same window with more red than the
    dialog does, and taking the last frame above the threshold put the trim
    past the end of the recording.

    A shot that never shows the dialog, which is what happens if the renderer
    stops offering it, trims to nothing rather than guessing.
    """
    from PIL import Image, ImageChops

    trim = config["record"]["trim"]
    window = trim["window"]
    red = trim["red"]
    with tempfile.TemporaryDirectory() as work:
        run(["-i", str(clip),
             "-vf", f"fps={trim['probe_fps']},"
                    f"crop={window['w']}:{window['h']}:{window['x']}:{window['y']}",
             f"{work}/%05d.png"])
        showing = []
        for frame in sorted(Path(work).glob("*.png")):
            # Band arithmetic rather than a loop over pixels: a probe is
            # eighty thousand pixels and a recording is a few hundred probes,
            # which is the difference between a second and a minute.
            channels = Image.open(frame).convert("RGB").split()
            above = channels[0].point(lambda v: 255 if v > red["r_above"] else 0, "1")
            for channel, ceiling in ((channels[1], red["g_below"]),
                                     (channels[2], red["b_below"])):
                above = ImageChops.logical_and(
                    above, channel.point(lambda v, c=ceiling: 255 if v < c else 0, "1"))
            showing.append(above.histogram()[255] > trim["dialog_above"])

    end = first_run(showing, trim["least_frames"])
    if end is None:
        return 0.0
    return (end + 1) / trim["probe_fps"] + trim["margin_s"]


def first_run(showing: list[bool], least: int) -> int | None:
    """The index the first run of `least` or more true values ends at.

    A shorter run is something else that happened to be red for a moment, not
    a dialog somebody had to dismiss.
    """
    start = None
    for index, present in enumerate(showing):
        if present and start is None:
            start = index
        elif not present and start is not None:
            if index - start >= least:
                return index - 1
            start = None
    if start is not None and len(showing) - start >= least:
        return len(showing) - 1
    return None


# --------------------------------------------------------------------- cutting

def cut(config: dict) -> Path:
    output = config["output"]
    clips = ROOT / config["record"]["dir"]
    work = ROOT / "film" / "out" / "beats"
    work.mkdir(parents=True, exist_ok=True)
    frames = cards.render(config, ROOT / "film" / "out" / "cards")

    encode = ["-c:v", "libx264", "-preset", output["preset"], "-crf", str(output["crf"]),
              "-pix_fmt", "yuv420p", "-r", str(output["fps"]), "-an"]
    fade = config["style"]["card_fade_s"]
    heads: dict[str, float] = {}
    order: list[Path] = []

    print("· cutting")
    for beat in config["beats"]:
        source = clips / f"{beat['shot']}.mp4"
        if not source.is_file():
            raise SystemExit(f"no recording for {beat['shot']}. Run: python3 run.py film record")
        if beat["shot"] not in heads:
            heads[beat["shot"]] = head(config, source)
        start = heads[beat["shot"]] + beat["start"]
        length = beat["length"]
        if start + length > duration(source) + 0.05:
            raise SystemExit(
                f"beat {beat['id']} wants {length:.1f}s from {start:.1f}s into "
                f"{beat['shot']}, which is only {duration(source):.1f}s long")

        chain = ["setsar=1"]
        if "fade_in" in beat:
            chain.append(f"fade=t=in:st=0:d={beat['fade_in']}")
        if "fade_out" in beat:
            chain.append(f"fade=t=out:st={length - beat['fade_out']:.2f}:d={beat['fade_out']}")

        args = ["-ss", f"{start:.2f}", "-t", f"{length:.2f}", "-i", str(source)]
        if beat.get("card"):
            args += ["-loop", "1", "-i", str(frames[beat["card"]]),
                     "-filter_complex",
                     f"[1:v]format=rgba,"
                     f"fade=t=in:st={beat['card_in']}:d={fade}:alpha=1,"
                     f"fade=t=out:st={beat['card_out']}:d={fade}:alpha=1[ov];"
                     f"[0:v]{','.join(chain)}[bg];[bg][ov]overlay=0:0:shortest=1[v]",
                     "-map", "[v]"]
        else:
            args += ["-vf", ",".join(chain)]

        destination = work / f"{beat['id']}.mp4"
        run(args + encode + [str(destination)])
        order.append(destination)
        print(f"  {beat['id']:12} {length:5.1f}s  from {beat['shot']} at {start:5.2f}s")

    tail = config["end_card"]
    end = work / "end.mp4"
    run(["-loop", "1", "-t", str(tail["length"]), "-i", str(frames[tail["card"]]),
         "-vf", f"setsar=1,fade=t=in:st=0:d={tail['fade']},"
                f"fade=t=out:st={tail['length'] - tail['fade']:.2f}:d={tail['fade']}"]
        + encode + [str(end)])
    order.append(end)
    print(f"  {'end':12} {tail['length']:5.1f}s")

    listing = work / "order.txt"
    listing.write_text("".join(f"file '{path}'\n" for path in order), encoding="utf-8")
    final = ROOT / output["file"]
    final.parent.mkdir(parents=True, exist_ok=True)

    if output["silent_audio"]:
        joined = work / "joined.mp4"
        run(["-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(joined)])
        run(["-i", str(joined), "-f", "lavfi",
             "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest",
             "-movflags", "+faststart", str(final)])
        joined.unlink()
    else:
        run(["-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy",
             "-movflags", "+faststart", str(final)])
    return final


def main(argv: list[str]) -> int:
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    stage = argv[0] if argv else "all"
    if stage not in ("all", "record", "cut"):
        print("usage: python3 run.py film [record|cut]", file=sys.stderr)
        return 2

    if stage == "record":
        record(config)
    elif stage == "all":
        clips = ROOT / config["record"]["dir"]
        missing = [s["id"] for s in config["shots"]
                   if not (clips / f"{s['id']}.mp4").is_file()]
        if missing:
            record(config, only=missing)

    final = cut(config)
    length = duration(final)
    print()
    print(f"{config['output']['file']}  "
          f"{int(length // 60)}:{length % 60:04.1f}  "
          f"{final.stat().st_size / 1e6:.1f} MB  "
          f"{config['output']['width']}x{config['output']['height']}")
    print("Silent. The voiceover and the music go on afterwards.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
