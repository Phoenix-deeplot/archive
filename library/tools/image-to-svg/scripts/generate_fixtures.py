"""Create deterministic PNG inputs used to exercise the SVG demo.

The samples are deliberately small, original raster drawings. They do not
contain embedded SVG or external artwork, so the vectorizer sees only the PNG
pixels it is expected to reproduce.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable, Tuple

try:
    from PIL import Image, ImageDraw
except ImportError as error:  # pragma: no cover - depends on local setup
    raise SystemExit(
        "Pillow is required to generate the fixtures. Install it with: "
        "python -m pip install Pillow"
    ) from error


CANVAS_SIZE = 256
SUPERSAMPLE = 4
TRANSPARENT = (0, 0, 0, 0)
RESAMPLE = Image.Resampling.LANCZOS


def scale(value: int | float) -> int:
    """Scale a logical fixture coordinate to the antialiasing canvas."""
    return round(value * SUPERSAMPLE)


def rect(values: Iterable[int | float]) -> Tuple[int, int, int, int]:
    """Scale a Pillow rectangle/ellipse bounding box."""
    return tuple(scale(value) for value in values)  # type: ignore[return-value]


def blank() -> Image.Image:
    side = scale(CANVAS_SIZE)
    return Image.new("RGBA", (side, side), TRANSPARENT)


def finalise(image: Image.Image) -> Image.Image:
    """Downsample once, leaving antialiased alpha edges on a transparent canvas."""
    result = image.resize((CANVAS_SIZE, CANVAS_SIZE), RESAMPLE)
    # Some Pillow versions can leave an insignificant non-zero RGB triplet in
    # a fully transparent resampled pixel. Scrub it so transparent-pixel RGB
    # cannot accidentally influence a consumer that mishandles alpha.
    pixels = result.load()
    for y in range(CANVAS_SIZE):
        for x in range(CANVAS_SIZE):
            if pixels[x, y][3] == 0:
                pixels[x, y] = TRANSPARENT
    return result


def draw_solid_logo() -> Image.Image:
    """A low-colour, transparent logo with only opaque solid fills."""
    image = blank()
    draw = ImageDraw.Draw(image)

    # Three separated solid regions make this useful for contour extraction and
    # colour-quantisation checks.
    draw.rounded_rectangle(
        rect((33, 96, 223, 160)),
        radius=scale(32),
        fill=(30, 64, 175, 255),
    )
    draw.rounded_rectangle(
        rect((96, 33, 160, 223)),
        radius=scale(32),
        fill=(13, 148, 136, 255),
    )
    draw.ellipse(rect((169, 50, 207, 88)), fill=(251, 146, 60, 255))

    return finalise(image)


def draw_thin_line_knockout_icon() -> Image.Image:
    """A camera icon with true transparent lens/button knockouts and thin details."""
    image = blank()
    draw = ImageDraw.Draw(image)
    navy = (20, 37, 83, 255)
    cyan = (34, 211, 238, 255)

    # Opaque camera body and raised shutter housing.
    draw.rounded_rectangle(rect((35, 77, 221, 193)), radius=scale(22), fill=navy)
    draw.rounded_rectangle(rect((73, 55, 128, 82)), radius=scale(9), fill=navy)

    # The ring is filled first and then punched out. Its central hole is alpha=0,
    # not a white painted circle.
    draw.ellipse(rect((83, 86, 173, 176)), fill=cyan)
    draw.ellipse(rect((106, 109, 150, 153)), fill=TRANSPARENT)

    # A second knockout plus 3 px cyan linework exercise small contours/strokes.
    draw.rounded_rectangle(rect((178, 96, 199, 117)), radius=scale(5), fill=TRANSPARENT)
    line_width = scale(3)
    draw.line(
        [(scale(57), scale(105)), (scale(57), scale(166))],
        fill=cyan,
        width=line_width,
    )
    draw.line(
        [(scale(185), scale(151)), (scale(202), scale(151))],
        fill=cyan,
        width=line_width,
    )

    return finalise(image)


def draw_gradient_shape() -> Image.Image:
    """A single opaque rounded shape filled by a smooth diagonal RGB gradient."""
    image = blank()
    width, height = image.size
    gradient = Image.new("RGBA", (width, height), TRANSPARENT)
    pixels = gradient.load()

    # A deliberately simple linear gradient: violet at top-left to cyan at
    # bottom-right. Generate at the supersampled resolution so its boundary
    # receives the same antialiasing treatment as the other fixture shapes.
    start = (124, 58, 237)
    end = (6, 182, 212)
    denominator = max(1, (width - 1) + (height - 1))
    for y in range(height):
        for x in range(width):
            amount = (x + y) / denominator
            pixels[x, y] = tuple(
                round(channel_start + (channel_end - channel_start) * amount)
                for channel_start, channel_end in zip(start, end)
            ) + (255,)

    alpha = Image.new("L", (width, height), 0)
    alpha_draw = ImageDraw.Draw(alpha)
    alpha_draw.rounded_rectangle(
        rect((31, 62, 225, 194)), radius=scale(66), fill=255
    )
    gradient.putalpha(alpha)
    image.alpha_composite(gradient)

    return finalise(image)


def draw_opaque_jpeg() -> Image.Image:
    """A JPEG smoke input: the solid mark composited onto an opaque paper field."""
    image = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (248, 246, 239, 255))
    image.alpha_composite(draw_solid_logo())
    return image.convert("RGB")


def write_fixture(path: Path, image: Image.Image) -> None:
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        image.convert("RGB").save(path, format="JPEG", quality=95, subsampling=0, optimize=False)
        mode = "RGB JPEG"
    else:
        image.save(path, format="PNG", optimize=False)
        mode = "RGBA PNG"
    print(f"wrote {path.name}: {image.width}x{image.height} {mode}")


def main() -> None:
    default_output = Path(__file__).resolve().parents[1] / "test-fixtures"
    parser = argparse.ArgumentParser(
        description="Generate deterministic PNG inputs for the image-to-SVG demo."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=default_output,
        help=f"directory for generated PNGs (default: {default_output})",
    )
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    fixtures = {
        "01-transparent-solid-logo.png": draw_solid_logo(),
        "02-thin-line-knockout-icon.png": draw_thin_line_knockout_icon(),
        "03-transparent-gradient-shape.png": draw_gradient_shape(),
        "04-opaque-logo.jpg": draw_opaque_jpeg(),
    }
    for filename, image in fixtures.items():
        write_fixture(args.output_dir / filename, image)


if __name__ == "__main__":
    main()
