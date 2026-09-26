"""The film's text frames, drawn as images.

There is no drawtext filter in the ffmpeg that imageio-ffmpeg ships, so every
word that appears on screen is drawn here and composited by the overlay filter
instead. Drawing them rather than burning them in has a second benefit: a card
is a PNG with an alpha channel, so it can be faded independently of the
footage under it.

Figures are never literals. A card names a path into city.json and the value
is read when the frame is drawn, so the picture cannot outlive the number.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent


def font(style: dict, weight: str, size: int) -> ImageFont.FreeTypeFont:
    """The first font on this host from the candidates the config lists."""
    for candidate in style["font"][weight]:
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size)
    raise FileNotFoundError(
        f"no {weight} font found. film.yaml lists: "
        + ", ".join(style["font"][weight])
    )


def resolve(city: dict, path: str) -> str:
    """A dotted path into city.json, as the string the card will show."""
    value = city
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            raise KeyError(f"film.yaml asks for {path}, and city.json has no {part}")
        value = value[part]
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value)


def band(image: Image.Image, top: int, height: int, strength: int) -> None:
    """A backing band that fades out at both edges.

    Text over moving footage needs something behind it, and a hard-edged box
    reads as a caption bar. The band is darkest in the middle and reaches zero
    at its edges, so where it stops is not visible.
    """
    width = image.width
    strip = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(strip)
    for y in range(height):
        edge = min(y, height - 1 - y) / (height / 2)
        draw.line([(0, y), (width, y)], fill=(0, 0, 0, int(strength * min(1.0, edge * 1.6))))
    image.alpha_composite(strip, (0, top))


def lower_left(spec: dict, style: dict, size: tuple[int, int], _city: dict) -> Image.Image:
    """The opening title, set against the bottom third of the frame."""
    width, height = size
    card = Image.new("RGBA", size, (0, 0, 0, 0))
    band(card, int(height * 0.61), int(height * 0.30), int(255 * style["scrim"] * 0.82))
    draw = ImageDraw.Draw(card)
    left = int(width * 0.073)
    top = int(height * 0.676)
    draw.rectangle([left, top + 12, left + 8, top + 132], fill=tuple(style["red"]))
    draw.text((left + 48, top), spec["heading"], font=font(style, "Bold", 92),
              fill=tuple(style["white"]))
    draw.text((left + 52, top + 108), spec["sub"], font=font(style, "Regular", 34),
              fill=tuple(style["grey"]))
    return card


def figures(spec: dict, style: dict, size: tuple[int, int], city: dict) -> Image.Image:
    """A figure and its label, one row each, centred.

    Each row is centred as a unit rather than to a shared column, because a
    two-digit figure above a one-digit figure in a shared column leaves the
    labels ragged, which reads as a mistake.
    """
    width, height = size
    card = Image.new("RGBA", size, (0, 0, 0, 0))
    band(card, int(height * 0.296), int(height * 0.435), int(255 * style["scrim"] * 0.93))
    draw = ImageDraw.Draw(card)
    big, small = font(style, "Bold", 150), font(style, "Regular", 40)
    # The label sits on the figure's baseline, not at the top of its box.
    drop = big.getbbox("8")[3] - small.getbbox("8")[3]

    for index, row in enumerate(spec["rows"]):
        text = resolve(city, row["figure"])
        colour = tuple(style[row["colour"]])
        figure_width = draw.textlength(text, font=big)
        span = figure_width + 34 + draw.textlength(row["label"], font=small)
        left = (width - span) / 2
        top = int(height * 0.370) + index * 180
        draw.text((left, top), text, font=big, fill=colour)
        draw.text((left + figure_width + 34, top + drop), row["label"],
                  font=small, fill=tuple(style["grey"]))
    return card


def end(spec: dict, style: dict, size: tuple[int, int], _city: dict) -> Image.Image:
    """The closing frame. Opaque black, so it is a frame rather than an overlay."""
    width, height = size
    card = Image.new("RGBA", size, (0, 0, 0, 255))
    draw = ImageDraw.Draw(card)
    mark = Image.open(ROOT / spec["mark"]).convert("RGBA").resize((104, 104), Image.LANCZOS)
    card.alpha_composite(mark, (int(width / 2 - 52), int(height * 0.374)))
    for text, weight, points, colour, top in (
            (spec["heading"], "Bold", 84, style["white"], 0.507),
            (spec["sub"], "Regular", 36, style["grey"], 0.615)):
        face = font(style, weight, points)
        draw.text(((width - draw.textlength(text, font=face)) / 2, int(height * top)),
                  text, font=face, fill=tuple(colour))
    return card


LAYOUTS = {"lower-left": lower_left, "figures": figures, "end": end}


def render(config: dict, into: Path) -> dict[str, Path]:
    """Every card the cut refers to, written as a PNG."""
    city = json.loads((ROOT / "data" / "city.json").read_text(encoding="utf-8"))
    size = (config["output"]["width"], config["output"]["height"])
    into.mkdir(parents=True, exist_ok=True)

    wanted = {beat["card"] for beat in config["beats"] if beat.get("card")}
    wanted.add(config["end_card"]["card"])

    written = {}
    for name in sorted(wanted):
        spec = config["cards"][name]
        card = LAYOUTS[spec["layout"]](spec, config["style"], size, city)
        path = into / f"{name}.png"
        # The end frame is the picture itself and carries no transparency.
        card.convert("RGB" if spec["layout"] == "end" else "RGBA").save(path)
        written[name] = path
    return written
